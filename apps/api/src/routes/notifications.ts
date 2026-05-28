import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

const ListQuery = z.object({
  organizationId: z.string().optional(),
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

async function defaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) throw new Error("Demo organization not found. Run `pnpm db:seed`.");
  return org.id;
}

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
    const organizationId = parsed.data.organizationId ?? (await defaultOrgId());
    const notifications = await prisma.notification.findMany({
      where: { organizationId, ...(parsed.data.unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit
    });
    return { ok: true, organizationId, count: notifications.length, notifications };
  });

  app.post("/notifications/:id/read", async (req, reply) => {
    void reply;
    const { id } = req.params as { id: string };
    const updated = await prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true, notification: updated };
  });

  app.post("/notifications/read-all", async (req, reply) => {
    const Body = z.object({ organizationId: z.string().optional() });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const organizationId = parsed.data.organizationId ?? (await defaultOrgId());
    const result = await prisma.notification.updateMany({
      where: { organizationId, read: false },
      data: { read: true }
    });
    return { ok: true, updated: result.count };
  });
};
