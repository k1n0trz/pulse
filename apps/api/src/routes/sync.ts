import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { syncAdAccounts, syncAllForConnection, syncCampaigns } from "../meta/sync.js";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../auth/context.js";

const SyncConnectionBody = z.object({
  datePreset: z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d"]).optional()
});

const SyncAccountBody = z.object({
  datePreset: z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d"]).optional()
});

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post("/connections/:id/sync", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    const { id } = req.params as { id: string };
    const owned = await prisma.metaConnection.findFirst({ where: { id, organizationId: auth.organizationId }, select: { id: true } });
    if (!owned) return reply.code(404).send({ ok: false, error: "not_found" });
    const parsed = SyncConnectionBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    try {
      const result = await syncAllForConnection(id, parsed.data);
      return { ok: true, result };
    } catch (error) {
      app.log.error({ err: error, connectionId: id }, "Sync failed");
      return reply.code(500).send({ ok: false, error: "sync_failed", message: (error as Error).message });
    }
  });

  app.post("/connections/:id/sync/accounts", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    const { id } = req.params as { id: string };
    const owned = await prisma.metaConnection.findFirst({ where: { id, organizationId: auth.organizationId }, select: { id: true } });
    if (!owned) return reply.code(404).send({ ok: false, error: "not_found" });
    try {
      const result = await syncAdAccounts(id);
      return { ok: true, result };
    } catch (error) {
      app.log.error({ err: error, connectionId: id }, "syncAdAccounts failed");
      return reply.code(500).send({ ok: false, error: "sync_accounts_failed", message: (error as Error).message });
    }
  });

  app.post("/accounts/:id/sync", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    const { id } = req.params as { id: string };
    const owned = await prisma.metaAdAccount.findFirst({ where: { id, organizationId: auth.organizationId }, select: { id: true } });
    if (!owned) return reply.code(404).send({ ok: false, error: "not_found" });
    const parsed = SyncAccountBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    try {
      const result = await syncCampaigns(id, parsed.data);
      return { ok: true, result };
    } catch (error) {
      app.log.error({ err: error, accountId: id }, "syncCampaigns failed");
      return reply.code(500).send({ ok: false, error: "sync_campaigns_failed", message: (error as Error).message });
    }
  });
};
