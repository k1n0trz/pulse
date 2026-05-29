import type { FastifyPluginAsync } from "fastify";
import { getEntitlements } from "../lib/entitlements.js";

export const entitlementRoutes: FastifyPluginAsync = async (app) => {
  app.get("/entitlements", async (req) => {
    const { organizationId } = await req.getAuth();
    const ent = await getEntitlements(organizationId);
    return {
      ok: true,
      plan: { tier: ent.plan.tier, name: ent.plan.name, monthlyUsd: ent.plan.monthlyUsd, limits: ent.plan.limits },
      usage: ent.usage,
      can: ent.can
    };
  });
};
