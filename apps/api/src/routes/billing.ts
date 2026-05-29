import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type Stripe from "stripe";
import type { PlanTier, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../auth/context.js";
import { PLANS, planForPriceId } from "../lib/plans.js";
import {
  createBillingPortalSession,
  createCheckoutSession,
  constructWebhookEvent,
  isStripeConfigured
} from "../services/stripe.js";

const CheckoutBody = z.object({
  tier: z.enum(["SOLO", "AGENCY", "SCALE"])
});

export const billingRoutes: FastifyPluginAsync = async (app) => {
  // Public-ish: plan catalog + whether checkout is available.
  app.get("/billing/config", async () => ({
    configured: isStripeConfigured(),
    plans: Object.values(PLANS).map((p) => ({
      tier: p.tier,
      name: p.name,
      monthlyUsd: p.monthlyUsd,
      limits: p.limits,
      purchasable: Boolean(p.stripePriceId)
    }))
  }));

  app.get("/billing/status", async (req) => {
    const { organizationId } = await req.getAuth();
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true, stripeCustomerId: true }
    });
    return { ok: true, ...org, hasCustomer: Boolean(org.stripeCustomerId) };
  });

  app.post("/billing/checkout", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ADMIN");
    if (!isStripeConfigured()) return reply.code(503).send({ ok: false, error: "stripe_not_configured" });
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });

    const plan = PLANS[parsed.data.tier as PlanTier];
    if (!plan.stripePriceId) {
      return reply.code(400).send({ ok: false, error: "price_not_configured", message: `No Stripe price for ${plan.tier}` });
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });

    const { url, sessionId } = await createCheckoutSession({
      priceId: plan.stripePriceId,
      organizationId: org.id,
      customerEmail: auth.email,
      stripeCustomerId: org.stripeCustomerId
    });
    return { ok: true, url, sessionId };
  });

  app.post("/billing/portal", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ADMIN");
    if (!isStripeConfigured()) return reply.code(503).send({ ok: false, error: "stripe_not_configured" });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
    if (!org.stripeCustomerId) return reply.code(400).send({ ok: false, error: "no_customer" });
    const { url } = await createBillingPortalSession(org.stripeCustomerId);
    return { ok: true, url };
  });

  // Webhook — needs the raw body for signature verification, so it lives in an
  // encapsulated sub-plugin with a buffer content-type parser.
  app.register(async (instance) => {
    instance.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    instance.post("/billing/webhook", async (req, reply) => {
      const signature = req.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return reply.code(400).send({ ok: false, error: "missing_signature" });
      }
      let event: Stripe.Event;
      try {
        event = constructWebhookEvent(req.body as Buffer, signature);
      } catch (error) {
        app.log.warn({ err: (error as Error).message }, "Stripe webhook signature verification failed");
        return reply.code(400).send({ ok: false, error: "invalid_signature" });
      }

      try {
        await handleStripeEvent(event);
      } catch (error) {
        app.log.error({ err: error, type: event.type }, "Stripe webhook handler failed");
        return reply.code(500).send({ ok: false });
      }
      return { received: true };
    });
  });
};

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId ?? session.client_reference_id ?? undefined;
      if (!organizationId) return;
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined
        }
      });
      await audit(organizationId, "billing.checkout.completed", `Checkout completed`);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = sub.metadata?.organizationId;
      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId ? planForPriceId(priceId) : null;
      const where = organizationId ? { id: organizationId } : { stripeSubscriptionId: sub.id };
      await prisma.organization.updateMany({
        where,
        data: {
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          ...(plan ? { plan: plan.tier } : {}),
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          currentPeriodEnd: sub.items.data[0]?.current_period_end ? new Date(sub.items.data[0].current_period_end * 1000) : null
        }
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.organization.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { subscriptionStatus: "canceled", plan: "FREE" }
      });
      break;
    }
    default:
      break;
  }
}

async function audit(organizationId: string, type: string, message: string) {
  await prisma.auditEvent.create({
    data: { organizationId, type, severity: "INFO", message, metadata: {} as Prisma.InputJsonValue }
  });
}
