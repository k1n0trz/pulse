import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const ListQuery = z.object({
  type: z.string().optional(),
  severity: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/audit-events", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();
    const events = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        ...(parsed.data.type ? { type: { contains: parsed.data.type } } : {}),
        ...(parsed.data.severity ? { severity: parsed.data.severity } : {}),
        ...(parsed.data.since ? { createdAt: { gte: new Date(parsed.data.since) } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit
    });
    return { ok: true, organizationId, count: events.length, events };
  });
};
