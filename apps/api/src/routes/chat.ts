import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { OperationMode, AutopilotPolicy } from "@pulse/shared";
import { isAnthropicConfigured } from "../ai/anthropicClient.js";
import { runAgent, type AgentEvent, type ChatMessageInput } from "../ai/agent.js";
import { assertAutopilotAllowed } from "../lib/entitlements.js";
import { prisma } from "../db/prisma.js";

const ChatBody = z.object({
  mode: z.enum(["read", "assisted", "autopilot"]).default("read"),
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
        content: z.string().min(1).max(20_000)
      })
    )
    .min(1)
    .max(40),
  stream: z.boolean().default(true)
});

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

    const { organizationId } = await req.getAuth();
    const mode = parsed.data.mode as OperationMode;

    if (mode === "autopilot") {
      try {
        await assertAutopilotAllowed(organizationId);
      } catch (error) {
        return reply.code(402).send({ ok: false, error: "plan_limit", message: (error as Error).message });
      }
    }

    const policy = await resolvePolicy(organizationId, parsed.data.policy);
    const conversation: ChatMessageInput[] = parsed.data.messages;

    if (!parsed.data.stream) {
      const result = await runAgent({ organizationId, mode, policy, conversation });
      return { ok: true, ...result };
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
        onEvent: (event) => {
          send(event);
        }
      });
      send({ type: "stop", reason: result.stopReason, usage: { input_tokens: result.usage.input, output_tokens: result.usage.output, cache_read_input_tokens: result.usage.cacheRead, cache_creation_input_tokens: result.usage.cacheCreation } as never });
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ text: result.text, toolCalls: result.toolCalls, usage: result.usage })}\n\n`);
    } catch (error) {
      app.log.error({ err: error }, "Agent run failed");
      send({ type: "error", message: (error as Error).message });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
};
