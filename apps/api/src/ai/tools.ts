// Tool registry for Pulse's AI brain.
//
// Each tool wraps an internal service (Prisma query, audit, optimizer, sync) or
// a Meta mutation, and declares (a) the JSON schema Claude sees, (b) which
// operation mode it requires, and (c) the handler that actually runs.
//
// The agent loop in agent.ts gates mutations by mode and persists recommendations
// to the Recommendation/Decision/ActionLog tables.

import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { META_TOOLS, type OperationMode, type AutopilotPolicy, createOptimizationPlan, auditAccount } from "@pulse/shared";
import { prisma } from "../db/prisma.js";
import { detectAccountAnomalies } from "./anomalies.js";
import { notifyRecommendationCreated } from "../services/notifications.js";
import { MarketingApiConnector } from "../meta/connectors/marketingApi.js";
import { decryptString } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

export type ToolMode = "read" | "mutate";

export interface ToolContext {
  organizationId: string;
  mode: OperationMode;
  policy: AutopilotPolicy;
  /** When true (autopilot), execute_action will actually hit Meta. Otherwise it just persists a Decision marker. */
  allowExecution: boolean;
}

export interface ToolHandlerResult {
  /** What gets fed back to Claude as the tool_result. */
  output: unknown;
  /** Optional side-effect summary for the audit log. */
  audit?: { type: string; severity?: "INFO" | "WARN" | "ERROR" | "CRITICAL"; message: string; metadata?: Prisma.InputJsonValue };
  /** When the tool created a Recommendation row, the ID — surfaced to the UI. */
  recommendationId?: string;
}

export interface PulseTool {
  name: string;
  description: string;
  toolMode: ToolMode;
  input_schema: Anthropic.Tool["input_schema"];
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolHandlerResult>;
}

// ---------- READ tools ----------

const listCampaigns: PulseTool = {
  name: "list_campaigns",
  description:
    "List recent campaign snapshots (name, status, spend, results, CPA, ROAS, phase) for the active organization. Use as the first step before recommending anything — it grounds responses in real data.",
  toolMode: "read",
  input_schema: {
    type: "object",
    properties: {
      accountId: { type: "string", description: "Optional Pulse account ID to scope results" },
      limit: { type: "integer", minimum: 1, maximum: 200, description: "Max rows to return (default 50)" }
    }
  },
  handler: async (input, ctx) => {
    const limit = (input.limit as number | undefined) ?? 50;
    const accountId = input.accountId as string | undefined;
    const campaigns = await prisma.campaignSnapshot.findMany({
      where: { organizationId: ctx.organizationId, ...(accountId ? { accountId } : {}) },
      orderBy: [{ capturedAt: "desc" }, { spend: "desc" }],
      take: limit,
      select: {
        id: true,
        metaCampaignId: true,
        name: true,
        objective: true,
        status: true,
        effectiveStatus: true,
        dailyBudget: true,
        spend: true,
        results: true,
        cpa: true,
        roas: true,
        ctr: true,
        cpm: true,
        frequency: true,
        phase: true,
        critical: true,
        learningLimited: true,
        account: { select: { metaAccountId: true, name: true, currency: true } }
      }
    });
    return {
      output: campaigns.map((c) => ({
        id: c.id,
        metaCampaignId: c.metaCampaignId,
        name: c.name,
        objective: c.objective,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null,
        spend: Number(c.spend),
        results: c.results,
        cpa: c.cpa ? Number(c.cpa) : null,
        roas: c.roas ? Number(c.roas) : null,
        ctr: c.ctr ? Number(c.ctr) : null,
        cpm: c.cpm ? Number(c.cpm) : null,
        frequency: c.frequency ? Number(c.frequency) : null,
        phase: c.phase,
        critical: c.critical,
        learningLimited: c.learningLimited,
        accountName: c.account?.name,
        currency: c.account?.currency
      }))
    };
  }
};

const getCampaignInsights: PulseTool = {
  name: "get_campaign_insights",
  description: "Daily metric breakdown (spend, results, CPA, ROAS, CTR, frequency) for one campaign. Use to inspect trends before recommending action.",
  toolMode: "read",
  input_schema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Pulse campaign snapshot ID" },
      days: { type: "integer", minimum: 1, maximum: 90, description: "How many recent days (default 14)" }
    },
    required: ["campaignId"]
  },
  handler: async (input, ctx) => {
    const campaignId = String(input.campaignId);
    const days = (input.days as number | undefined) ?? 14;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);

    const campaign = await prisma.campaignSnapshot.findFirst({
      where: { id: campaignId, organizationId: ctx.organizationId },
      include: { dailyMetrics: { where: { date: { gte: since } }, orderBy: { date: "asc" } } }
    });
    if (!campaign) throw new Error(`Campaign ${campaignId} not found in this organization`);
    return {
      output: {
        id: campaign.id,
        name: campaign.name,
        windowDays: days,
        metrics: campaign.dailyMetrics.map((d) => ({
          date: d.date.toISOString().slice(0, 10),
          spend: Number(d.spend),
          results: d.results,
          cpa: d.cpa === null ? null : Number(d.cpa),
          roas: d.roas === null ? null : Number(d.roas),
          ctr: d.ctr === null ? null : Number(d.ctr),
          cpm: d.cpm === null ? null : Number(d.cpm),
          frequency: d.frequency === null ? null : Number(d.frequency)
        }))
      }
    };
  }
};

const auditAccountTool: PulseTool = {
  name: "audit_account",
  description: "Score the active account across structure, tracking, creative, budget, and audience dimensions. Returns findings and a 0-100 score.",
  toolMode: "read",
  input_schema: { type: "object", properties: {} },
  handler: async (_input, ctx) => {
    const campaigns = await prisma.campaignSnapshot.findMany({
      where: { organizationId: ctx.organizationId },
      take: 200
    });
    const dto = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      objective: (c.objective === "OUTCOME_LEADS" ? "Leads" : c.objective.includes("SALES") ? "Ventas" : "Trafico") as "Leads" | "Ventas" | "Trafico" | "Interaccion" | "Mensajes",
      status: (c.status.toLowerCase() === "active" ? "active" : "paused") as "active" | "paused" | "limited",
      budget: c.dailyBudget ? Number(c.dailyBudget) : 0,
      spend: Number(c.spend),
      results: c.results,
      cpa: c.cpa ? Number(c.cpa) : 0,
      roas: c.roas ? Number(c.roas) : 0,
      ctr: c.ctr ? Number(c.ctr) : 0,
      cpm: c.cpm ? Number(c.cpm) : 0,
      frequency: c.frequency ? Number(c.frequency) : 0,
      phase: (c.phase ?? "active") as "learning" | "active" | "fatigued" | "winner" | "loser",
      critical: c.critical,
      learningLimited: c.learningLimited,
      metrics: []
    }));
    const plan = createOptimizationPlan(dto, ctx.policy);
    const result = auditAccount(dto, plan.alerts);
    return { output: result };
  }
};

const computeRecommendations: PulseTool = {
  name: "compute_recommendations",
  description: "Run Pulse's rule-based optimizer (scale winners, reduce CPA-above-target, pause spend-without-conversions, rotate fatigue, etc.) and return ranked recommendations. Read-only — proposes only, does not execute.",
  toolMode: "read",
  input_schema: { type: "object", properties: {} },
  handler: async (_input, ctx) => {
    const campaigns = await prisma.campaignSnapshot.findMany({
      where: { organizationId: ctx.organizationId },
      include: { dailyMetrics: { orderBy: { date: "desc" }, take: 7 } },
      take: 200
    });
    const dto = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      objective: (c.objective === "OUTCOME_LEADS" ? "Leads" : c.objective.includes("SALES") ? "Ventas" : "Trafico") as "Leads" | "Ventas" | "Trafico" | "Interaccion" | "Mensajes",
      status: (c.status.toLowerCase() === "active" ? "active" : "paused") as "active" | "paused" | "limited",
      budget: c.dailyBudget ? Number(c.dailyBudget) : 0,
      spend: Number(c.spend),
      results: c.results,
      cpa: c.cpa ? Number(c.cpa) : 0,
      roas: c.roas ? Number(c.roas) : 0,
      ctr: c.ctr ? Number(c.ctr) : 0,
      cpm: c.cpm ? Number(c.cpm) : 0,
      frequency: c.frequency ? Number(c.frequency) : 0,
      phase: (c.phase ?? "active") as "learning" | "active" | "fatigued" | "winner" | "loser",
      critical: c.critical,
      learningLimited: c.learningLimited,
      metrics: c.dailyMetrics.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        spend: Number(d.spend),
        results: d.results,
        cpa: d.cpa === null ? 0 : Number(d.cpa),
        roas: d.roas === null ? 0 : Number(d.roas),
        ctr: d.ctr === null ? 0 : Number(d.ctr),
        cpm: d.cpm === null ? 0 : Number(d.cpm),
        conversions: d.conversions,
        frequency: d.frequency === null ? 0 : Number(d.frequency)
      }))
    }));
    const plan = createOptimizationPlan(dto, ctx.policy);
    return { output: plan };
  }
};

const detectAnomalies: PulseTool = {
  name: "detect_anomalies",
  description: "Run statistical anomaly detection (z-score over 14-day baseline) across daily metrics for the active organization. Returns ranked findings.",
  toolMode: "read",
  input_schema: {
    type: "object",
    properties: {
      accountId: { type: "string", description: "Optional Pulse account ID to scope" },
      threshold: { type: "number", description: "Z-score threshold (default 2)" },
      baselineDays: { type: "integer", description: "Baseline window in days (default 14)" }
    }
  },
  handler: async (input, ctx) => {
    const findings = await detectAccountAnomalies({
      organizationId: ctx.organizationId,
      accountId: input.accountId as string | undefined,
      threshold: input.threshold as number | undefined,
      baselineDays: input.baselineDays as number | undefined
    });
    return { output: findings };
  }
};

// ---------- MUTATION tools ----------

const proposeAction: PulseTool = {
  name: "propose_action",
  description:
    "Persist a recommendation for the operator to approve. Use whenever you want to surface an actionable change — even in autopilot, this creates a paper trail before execution. Required fields describe the action precisely so the operator can decide.",
  toolMode: "mutate",
  input_schema: {
    type: "object",
    properties: {
      campaignId: { type: "string", description: "Pulse campaign ID (omit for account-wide proposals)" },
      type: {
        type: "string",
        enum: [
          "scale_budget",
          "reduce_budget",
          "pause_ad",
          "duplicate_winner",
          "rotate_creative",
          "expand_audience",
          "simplify_structure",
          "consolidate_budget",
          "review_landing",
          "audit_tracking"
        ]
      },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      title: { type: "string", description: "Short headline shown to the operator" },
      description: { type: "string", description: "What and why, 1-3 sentences" },
      expectedImpact: { type: "string", description: "Quantified expected effect (e.g. '+8% CPA improvement')" },
      rule: { type: "string", description: "Internal rule name or AI signature (e.g. 'ai.scale_winner')" },
      budgetDeltaPercent: { type: "integer", description: "If budget change, signed percent (+15, -20)" }
    },
    required: ["type", "severity", "title", "description", "expectedImpact", "rule"]
  },
  handler: async (input, ctx) => {
    const type = String(input.type).toUpperCase().replace("AD", "AD").replace("ADUDIT", "AUDIT") as
      | "SCALE_BUDGET"
      | "REDUCE_BUDGET"
      | "PAUSE_AD"
      | "DUPLICATE_WINNER"
      | "ROTATE_CREATIVE"
      | "EXPAND_AUDIENCE"
      | "SIMPLIFY_STRUCTURE"
      | "CONSOLIDATE_BUDGET"
      | "REVIEW_LANDING"
      | "AUDIT_TRACKING";
    const severity = String(input.severity).toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    const campaignIdInput = input.campaignId as string | undefined;
    let accountId: string | undefined;
    if (campaignIdInput) {
      const found = await prisma.campaignSnapshot.findFirst({
        where: { id: campaignIdInput, organizationId: ctx.organizationId },
        select: { accountId: true }
      });
      if (!found) throw new Error(`Campaign ${campaignIdInput} not found in organization`);
      accountId = found.accountId;
    }

    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: ctx.organizationId,
        accountId: accountId ?? null,
        campaignId: campaignIdInput ?? null,
        type,
        severity,
        rule: String(input.rule),
        title: String(input.title),
        description: String(input.description),
        expectedImpact: String(input.expectedImpact),
        budgetDeltaPercent: typeof input.budgetDeltaPercent === "number" ? input.budgetDeltaPercent : null,
        requiresApproval: ctx.mode !== "autopilot",
        status: "OPEN"
      }
    });

    await notifyRecommendationCreated({
      organizationId: ctx.organizationId,
      recommendationId: recommendation.id,
      severity,
      title: String(input.title),
      expectedImpact: String(input.expectedImpact)
    });

    return {
      output: {
        recommendationId: recommendation.id,
        requiresApproval: recommendation.requiresApproval,
        status: recommendation.status,
        note: ctx.mode === "autopilot" ? "Created and ready for autopilot execution within policy." : "Saved for human approval."
      },
      audit: {
        type: "ai.recommendation.proposed",
        message: `Agent proposed ${type} (${severity}) for ${campaignIdInput ?? "account-wide"}`
      },
      recommendationId: recommendation.id
    };
  }
};

const executeAction: PulseTool = {
  name: "execute_action",
  description:
    "Execute a previously proposed recommendation against Meta. Only callable in autopilot mode and only when allowExecution is true; otherwise it just records a dry-run intent. Currently supports budget adjustments and pausing.",
  toolMode: "mutate",
  input_schema: {
    type: "object",
    properties: {
      recommendationId: { type: "string", description: "ID returned by propose_action" },
      dryRun: { type: "boolean", description: "If true, skip the Meta call and just log the decision (default false in autopilot)" }
    },
    required: ["recommendationId"]
  },
  handler: async (input, ctx) => {
    const recommendation = await prisma.recommendation.findFirst({
      where: { id: String(input.recommendationId), organizationId: ctx.organizationId },
      include: { decision: true }
    });
    if (!recommendation) throw new Error("Recommendation not found");
    if (recommendation.decision) {
      return {
        output: { skipped: true, reason: "Already decided", decisionId: recommendation.decision.id }
      };
    }

    const dryRun = (input.dryRun as boolean | undefined) ?? !ctx.allowExecution;

    const decision = await prisma.decision.create({
      data: {
        organizationId: ctx.organizationId,
        recommendationId: recommendation.id,
        decidedBy: "AUTOPILOT",
        outcome: dryRun ? "DEFERRED" : "AUTO_EXECUTED",
        notes: dryRun ? "Dry-run: execution gated by mode or policy" : "Autopilot executed within policy"
      }
    });

    const action = await prisma.actionLog.create({
      data: {
        organizationId: ctx.organizationId,
        decisionId: decision.id,
        campaignId: recommendation.campaignId,
        type: recommendation.type,
        provider: dryRun ? "mock" : "marketing-api",
        tool: META_TOOLS.UPDATE_ENTITY,
        dryRun,
        status: dryRun ? "DRY_RUN" : "PENDING",
        payload: {
          recommendationType: recommendation.type,
          budgetDeltaPercent: recommendation.budgetDeltaPercent ?? null
        } as Prisma.InputJsonValue
      }
    });

    let result: unknown = { dryRun };

    if (!dryRun && recommendation.campaignId) {
      const campaign = await prisma.campaignSnapshot.findUnique({
        where: { id: recommendation.campaignId },
        include: { account: { include: { connection: true } } }
      });
      if (!campaign?.account) throw new Error("Campaign missing account/connection");
      const accessToken = decryptString(campaign.account.connection.accessTokenEnc);
      const connector = new MarketingApiConnector({ accessToken, appSecret: env.META_APP_SECRET });

      const args: Record<string, unknown> = { id: campaign.metaCampaignId };
      if (recommendation.type === "PAUSE_AD") {
        args.fields = { status: "PAUSED" };
      } else if (recommendation.type === "SCALE_BUDGET" || recommendation.type === "REDUCE_BUDGET") {
        const delta = recommendation.budgetDeltaPercent ?? 0;
        const current = campaign.dailyBudget ? Number(campaign.dailyBudget) : 0;
        const next = Math.max(1, Math.round(current * (1 + delta / 100)));
        // Meta expects daily_budget in cents
        args.fields = { daily_budget: Math.round(next * 100) };
      } else {
        // For non-budget/pause types, mark the action as completed but no API call yet —
        // creative rotation, audience expansion etc. land in Fase 4.
        await prisma.actionLog.update({
          where: { id: action.id },
          data: { status: "SUCCESS", completedAt: new Date(), result: { skipped: "type not yet wired" } as Prisma.InputJsonValue }
        });
        result = { executed: false, reason: "Action type lands in Fase 4" };
        await prisma.recommendation.update({ where: { id: recommendation.id }, data: { status: "EXECUTED", resolvedAt: new Date() } });
        return { output: result };
      }

      const startedAt = Date.now();
      const apiResult = await connector.invoke({ tool: META_TOOLS.UPDATE_ENTITY, args });
      await prisma.actionLog.update({
        where: { id: action.id },
        data: {
          status: apiResult.ok ? "SUCCESS" : "FAILED",
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          result: apiResult as unknown as Prisma.InputJsonValue,
          errorMessage: apiResult.ok ? null : apiResult.message
        }
      });
      await prisma.recommendation.update({
        where: { id: recommendation.id },
        data: { status: apiResult.ok ? "EXECUTED" : "REJECTED", resolvedAt: new Date() }
      });
      result = apiResult;
    } else {
      await prisma.recommendation.update({
        where: { id: recommendation.id },
        data: { status: dryRun ? "OPEN" : "EXECUTED", resolvedAt: dryRun ? null : new Date() }
      });
    }

    return {
      output: result,
      audit: {
        type: dryRun ? "ai.action.dry_run" : "ai.action.executed",
        severity: dryRun ? "INFO" : "WARN",
        message: `Recommendation ${recommendation.id} ${dryRun ? "deferred (dry-run)" : "executed"}`
      }
    };
  }
};

// ---------- Registry ----------

export const PULSE_TOOLS: PulseTool[] = [
  listCampaigns,
  getCampaignInsights,
  auditAccountTool,
  computeRecommendations,
  detectAnomalies,
  proposeAction,
  executeAction
];

export const PULSE_TOOLS_BY_NAME = new Map(PULSE_TOOLS.map((t) => [t.name, t]));

export function toolsForMode(mode: OperationMode): PulseTool[] {
  if (mode === "read") return PULSE_TOOLS.filter((t) => t.toolMode === "read");
  return PULSE_TOOLS;
}

export function toAnthropicTools(tools: PulseTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}
