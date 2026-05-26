import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { revokeConnection } from "../meta/oauth.js";

const ListQuery = z.object({
  organizationId: z.string().optional()
});

export const connectionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/connections", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });

    const organizationId = parsed.data.organizationId ?? (await defaultOrgId());

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
    const { id } = req.params as { id: string };
    const connection = await prisma.metaConnection.findUnique({
      where: { id },
      include: { accounts: true }
    });
    if (!connection) return reply.code(404).send({ ok: false, error: "not_found" });
    const { accessTokenEnc: _a, refreshTokenEnc: _r, ...safe } = connection;
    void _a; void _r;
    return { ok: true, connection: safe };
  });

  app.delete("/connections/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await revokeConnection(id);
      return { ok: true };
    } catch (error) {
      app.log.error({ err: error, id }, "revokeConnection failed");
      return reply.code(500).send({ ok: false, error: "revoke_failed", message: (error as Error).message });
    }
  });
};

async function defaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) throw new Error("Demo organization not found. Run `pnpm db:seed`.");
  return org.id;
}
