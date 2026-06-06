// Competitive intelligence route (Fase 6) — Meta Ad Library search.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { searchCompetitorAds } from "../meta/adLibrary.js";
import { assertActiveSubscription } from "../lib/entitlements.js";

const Query = z.object({
  q: z.string().min(2).max(100),
  country: z.string().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export const competitiveRoutes: FastifyPluginAsync = async (app) => {
  app.get("/competitive/ads", async (req, reply) => {
    const auth = await req.getAuth();
    await assertActiveSubscription(auth.organizationId, auth.email);
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });

    const result = await searchCompetitorAds({
      organizationId: auth.organizationId,
      searchTerms: parsed.data.q,
      country: parsed.data.country,
      limit: parsed.data.limit
    });
    return { ok: true, ...result };
  });
};
