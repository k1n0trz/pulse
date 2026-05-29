import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

const ListQuery = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/notifications/config", async () => ({
    onesignal: {
      configured: Boolean(env.ONESIGNAL_APP_ID),
      appId: env.ONESIGNAL_APP_ID ?? null
    }
  }));

  app.get("/notifications", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();
    const notifications = await prisma.notification.findMany({
      where: { organizationId, ...(parsed.data.unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit
    });
    return { ok: true, organizationId, count: notifications.length, notifications };
  });

  app.post("/notifications/:id/read", async (req) => {
    const { organizationId } = await req.getAuth();
    const { id } = req.params as { id: string };
    // Scope the update to the caller's org to prevent cross-tenant writes.
    const result = await prisma.notification.updateMany({ where: { id, organizationId }, data: { read: true } });
    return { ok: true, updated: result.count };
  });

  app.post("/notifications/read-all", async (req) => {
    const { organizationId } = await req.getAuth();
    const result = await prisma.notification.updateMany({
      where: { organizationId, read: false },
      data: { read: true }
    });
    return { ok: true, updated: result.count };
  });
};
