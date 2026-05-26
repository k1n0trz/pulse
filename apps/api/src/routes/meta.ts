import type { FastifyPluginAsync } from "fastify";
import { META_TOOLS, metaConnectorPrinciples } from "@pulse/shared";

// Stub endpoints for Fase 1 — they return the contract surface only.
// Real connector wiring (CLI / MCP / Marketing API) lands in Fase 1.
export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta/tools", async () => ({
    provider: "meta-ads-connectors",
    status: "stub",
    tools: Object.values(META_TOOLS),
    principles: metaConnectorPrinciples
  }));

  app.get("/meta/oauth/start", async (_req, reply) => {
    return reply.code(501).send({
      ok: false,
      error: "not_implemented",
      message: "Meta OAuth flow lands in Fase 1."
    });
  });

  app.get("/meta/oauth/callback", async (_req, reply) => {
    return reply.code(501).send({
      ok: false,
      error: "not_implemented",
      message: "Meta OAuth flow lands in Fase 1."
    });
  });
};
