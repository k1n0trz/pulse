// Plan entitlements — resolves what an organization is allowed to do based on
// its plan, plus current usage. Routes call the assert* helpers to enforce.
//
// Superadmins (SUPERADMIN_EMAILS, e.g. kinotrance@gmail.com) bypass every limit
// and are always treated as having an active SCALE subscription.

import { prisma } from "../db/prisma.js";
import { planByTier, type PlanDef } from "./plans.js";
import { isSuperadmin } from "./superadmin.js";

export interface Entitlements {
  plan: PlanDef;
  usage: {
    adAccounts: number;
    users: number;
  };
  can: {
    addAdAccount: boolean;
    addUser: boolean;
    useAutopilot: boolean;
    whiteLabelReports: boolean;
    apiAccess: boolean;
  };
  superadmin: boolean;
}

export async function getEntitlements(organizationId: string, email?: string | null): Promise<Entitlements> {
  const superadmin = isSuperadmin(email);

  const [org, adAccounts, users] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } }),
    prisma.metaAdAccount.count({ where: { organizationId, enabled: true } }),
    prisma.membership.count({ where: { organizationId } })
  ]);

  // Superadmins are always on SCALE with everything unlocked.
  const plan = superadmin ? planByTier("SCALE") : planByTier(org.plan);
  const underLimit = (count: number, max: number) => superadmin || max === -1 || count < max;

  return {
    plan,
    usage: { adAccounts, users },
    can: {
      addAdAccount: underLimit(adAccounts, plan.limits.maxAdAccounts),
      addUser: underLimit(users, plan.limits.maxUsers),
      useAutopilot: superadmin || plan.limits.autopilot,
      whiteLabelReports: superadmin || plan.limits.whiteLabelReports,
      apiAccess: superadmin || plan.limits.apiAccess
    },
    superadmin
  };
}

/**
 * Whether the organization currently has access to paid features.
 * True when: superadmin, an active/trialing subscription, or a non-FREE plan
 * without an explicit cancelled status (keeps single-tenant demo orgs usable).
 */
export async function hasActiveSubscription(organizationId: string, email?: string | null): Promise<boolean> {
  if (isSuperadmin(email)) return true;
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true, subscriptionStatus: true, currentPeriodEnd: true }
  });
  return isSubscriptionActive(org);
}

export function isSubscriptionActive(org: {
  plan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
}): boolean {
  const status = org.subscriptionStatus;
  if (status === "active" || status === "trialing" || status === "authorized") {
    // If we know the period end, make sure it hasn't lapsed.
    if (org.currentPeriodEnd && org.currentPeriodEnd.getTime() < Date.now()) return false;
    return true;
  }
  // Non-FREE plan with no explicit cancellation -> treat as active (demo / seeded orgs).
  if (org.plan !== "FREE" && (status === null || status === undefined)) return true;
  return false;
}

export class PlanLimitError extends Error {
  statusCode = 402; // Payment Required
  code = "plan_limit";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export class SubscriptionRequiredError extends Error {
  statusCode = 402; // Payment Required
  code = "subscription_required";
  constructor(message = "Se requiere una suscripción activa para usar esta función.") {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

export async function assertActiveSubscription(organizationId: string, email?: string | null): Promise<void> {
  if (!(await hasActiveSubscription(organizationId, email))) {
    throw new SubscriptionRequiredError();
  }
}

export async function assertAutopilotAllowed(organizationId: string, email?: string | null): Promise<void> {
  const ent = await getEntitlements(organizationId, email);
  if (!ent.can.useAutopilot) {
    throw new PlanLimitError(`Autopilot requiere plan Agency o superior (actual: ${ent.plan.name}).`);
  }
}

export async function assertCanAddAdAccount(organizationId: string, email?: string | null): Promise<void> {
  const ent = await getEntitlements(organizationId, email);
  if (!ent.can.addAdAccount) {
    throw new PlanLimitError(
      `Tu plan ${ent.plan.name} permite ${ent.plan.limits.maxAdAccounts} cuenta(s). Sube de plan para conectar más.`
    );
  }
}
