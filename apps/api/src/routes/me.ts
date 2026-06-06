// Current-user endpoints. Identity is resolved by the auth plugin
// (demo user without Clerk; real Clerk user when configured).

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { isSuperadmin } from "../lib/superadmin.js";

const RegisterOneSignalBody = z.object({
  externalUserId: z.string().min(8).max(128)
});

const SetPreferenceBody = z.object({
  category: z.enum(["alert", "recommendation", "report", "system"]),
  channels: z.array(z.enum(["IN_APP", "PUSH", "EMAIL", "SMS"])).min(1)
});

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (req) => {
    const auth = await req.getAuth();
    const [user, org, preferences] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }),
      prisma.notificationPreference.findMany({ where: { userId: auth.userId } })
    ]);
    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        oneSignalExternalId: user.oneSignalExternalId,
        isSuperadmin: isSuperadmin(user.email)
      },
      organization: { id: org.id, slug: org.slug, name: org.name },
      role: auth.role,
      authSource: auth.source,
      preferences
    };
  });

  app.post("/me/onesignal", async (req, reply) => {
    const auth = await req.getAuth();
    const parsed = RegisterOneSignalBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { oneSignalExternalId: parsed.data.externalUserId }
    });
    return { ok: true, oneSignalExternalId: updated.oneSignalExternalId };
  });

  app.post("/me/preferences", async (req, reply) => {
    const auth = await req.getAuth();
    const parsed = SetPreferenceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const updated = await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: auth.userId, category: parsed.data.category } },
      create: { userId: auth.userId, category: parsed.data.category, channels: parsed.data.channels },
      update: { channels: parsed.data.channels }
    });
    return { ok: true, preference: updated };
  });
};
