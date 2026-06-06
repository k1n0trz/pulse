// Learning route (Fase 9) — expose per-rule weights and trigger re-evaluation.

import type { FastifyPluginAsync } from "fastify";
import { evaluateLearning, listRuleWeights } from "../ai/learning.js";

export const learningRoutes: FastifyPluginAsync = async (app) => {
  app.get("/learning", async (req) => {
    const { organizationId } = await req.getAuth();
    return { ok: true, weights: await listRuleWeights(organizationId) };
  });

  app.post("/learning/evaluate", async (req) => {
    const { organizationId } = await req.getAuth();
    const result = await evaluateLearning(organizationId);
    return { ok: true, ...result };
  });
};
