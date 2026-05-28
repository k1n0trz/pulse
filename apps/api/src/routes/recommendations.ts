import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { Prisma, type RecommendationStatus, type RecommendationType } from "@prisma/client";
import { META_TOOLS } from "@pulse/shared";
import { prisma } from "../db/prisma.js";
import { MarketingApiConnector } from "../meta/connectors/marketingApi.js";
import { decryptString } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";
import { notifyRecommendationDecision } from "../services/notifications.js";

const env = loadEnv();

const ListQuery = z.object({
  organizationId: z.string().optional(),
  status: z.enum(["OPEN", "APPROVED", "REJECTED", "EXECUTED", "EXPIRED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const ApproveBody = z.object({
  execute: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  userId: z.string().optional()
});

const RejectBody = z.object({
  notes: z.string().max(1000).optional(),
  userId: z.string().optional()
});

async function defaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) throw new Error("Demo organization not found. Run `pnpm db:seed`.");
  return org.id;
}

export const recommendationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/recommendations", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });

    const organizationId = parsed.data.organizationId ?? (await defaultOrgId());

    const recommendations = await prisma.recommendation.findMany({
      where: {
        organizationId,
        ...(parsed.data.status ? { status: parsed.data.status as RecommendationStatus } : {}),
        ...(parsed.data.severity ? { severity: parsed.data.severity } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: parsed.data.limit,
      include: {
        decision: { select: { id: true, outcome: true, decidedAt: true, notes: true } }
      }
    });

    return {
      ok: true,
      organizationId,
      count: recommendations.length,
      recommendations: recommendations.map(serializeRecommendation)
    };
  });

  app.post("/recommendations/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ApproveBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });

    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
      include: { decision: true }
    });
    if (!recommendation) return reply.code(404).send({ ok: false, error: "not_found" });
    if (recommendation.decision) return reply.code(409).send({ ok: false, error: "already_decided" });
    if (recommendation.status !== "OPEN") return reply.code(409).send({ ok: false, error: `status_${recommendation.status.toLowerCase()}` });

    try {
      const result = await approveAndOptionallyExecute(recommendation.id, parsed.data);
      await notifyRecommendationDecision({
        organizationId: recommendation.organizationId,
        userId: parsed.data.userId,
        recommendationId: recommendation.id,
        outcome: parsed.data.execute ? "AUTO_EXECUTED" : "APPROVED",
        title: recommendation.title
      });
      return { ok: true, ...result };
    } catch (error) {
      app.log.error({ err: error, id }, "Approve failed");
      return reply.code(500).send({ ok: false, error: "approve_failed", message: (error as Error).message });
    }
  });

  app.post("/recommendations/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = RejectBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });

    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
      include: { decision: true }
    });
    if (!recommendation) return reply.code(404).send({ ok: false, error: "not_found" });
    if (recommendation.decision) return reply.code(409).send({ ok: false, error: "already_decided" });

    const decision = await prisma.decision.create({
      data: {
        organizationId: recommendation.organizationId,
        recommendationId: recommendation.id,
        decidedBy: "USER",
        decidedByUserId: parsed.data.userId,
        outcome: "REJECTED",
        notes: parsed.data.notes
      }
    });
    await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: { status: "REJECTED", resolvedAt: new Date() }
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: recommendation.organizationId,
        userId: parsed.data.userId,
        type: "recommendation.rejected",
        severity: "INFO",
        message: `Recommendation ${recommendation.id} rejected`,
        metadata: { notes: parsed.data.notes ?? null } as Prisma.InputJsonValue
      }
    });
    await notifyRecommendationDecision({
      organizationId: recommendation.organizationId,
      userId: parsed.data.userId,
      recommendationId: recommendation.id,
      outcome: "REJECTED",
      title: recommendation.title
    });

    return { ok: true, decisionId: decision.id };
  });
};

function serializeRecommendation(r: Awaited<ReturnType<typeof prisma.recommendation.findMany>>[number] & { decision: { id: string; outcome: string; decidedAt: Date; notes: string | null } | null }) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    campaignId: r.campaignId,
    type: r.type,
    severity: r.severity,
    rule: r.rule,
    title: r.title,
    description: r.description,
    expectedImpact: r.expectedImpact,
    budgetDeltaPercent: r.budgetDeltaPercent,
    requiresApproval: r.requiresApproval,
    status: r.status,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    decision: r.decision
  };
}

async function approveAndOptionallyExecute(recommendationId: string, opts: { execute: boolean; notes?: string; userId?: string }) {
  const rec = await prisma.recommendation.findUniqueOrThrow({ where: { id: recommendationId } });
  const campaign = rec.campaignId
    ? await prisma.campaignSnapshot.findUnique({
        where: { id: rec.campaignId },
        include: { account: { include: { connection: true } } }
      })
    : null;

  const decision = await prisma.decision.create({
    data: {
      organizationId: rec.organizationId,
      recommendationId: rec.id,
      decidedBy: "USER",
      decidedByUserId: opts.userId,
      outcome: opts.execute ? "AUTO_EXECUTED" : "APPROVED",
      notes: opts.notes
    }
  });

  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "APPROVED" }
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: rec.organizationId,
      userId: opts.userId,
      type: "recommendation.approved",
      severity: "INFO",
      message: `Recommendation ${rec.id} approved${opts.execute ? " (executing)" : ""}`,
      metadata: { notes: opts.notes ?? null } as Prisma.InputJsonValue
    }
  });

  if (!opts.execute) {
    return { decisionId: decision.id, executed: false };
  }

  if (!campaign) {
    throw new Error("Cannot execute account-wide recommendation in this slice");
  }

  const action = await prisma.actionLog.create({
    data: {
      organizationId: rec.organizationId,
      decisionId: decision.id,
      campaignId: rec.campaignId,
      type: rec.type,
      provider: "marketing-api",
      tool: META_TOOLS.UPDATE_ENTITY,
      dryRun: false,
      status: "PENDING",
      payload: { recommendationType: rec.type, budgetDeltaPercent: rec.budgetDeltaPercent ?? null } as Prisma.InputJsonValue
    }
  });

  const accessToken = decryptString(campaign.account.connection.accessTokenEnc);
  const connector = new MarketingApiConnector({ accessToken, appSecret: env.META_APP_SECRET });

  let args: Record<string, unknown> | null = null;
  const recType = rec.type as RecommendationType;
  if (recType === "PAUSE_AD") {
    args = { id: campaign.metaCampaignId, fields: { status: "PAUSED" } };
  } else if (recType === "SCALE_BUDGET" || recType === "REDUCE_BUDGET") {
    const delta = rec.budgetDeltaPercent ?? 0;
    const current = campaign.dailyBudget ? Number(campaign.dailyBudget) : 0;
    const next = Math.max(1, Math.round(current * (1 + delta / 100)));
    args = { id: campaign.metaCampaignId, fields: { daily_budget: Math.round(next * 100) } };
  }

  if (!args) {
    await prisma.actionLog.update({
      where: { id: action.id },
      data: { status: "SUCCESS", completedAt: new Date(), result: { skipped: "type not wired yet" } as Prisma.InputJsonValue }
    });
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "EXECUTED", resolvedAt: new Date() }
    });
    return { decisionId: decision.id, executed: false, reason: "type_not_wired" };
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
    where: { id: rec.id },
    data: { status: apiResult.ok ? "EXECUTED" : "OPEN", resolvedAt: apiResult.ok ? new Date() : null }
  });

  return { decisionId: decision.id, executed: apiResult.ok, result: apiResult };
}
