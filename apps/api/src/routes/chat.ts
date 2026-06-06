import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { OperationMode, AutopilotPolicy } from "@pulse/shared";
import type { Prisma } from "@prisma/client";
import { isAnthropicConfigured } from "../ai/anthropicClient.js";
import { runAgent, type AgentEvent, type ChatMessageInput } from "../ai/agent.js";
import { getRuleWeights } from "../ai/learning.js";
import { assertAutopilotAllowed } from "../lib/entitlements.js";
import { prisma } from "../db/prisma.js";

const Attachment = z.object({
  kind: z.enum(["image", "document"]),
  mediaType: z.string().min(3).max(100),
  data: z.string().min(1).max(14_000_000), // base64; ~10 MB binary
  name: z.string().max(200).optional()
});

const ChatBody = z.object({
  mode: z.enum(["read", "assisted", "autopilot"]).default("read"),
  conversationId: z.string().optional(),
  policy: z
    .object({
      targetCpa: z.number().positive(),
      targetRoas: z.number().positive(),
      maxDailyBudgetIncreasePercent: z.number().int().min(0).max(100),
      maxDailySpend: z.number().nonnegative(),
      maxDailyChanges: z.number().int().min(0).max(100),
      killSwitch: z.boolean(),
      blockedCriticalCampaigns: z.boolean()
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
        attachments: z.array(Attachment).max(6).optional()
      })
    )
    .min(1)
    .max(40),
  stream: z.boolean().default(true)
});

/** Lightweight attachment descriptors persisted with the message (no base64 blob). */
function attachmentMeta(attachments?: Array<{ kind: string; mediaType: string; name?: string }>) {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((a) => ({ kind: a.kind, mediaType: a.mediaType, name: a.name ?? null }));
}

async function resolvePolicy(organizationId: string, provided?: AutopilotPolicy): Promise<AutopilotPolicy> {
  if (provided) return provided;
  const policy = await prisma.policy.findFirst({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  if (policy) {
    return {
      targetCpa: Number(policy.targetCpa),
      targetRoas: Number(policy.targetRoas),
      maxDailyBudgetIncreasePercent: policy.maxDailyBudgetIncreasePercent,
      maxDailySpend: Number(policy.maxDailySpend),
      maxDailyChanges: policy.maxDailyChanges,
      killSwitch: policy.killSwitch,
      blockedCriticalCampaigns: policy.blockedCriticalCampaigns
    };
  }
  return {
    targetCpa: 300,
    targetRoas: 3,
    maxDailyBudgetIncreasePercent: 20,
    maxDailySpend: 200000,
    maxDailyChanges: 8,
    killSwitch: false,
    blockedCriticalCampaigns: true
  };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.get("/ai/config", async () => ({
    configured: isAnthropicConfigured(),
    model: "claude-opus-4-7"
  }));

  app.post("/chat", async (req, reply) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", issues: parsed.error.issues });

    if (!isAnthropicConfigured()) {
      return reply
        .code(503)
        .send({ ok: false, error: "anthropic_not_configured", message: "Set ANTHROPIC_API_KEY in .env to enable the AI brain (Fase 2)." });
    }

    const { organizationId, userId, email } = await req.getAuth();
    const mode = parsed.data.mode as OperationMode;

    if (mode === "autopilot") {
      try {
        await assertAutopilotAllowed(organizationId, email);
      } catch (error) {
        return reply.code(402).send({ ok: false, error: "plan_limit", message: (error as Error).message });
      }
    }

    const policy = await resolvePolicy(organizationId, parsed.data.policy);
    const ruleWeights = await getRuleWeights(organizationId);
    const conversation: ChatMessageInput[] = parsed.data.messages;

    // Persist the new user turn into its conversation (when one is provided & owned).
    let convId: string | null = null;
    const lastUser = [...conversation].reverse().find((m) => m.role === "user");
    if (parsed.data.conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: parsed.data.conversationId, organizationId, userId },
        select: { id: true, title: true }
      });
      if (conv) {
        convId = conv.id;
        if (lastUser) {
          const meta = attachmentMeta(lastUser.attachments);
          await prisma.chatMessage.create({
            data: {
              conversationId: conv.id,
              role: "user",
              content: lastUser.content,
              ...(meta ? { attachments: meta as Prisma.InputJsonValue } : {})
            }
          });
          const title = conv.title === "Nueva conversación" ? lastUser.content.slice(0, 60).trim() || conv.title : conv.title;
          await prisma.conversation.update({ where: { id: conv.id }, data: { title, updatedAt: new Date() } });
        }
      }
    }

    const persistAssistant = async (text: string, toolCalls: Array<{ name: string; ok: boolean; recommendationId?: string }>) => {
      if (!convId) return;
      await prisma.chatMessage.create({
        data: {
          conversationId: convId,
          role: "assistant",
          content: text || "",
          ...(toolCalls.length > 0
            ? { toolEvents: toolCalls.map((t) => ({ name: t.name, ok: t.ok, recommendationId: t.recommendationId ?? null })) as Prisma.InputJsonValue }
            : {})
        }
      });
      await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });
    };

    if (!parsed.data.stream) {
      const result = await runAgent({ organizationId, mode, policy, conversation, ruleWeights });
      await persistAssistant(result.text, result.toolCalls);
      return { ok: true, conversationId: convId, ...result };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const send = (event: AgentEvent) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await runAgent({
        organizationId,
        mode,
        policy,
        conversation,
        ruleWeights,
        onEvent: (event) => {
          send(event);
        }
      });
      await persistAssistant(result.text, result.toolCalls);
      send({ type: "stop", reason: result.stopReason, usage: { input_tokens: result.usage.input, output_tokens: result.usage.output, cache_read_input_tokens: result.usage.cacheRead, cache_creation_input_tokens: result.usage.cacheCreation } as never });
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ text: result.text, toolCalls: result.toolCalls, conversationId: convId, usage: result.usage })}\n\n`);
    } catch (error) {
      app.log.error({ err: error }, "Agent run failed");
      send({ type: "error", message: (error as Error).message });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
};
