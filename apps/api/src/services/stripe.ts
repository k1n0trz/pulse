// Stripe billing client — lazy. All helpers no-op / throw a typed error when
// STRIPE_SECRET_KEY is absent so the rest of the app keeps working in dev.

import Stripe from "stripe";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeNotConfiguredError();
  }
  if (!cached) {
    // Use the SDK's pinned API version (omit to avoid type drift across SDK upgrades).
    cached = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return cached;
}

export class StripeNotConfiguredError extends Error {
  statusCode = 503;
  code = "stripe_not_configured";
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY in .env (see docs/STRIPE_SETUP.md).");
    this.name = "StripeNotConfiguredError";
  }
}

export interface CreateCheckoutInput {
  priceId: string;
  organizationId: string;
  customerEmail: string;
  stripeCustomerId?: string | null;
  trialDays?: number;
}

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${env.BILLING_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.BILLING_CANCEL_URL,
    client_reference_id: input.organizationId,
    ...(input.stripeCustomerId ? { customer: input.stripeCustomerId } : { customer_email: input.customerEmail }),
    subscription_data: {
      trial_period_days: input.trialDays ?? 14,
      metadata: { organizationId: input.organizationId }
    },
    metadata: { organizationId: input.organizationId }
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

export async function createBillingPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: env.BILLING_SUCCESS_URL.replace(/\/billing\/success$/, "/billing")
  });
  return { url: session.url };
}

export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET not set");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
