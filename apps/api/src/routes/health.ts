import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/prisma.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    service: "pulse-api",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  }));

  app.get("/health/db", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: "reachable" };
    } catch (error) {
      app.log.error({ err: error }, "DB health check failed");
      return reply.code(503).send({ ok: false, db: "unreachable" });
    }
  });

  app.get("/", async () => ({
    name: "Pulse API",
    version: "0.1.0",
    docs: "/docs (coming in Fase 1)",
    health: "/health"
  }));
};
