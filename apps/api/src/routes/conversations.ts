// Chat conversation history (Fase 5) — list / create / read / rename / delete.
// Scoped to the authenticated user within their organization.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const TitleBody = z.object({ title: z.string().min(1).max(120) });

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/conversations", async (req) => {
    const { organizationId, userId } = await req.getAuth();
    const conversations = await prisma.conversation.findMany({
      where: { organizationId, userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } }
    });
    return {
      ok: true,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages
      }))
    };
  });

  app.post("/conversations", async (req) => {
    const { organizationId, userId } = await req.getAuth();
    const title = (req.body as { title?: string } | null)?.title?.slice(0, 120) || "Nueva conversación";
    const conversation = await prisma.conversation.create({
      data: { organizationId, userId, title }
    });
    return { ok: true, conversation: { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, messageCount: 0 } };
  });

  app.get("/conversations/:id", async (req, reply) => {
    const { organizationId, userId } = await req.getAuth();
    const id = (req.params as { id: string }).id;
    const conversation = await prisma.conversation.findFirst({ where: { id, organizationId, userId } });
    if (!conversation) return reply.code(404).send({ ok: false, error: "not_found" });
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" }
    });
    return {
      ok: true,
      conversation: { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments ?? [],
        toolEvents: m.toolEvents ?? [],
        createdAt: m.createdAt
      }))
    };
  });

  app.patch("/conversations/:id", async (req, reply) => {
    const { organizationId, userId } = await req.getAuth();
    const id = (req.params as { id: string }).id;
    const parsed = TitleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const result = await prisma.conversation.updateMany({
      where: { id, organizationId, userId },
      data: { title: parsed.data.title }
    });
    if (result.count === 0) return reply.code(404).send({ ok: false, error: "not_found" });
    return { ok: true };
  });

  app.delete("/conversations/:id", async (req, reply) => {
    const { organizationId, userId } = await req.getAuth();
    const id = (req.params as { id: string }).id;
    const result = await prisma.conversation.deleteMany({ where: { id, organizationId, userId } });
    if (result.count === 0) return reply.code(404).send({ ok: false, error: "not_found" });
    return { ok: true };
  });
};
