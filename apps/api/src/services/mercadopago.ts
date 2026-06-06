// MercadoPago billing client — lazy + dependency-free (uses the REST API via fetch).
// Uses **Checkout Pro** (payment preferences), the flow this project already runs
// in production. Each preference carries its own notification_url, so no webhook
// needs to be configured in the MercadoPago dashboard.
//
// Subscriptions are modelled as monthly Checkout Pro payments: an approved payment
// grants the plan for one month (currentPeriodEnd = +1 month). Charges are in USD.
// See docs/temporal/mercadopago.txt for the production credentials (kept out of git).

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "../lib/env.js";
import { PLANS, type PlanDef } from "../lib/plans.js";

const env = loadEnv();
const MP_API = "https://api.mercadopago.com";

export function isMercadoPagoConfigured(): boolean {
  return Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
}

export class MercadoPagoNotConfiguredError extends Error {
  statusCode = 503;
  code = "mercadopago_not_configured";
  constructor() {
    super("MercadoPago is not configured. Set MERCADOPAGO_ACCESS_TOKEN in .env.");
    this.name = "MercadoPagoNotConfiguredError";
  }
}

async function mpFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new MercadoPagoNotConfiguredError();
  const { idempotencyKey, ...rest } = init;
  const res = await fetch(`${MP_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...(rest.headers ?? {})
    }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`MercadoPago API ${res.status}: ${message}`);
  }
  return body as T;
}

interface MpPreference {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export interface MpPayment {
  id: number;
  status: "approved" | "pending" | "authorized" | "in_process" | "rejected" | "cancelled" | "refunded" | "charged_back";
  external_reference?: string;
  payer?: { email?: string };
  transaction_amount?: number;
  currency_id?: string;
}

export interface CreateMpCheckoutInput {
  tier: "SOLO" | "AGENCY" | "SCALE";
  organizationId: string;
  payerEmail: string;
}

/**
 * Creates a MercadoPago Checkout Pro preference for one monthly payment and
 * returns the hosted checkout URL (init_point). The plan + org are encoded in
 * external_reference so the webhook can grant access on approval.
 */
export async function createMercadoPagoCheckout(
  input: CreateMpCheckoutInput
): Promise<{ url: string; preferenceId: string }> {
  const plan: PlanDef = PLANS[input.tier];
  const externalReference = `${input.organizationId}:${input.tier}`;

  const body: Record<string, unknown> = {
    items: [
      {
        id: `pulse-${plan.tier.toLowerCase()}`,
        title: `Pulse ${plan.name} — 1 mes`,
        quantity: 1,
        unit_price: plan.monthlyUsd,
        currency_id: env.MERCADOPAGO_CURRENCY
      }
    ],
    payer: { email: input.payerEmail },
    external_reference: externalReference,
    metadata: { organization_id: input.organizationId, tier: input.tier },
    back_urls: {
      success: env.BILLING_SUCCESS_URL,
      failure: env.BILLING_CANCEL_URL,
      pending: env.BILLING_SUCCESS_URL
    },
    auto_return: "approved",
    // Per-preference webhook — no dashboard config needed.
    ...(env.API_PUBLIC_URL ? { notification_url: `${env.API_PUBLIC_URL}/v1/billing/mercadopago/webhook` } : {})
  };

  const pref = await mpFetch<MpPreference>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: randomUUID()
  });

  const url = pref.init_point ?? pref.sandbox_init_point;
  if (!url) throw new Error("MercadoPago did not return an init_point URL");
  return { url, preferenceId: pref.id };
}

export function getPayment(id: string): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${id}`, { method: "GET" });
}

/**
 * Verifies a MercadoPago webhook signature. MP sends `x-signature: ts=...,v1=...`
 * and `x-request-id`; the signed manifest is `id:<dataId>;request-id:<reqId>;ts:<ts>;`.
 * Returns true when MERCADOPAGO_WEBHOOK_SECRET is unset (verification disabled).
 */
export function verifyWebhookSignature(params: {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}): boolean {
  const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // verification disabled
  if (!params.signatureHeader || !params.dataId) return false;

  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string])
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

/** Maps a MercadoPago payment status to our internal subscriptionStatus. */
export function mapPaymentStatus(status: MpPayment["status"]): string {
  switch (status) {
    case "approved":
    case "authorized":
      return "active";
    case "pending":
    case "in_process":
      return "incomplete";
    case "refunded":
    case "charged_back":
    case "cancelled":
    case "rejected":
      return "canceled";
    default:
      return "incomplete";
  }
}
