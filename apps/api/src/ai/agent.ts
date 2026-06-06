// Pulse AI brain — Claude tool-calling loop with mode-aware guardrails and prompt caching.
//
// Manual loop (not tool runner) because we need:
//   - Per-call mode gating (read vs assisted vs autopilot)
//   - Audit logging on every tool call
//   - Streaming events to the SSE endpoint
//
// Caching strategy (see shared/prompt-caching.md):
//   - tools render at position 0 → mode-stable; we recompute per request only when mode changes
//   - system prompt is frozen (no timestamps / interpolations) → caches at breakpoint 1
//   - the conversation grows; we mark the last assistant turn's final block per request

import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import type { OperationMode, AutopilotPolicy } from "@pulse/shared";
import { getAnthropicClient, MODELS } from "./anthropicClient.js";
import { PULSE_TOOLS_BY_NAME, toAnthropicTools, toolsForMode, type ToolContext } from "./tools.js";
import { PULSE_SYSTEM_PROMPT } from "./systemPrompt.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";

export type ChatAttachment =
  | { kind: "image"; mediaType: string; data: string }
  | { kind: "document"; mediaType: string; data: string; name?: string };

export type ChatMessageInput = { role: "user" | "assistant"; content: string; attachments?: ChatAttachment[] };

export interface AgentRunOptions {
  organizationId: string;
  mode: OperationMode;
  policy: AutopilotPolicy;
  conversation: ChatMessageInput[];
  /** Learned per-rule weights (Fase 9) — bias the agent toward proven strategies. */
  ruleWeights?: Record<string, number>;
  /** Max agentic-loop iterations to prevent runaway tool use. */
  maxIterations?: number;
  /** Streaming callback — receives incremental events. */
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; toolUseId: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; name: string; ok: boolean; recommendationId?: string }
  | { type: "stop"; reason: string; usage?: Anthropic.Usage }
  | { type: "error"; message: string };

export interface AgentRunResult {
  text: string;
  iterations: number;
  stopReason: string;
  usage: { input: number; output: number; cacheRead: number; cacheCreation: number };
  toolCalls: Array<{ name: string; input: Record<string, unknown>; ok: boolean; recommendationId?: string }>;
}

function learnedRulesBlock(ruleWeights?: Record<string, number>): string {
  if (!ruleWeights || Object.keys(ruleWeights).length === 0) return "";
  const sorted = Object.entries(ruleWeights).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4).map(([r, w]) => `${r} (${w.toFixed(2)})`).join(", ");
  const bottom = sorted.slice(-2).map(([r, w]) => `${r} (${w.toFixed(2)})`).join(", ");
  return `
Learned strategy weights (from this account's executed-decision outcomes — higher = more reliable here):
  - prioritize: ${top}
  - apply with caution: ${bottom}
When proposing optimizations, prefer higher-weighted rules and be more conservative with low-weighted ones.`;
}

function contextReminder(orgId: string, mode: OperationMode, policy: AutopilotPolicy, ruleWeights?: Record<string, number>): string {
  return `<system-reminder>
Active organization: ${orgId}
Operating mode: ${mode}
Policy:
  - target CPA: ${policy.targetCpa}
  - target ROAS: ${policy.targetRoas}
  - max daily budget increase %: ${policy.maxDailyBudgetIncreasePercent}
  - max daily spend: ${policy.maxDailySpend}
  - max daily changes: ${policy.maxDailyChanges}
  - kill switch: ${policy.killSwitch ? "ENABLED — refuse mutations" : "off"}
  - block critical campaigns: ${policy.blockedCriticalCampaigns}${learnedRulesBlock(ruleWeights)}
</system-reminder>`;
}

// Builds a message's content: a plain string when there are no attachments, or
// a block array (images/documents + text) for multimodal user turns.
function buildContent(text: string, attachments?: ChatAttachment[]): string | Anthropic.ContentBlockParam[] {
  if (!attachments || attachments.length === 0) return text;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const att of attachments) {
    if (att.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: att.mediaType as "image/png", data: att.data } });
    } else {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: att.data }, ...(att.name ? { title: att.name } : {}) } as Anthropic.ContentBlockParam);
    }
  }
  if (text) blocks.push({ type: "text", text });
  return blocks;
}

function withReminder(content: string | Anthropic.ContentBlockParam[], reminder: string): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return `${reminder}\n\n${content}`;
  return [{ type: "text", text: reminder }, ...content];
}

function toClaudeMessages(conversation: ChatMessageInput[], orgId: string, mode: OperationMode, policy: AutopilotPolicy, ruleWeights?: Record<string, number>): Anthropic.MessageParam[] {
  const reminder = contextReminder(orgId, mode, policy, ruleWeights);
  if (conversation.length === 0) {
    return [{ role: "user", content: reminder }];
  }
  // Inject the reminder into the FIRST user message so it stays as part of the
  // turn-by-turn history (Claude treats it as context, not a system mutation).
  const out: Anthropic.MessageParam[] = [];
  let injected = false;
  for (const msg of conversation) {
    const content = buildContent(msg.content, msg.attachments);
    if (!injected && msg.role === "user") {
      out.push({ role: "user", content: withReminder(content, reminder) });
      injected = true;
    } else {
      out.push({ role: msg.role, content });
    }
  }
  if (!injected) out.unshift({ role: "user", content: reminder });
  return out;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { organizationId, mode, policy, conversation } = opts;
  const maxIterations = opts.maxIterations ?? 8;
  const client = getAnthropicClient();

  const tools = toAnthropicTools(toolsForMode(mode));
  const ctx: ToolContext = {
    organizationId,
    mode,
    policy,
    allowExecution: mode === "autopilot" && !policy.killSwitch
  };

  const messages: Anthropic.MessageParam[] = toClaudeMessages(conversation, organizationId, mode, policy, opts.ruleWeights);

  const toolCalls: AgentRunResult["toolCalls"] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  let assembledText = "";
  let stopReason = "end_turn";

  for (let iter = 0; iter < maxIterations; iter++) {
    const response = await client.messages.create({
      model: MODELS.brain,
      max_tokens: 16000,
      system: [{ type: "text", text: PULSE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: tools.length > 0 ? tools : undefined,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" }
    });

    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreation += response.usage.cache_creation_input_tokens ?? 0;
    stopReason = response.stop_reason ?? "end_turn";

    // Always append the full content so tool_use blocks stay paired with future tool_results.
    messages.push({ role: "assistant", content: response.content });

    let stepText = "";
    const pendingToolCalls: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        stepText += block.text;
        if (opts.onEvent) await opts.onEvent({ type: "text_delta", text: block.text });
      } else if (block.type === "thinking" && block.thinking) {
        if (opts.onEvent) await opts.onEvent({ type: "thinking", text: block.thinking });
      } else if (block.type === "tool_use") {
        pendingToolCalls.push(block);
        if (opts.onEvent) await opts.onEvent({ type: "tool_call", toolUseId: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }

    assembledText += stepText;

    if (response.stop_reason === "end_turn" || pendingToolCalls.length === 0) {
      break;
    }

    // Execute tool calls and feed results back.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of pendingToolCalls) {
      const tool = PULSE_TOOLS_BY_NAME.get(call.name);
      if (!tool) {
        toolResults.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Unknown tool: ${call.name}` });
        toolCalls.push({ name: call.name, input: call.input as Record<string, unknown>, ok: false });
        if (opts.onEvent) await opts.onEvent({ type: "tool_result", toolUseId: call.id, name: call.name, ok: false });
        continue;
      }
      if (tool.toolMode === "mutate" && mode === "read") {
        const msg = `Mutation tool "${tool.name}" is not allowed in read mode.`;
        toolResults.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: msg });
        toolCalls.push({ name: tool.name, input: call.input as Record<string, unknown>, ok: false });
        if (opts.onEvent) await opts.onEvent({ type: "tool_result", toolUseId: call.id, name: tool.name, ok: false });
        continue;
      }

      try {
        const result = await tool.handler((call.input as Record<string, unknown>) ?? {}, ctx);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result.output)
        });
        toolCalls.push({ name: tool.name, input: call.input as Record<string, unknown>, ok: true, recommendationId: result.recommendationId });

        if (result.audit) {
          await prisma.auditEvent.create({
            data: {
              organizationId,
              type: result.audit.type,
              severity: result.audit.severity ?? "INFO",
              message: result.audit.message,
              metadata: (result.audit.metadata ?? null) as Prisma.InputJsonValue
            }
          });
        }
        if (opts.onEvent) await opts.onEvent({ type: "tool_result", toolUseId: call.id, name: tool.name, ok: true, recommendationId: result.recommendationId });
      } catch (error) {
        const message = (error as Error).message;
        logger.warn({ err: error, tool: tool.name }, "Tool execution failed");
        toolResults.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: message });
        toolCalls.push({ name: tool.name, input: call.input as Record<string, unknown>, ok: false });
        if (opts.onEvent) await opts.onEvent({ type: "tool_result", toolUseId: call.id, name: tool.name, ok: false });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (opts.onEvent) await opts.onEvent({ type: "stop", reason: stopReason });

  return { text: assembledText, iterations: messages.length, stopReason, usage, toolCalls };
}
