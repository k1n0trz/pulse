// Plan entitlements — resolves what an organization is allowed to do based on
// its plan, plus current usage. Routes call the assert* helpers to enforce.

import { prisma } from "../db/prisma.js";
import { planByTier, type PlanDef } from "./plans.js";

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
}

export async function getEntitlements(organizationId: string): Promise<Entitlements> {
  const [org, adAccounts, users] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } }),
    prisma.metaAdAccount.count({ where: { organizationId, enabled: true } }),
    prisma.membership.count({ where: { organizationId } })
  ]);

  const plan = planByTier(org.plan);
  const underLimit = (count: number, max: number) => max === -1 || count < max;

  return {
    plan,
    usage: { adAccounts, users },
    can: {
      addAdAccount: underLimit(adAccounts, plan.limits.maxAdAccounts),
      addUser: underLimit(users, plan.limits.maxUsers),
      useAutopilot: plan.limits.autopilot,
      whiteLabelReports: plan.limits.whiteLabelReports,
      apiAccess: plan.limits.apiAccess
    }
  };
}

export class PlanLimitError extends Error {
  statusCode = 402; // Payment Required
  code = "plan_limit";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function assertAutopilotAllowed(organizationId: string): Promise<void> {
  const ent = await getEntitlements(organizationId);
  if (!ent.can.useAutopilot) {
    throw new PlanLimitError(`Autopilot requiere plan Agency o superior (actual: ${ent.plan.name}).`);
  }
}

export async function assertCanAddAdAccount(organizationId: string): Promise<void> {
  const ent = await getEntitlements(organizationId);
  if (!ent.can.addAdAccount) {
    throw new PlanLimitError(
      `Tu plan ${ent.plan.name} permite ${ent.plan.limits.maxAdAccounts} cuenta(s). Sube de plan para conectar más.`
    );
  }
}
