import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type Stripe from "stripe";
import type { PlanTier, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../auth/context.js";
import { PLANS, planForPriceId } from "../lib/plans.js";
import { isSuperadmin } from "../lib/superadmin.js";
import { isSubscriptionActive } from "../lib/entitlements.js";
import {
  createBillingPortalSession,
  createCheckoutSession,
  constructWebhookEvent,
  isStripeConfigured
} from "../services/stripe.js";
import {
  createMercadoPagoCheckout,
  getPayment,
  isMercadoPagoConfigured,
  mapPaymentStatus,
  verifyWebhookSignature
} from "../services/mercadopago.js";

const CheckoutBody = z.object({
  tier: z.enum(["SOLO", "AGENCY", "SCALE"])
});

export const billingRoutes: FastifyPluginAsync = async (app) => {
  // Public-ish: plan catalog + which payment providers are available.
  app.get("/billing/config", async () => ({
    configured: isStripeConfigured() || isMercadoPagoConfigured(),
    providers: {
      stripe: isStripeConfigured(),
      mercadopago: isMercadoPagoConfigured()
    },
    plans: Object.values(PLANS).map((p) => ({
      tier: p.tier,
      name: p.name,
      monthlyUsd: p.monthlyUsd,
      limits: p.limits,
      purchasable: Boolean(p.stripePriceId) || isMercadoPagoConfigured()
    }))
  }));

  app.get("/billing/status", async (req) => {
    const { organizationId, email } = await req.getAuth();
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
        paymentProvider: true
      }
    });
    const superadmin = isSuperadmin(email);
    const active = superadmin || isSubscriptionActive(org);
    return {
      ok: true,
      ...org,
      hasCustomer: Boolean(org.stripeCustomerId),
      isSuperadmin: superadmin,
      active
    };
  });

  // ---------- Stripe ----------

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

  // ---------- MercadoPago ----------

  app.post("/billing/mercadopago/checkout", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ADMIN");
    if (!isMercadoPagoConfigured()) return reply.code(503).send({ ok: false, error: "mercadopago_not_configured" });
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });

    const { url, preferenceId } = await createMercadoPagoCheckout({
      tier: parsed.data.tier,
      organizationId: auth.organizationId,
      payerEmail: auth.email
    });

    // Mark intent — the webhook grants access once the payment is approved.
    // Correlation happens via external_reference (organizationId:tier) on the payment.
    await prisma.organization.update({
      where: { id: auth.organizationId },
      data: { mpPayerEmail: auth.email, paymentProvider: "mercadopago" }
    });

    return { ok: true, url, preferenceId };
  });

  // ---------- Webhooks ----------

  // Stripe webhook — needs the raw body for signature verification, so it lives
  // in an encapsulated sub-plugin with a buffer content-type parser.
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

  // MercadoPago webhook (Checkout Pro) — JSON body { type/topic, data: { id } }
  // (id may also arrive as ?data.id= / ?id= / ?topic= query params). Signature is
  // over a manifest, not the body. notification_url is set per-preference.
  app.post("/billing/mercadopago/webhook", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const body = (req.body ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: string } };
    const type = body.type ?? body.topic ?? query.type ?? query.topic;
    const dataId = body.data?.id ?? query["data.id"] ?? query.id;

    const ok = verifyWebhookSignature({
      signatureHeader: req.headers["x-signature"] as string | undefined,
      requestId: req.headers["x-request-id"] as string | undefined,
      dataId
    });
    if (!ok) {
      app.log.warn("MercadoPago webhook signature verification failed");
      return reply.code(401).send({ ok: false, error: "invalid_signature" });
    }

    if (!dataId || type !== "payment") {
      // Ignore unrelated topics (merchant_order, plan, etc.) — ack so MP stops retrying.
      return { received: true };
    }

    try {
      await handleMpPayment(dataId);
    } catch (error) {
      app.log.error({ err: error, dataId }, "MercadoPago webhook handler failed");
      return reply.code(500).send({ ok: false });
    }
    return { received: true };
  });
};

async function handleMpPayment(paymentId: string) {
  const payment = await getPayment(paymentId);

  // organizationId:tier encoded in external_reference at checkout time.
  const [organizationId, tier] = (payment.external_reference ?? "").split(":");
  if (!organizationId) return;

  const status = mapPaymentStatus(payment.status);
  const isPaid = status === "active";

  // Checkout Pro is one payment = one month. Grant the plan until +1 month.
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const data: Prisma.OrganizationUpdateManyMutationInput = {
    paymentProvider: "mercadopago",
    subscriptionStatus: status,
    mpPreapprovalId: String(payment.id),
    ...(payment.payer?.email ? { mpPayerEmail: payment.payer.email } : {}),
    ...(isPaid && tier ? { plan: tier as PlanTier, currentPeriodEnd: periodEnd } : {}),
    ...(status === "canceled" ? { plan: "FREE" as PlanTier } : {})
  };

  await prisma.organization.updateMany({ where: { id: organizationId }, data });
  await audit(organizationId, "billing.mercadopago.payment", `MercadoPago payment ${payment.status}`);
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId ?? session.client_reference_id ?? undefined;
      if (!organizationId) return;
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          paymentProvider: "stripe",
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
