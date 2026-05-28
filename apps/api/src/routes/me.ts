// Single-user dev shortcut. In Fase 3c (multi-tenant auth) this becomes
// session-derived — for now it returns/creates the "demo user" attached to
// the demo organization so the frontend can register a OneSignal identity.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const RegisterOneSignalBody = z.object({
  externalUserId: z.string().min(8).max(128)
});

const SetPreferenceBody = z.object({
  category: z.enum(["alert", "recommendation", "report", "system"]),
  channels: z.array(z.enum(["IN_APP", "PUSH", "EMAIL", "SMS"])).min(1)
});

async function defaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) throw new Error("Demo organization not found. Run `pnpm db:seed`.");
  return org.id;
}

async function getOrCreateDemoUser() {
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "demo" } });
  let user = await prisma.user.findUnique({ where: { email: "demo@pulse.local" } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: "demo@pulse.local", name: "Demo Operator" }
    });
    await prisma.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "OWNER", acceptedAt: new Date() }
    });
  }
  return { user, org };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async () => {
    const { user, org } = await getOrCreateDemoUser();
    const preferences = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        oneSignalExternalId: user.oneSignalExternalId
      },
      organization: { id: org.id, slug: org.slug, name: org.name },
      preferences
    };
  });

  app.post("/me/onesignal", async (req, reply) => {
    const parsed = RegisterOneSignalBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const { user } = await getOrCreateDemoUser();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { oneSignalExternalId: parsed.data.externalUserId }
    });
    return { ok: true, oneSignalExternalId: updated.oneSignalExternalId };
  });

  app.post("/me/preferences", async (req, reply) => {
    const parsed = SetPreferenceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const { user } = await getOrCreateDemoUser();
    const updated = await prisma.notificationPreference.upsert({
      where: { userId_category: { userId: user.id, category: parsed.data.category } },
      create: { userId: user.id, category: parsed.data.category, channels: parsed.data.channels },
      update: { channels: parsed.data.channels }
    });
    return { ok: true, preference: updated };
  });
};

// Re-export the helper for tests
export { getOrCreateDemoUser, defaultOrgId };
