// Plan catalog — single source of truth for entitlements + Stripe price mapping.
// Stripe price IDs come from env so the same code works in test/live.

import type { PlanTier } from "@prisma/client";
import { loadEnv } from "./env.js";

const env = loadEnv();

export interface PlanDef {
  tier: PlanTier;
  name: string;
  monthlyUsd: number;
  stripePriceId?: string;
  limits: {
    maxAdAccounts: number; // -1 = unlimited
    maxUsers: number;
    autopilot: boolean;
    whiteLabelReports: boolean;
    apiAccess: boolean;
  };
}

export const PLANS: Record<PlanTier, PlanDef> = {
  FREE: {
    tier: "FREE",
    name: "Free / Trial",
    monthlyUsd: 0,
    limits: { maxAdAccounts: 1, maxUsers: 1, autopilot: false, whiteLabelReports: false, apiAccess: false }
  },
  SOLO: {
    tier: "SOLO",
    name: "Solo",
    monthlyUsd: 49,
    stripePriceId: env.STRIPE_PRICE_SOLO,
    limits: { maxAdAccounts: 1, maxUsers: 1, autopilot: false, whiteLabelReports: true, apiAccess: false }
  },
  AGENCY: {
    tier: "AGENCY",
    name: "Agency",
    monthlyUsd: 199,
    stripePriceId: env.STRIPE_PRICE_AGENCY,
    limits: { maxAdAccounts: 10, maxUsers: 5, autopilot: true, whiteLabelReports: true, apiAccess: false }
  },
  SCALE: {
    tier: "SCALE",
    name: "Scale",
    monthlyUsd: 499,
    stripePriceId: env.STRIPE_PRICE_SCALE,
    limits: { maxAdAccounts: -1, maxUsers: -1, autopilot: true, whiteLabelReports: true, apiAccess: true }
  }
};

export function planForPriceId(priceId: string): PlanDef | null {
  return Object.values(PLANS).find((p) => p.stripePriceId && p.stripePriceId === priceId) ?? null;
}

export function planByTier(tier: PlanTier): PlanDef {
  return PLANS[tier];
}
