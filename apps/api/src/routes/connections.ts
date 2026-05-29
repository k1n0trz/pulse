import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { importExistingToken, revokeConnection } from "../meta/oauth.js";
import { requireRole } from "../auth/context.js";

export const connectionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/connections", async (req) => {
    const { organizationId } = await req.getAuth();

    const connections = await prisma.metaConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        metaUserId: true,
        scopeTier: true,
        status: true,
        tokenExpiresAt: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
        accounts: {
          select: {
            id: true,
            metaAccountId: true,
            name: true,
            currency: true,
            timezoneName: true,
            status: true,
            enabled: true,
            lastSyncAt: true
          }
        }
      }
    });

    return { ok: true, organizationId, connections };
  });

  app.get("/connections/:id", async (req, reply) => {
    const { organizationId } = await req.getAuth();
    const { id } = req.params as { id: string };
    const connection = await prisma.metaConnection.findFirst({
      where: { id, organizationId },
      include: { accounts: true }
    });
    if (!connection) return reply.code(404).send({ ok: false, error: "not_found" });
    const { accessTokenEnc: _a, refreshTokenEnc: _r, ...safe } = connection;
    void _a; void _r;
    return { ok: true, connection: safe };
  });

  const ImportBody = z.object({
    accessToken: z.string().min(20)
  });

  app.post("/connections/import", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ADMIN");
    const parsed = ImportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    try {
      const result = await importExistingToken({ accessToken: parsed.data.accessToken, organizationId: auth.organizationId });
      return { ok: true, ...result };
    } catch (error) {
      app.log.error({ err: error }, "Token import failed");
      return reply.code(400).send({ ok: false, error: "import_failed", message: (error as Error).message });
    }
  });

  app.delete("/connections/:id", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ADMIN");
    const { id } = req.params as { id: string };
    const owned = await prisma.metaConnection.findFirst({ where: { id, organizationId: auth.organizationId }, select: { id: true } });
    if (!owned) return reply.code(404).send({ ok: false, error: "not_found" });
    try {
      await revokeConnection(id);
      return { ok: true };
    } catch (error) {
      app.log.error({ err: error, id }, "revokeConnection failed");
      return reply.code(500).send({ ok: false, error: "revoke_failed", message: (error as Error).message });
    }
  });
};
