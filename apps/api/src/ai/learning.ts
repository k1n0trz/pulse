// Self-learning loop (Fase 9) — closes the feedback cycle that powers the read &
// assisted modes' improving strategy quality.
//
//   executed decision → measure before/after impact (CPA·ROAS·CTR) →
//   adjust per-rule weights → the agent prioritizes proven rules next time.
//
// Pure scoring math lives in @pulse/shared (evaluateDecisionImpact /
// updateRuleWeights); this module wires it to persisted decisions + metrics.

import { evaluateDecisionImpact, updateRuleWeights, seedRuleWeights, type DecisionImpact } from "@pulse/shared";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";

export interface RuleWeightView {
  rule: string;
  weight: number;
  samples: number;
}

/** Current per-rule weights for an org: seeded defaults merged with learned values. */
export async function getRuleWeights(organizationId: string): Promise<Record<string, number>> {
  const rows = await prisma.ruleWeight.findMany({ where: { organizationId } });
  const weights: Record<string, number> = { ...seedRuleWeights };
  for (const r of rows) weights[r.rule] = r.weight;
  return weights;
}

export async function listRuleWeights(organizationId: string): Promise<RuleWeightView[]> {
  const rows = await prisma.ruleWeight.findMany({ where: { organizationId }, orderBy: { weight: "desc" } });
  const map = new Map(rows.map((r) => [r.rule, r]));
  // Surface seeded rules even before any learning has happened.
  const out: RuleWeightView[] = Object.keys(seedRuleWeights).map((rule) => {
    const row = map.get(rule);
    return { rule, weight: row?.weight ?? seedRuleWeights[rule] ?? 1, samples: row?.samples ?? 0 };
  });
  // Include any learned rules not in the seed set.
  for (const r of rows) if (!(r.rule in seedRuleWeights)) out.push({ rule: r.rule, weight: r.weight, samples: r.samples });
  return out.sort((a, b) => b.weight - a.weight);
}

interface MetricAvg {
  cpa: number;
  roas: number;
  ctr: number;
}

async function metricsSplit(campaignKey: string, organizationId: string, pivot: Date): Promise<{ before: MetricAvg; after: MetricAvg } | null> {
  // Resolve the campaign by snapshot id OR meta campaign id, then read its daily metrics.
  const snapshots = await prisma.campaignSnapshot.findMany({
    where: { organizationId, OR: [{ id: campaignKey }, { metaCampaignId: campaignKey }] },
    select: { id: true }
  });
  const ids = snapshots.map((s) => s.id);
  if (ids.length === 0) return null;

  const metrics = await prisma.dailyMetricSnapshot.findMany({
    where: { campaignId: { in: ids } },
    orderBy: { date: "asc" },
    select: { date: true, cpa: true, roas: true, ctr: true }
  });
  if (metrics.length < 2) return null;

  const avg = (rows: typeof metrics): MetricAvg | null => {
    if (rows.length === 0) return null;
    const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
    return {
      cpa: rows.reduce((s, r) => s + num(r.cpa), 0) / rows.length,
      roas: rows.reduce((s, r) => s + num(r.roas), 0) / rows.length,
      ctr: rows.reduce((s, r) => s + num(r.ctr), 0) / rows.length
    };
  };

  const before = avg(metrics.filter((m) => m.date < pivot));
  const after = avg(metrics.filter((m) => m.date >= pivot));
  if (!before || !after) return null;
  return { before, after };
}

export interface LearningEvaluation {
  evaluated: number;
  windowDays: number;
  weights: RuleWeightView[];
}

/**
 * Evaluates executed decisions from the last `windowDays`, scores their impact and
 * updates the org's rule weights. Safe to run repeatedly (idempotent-ish: weights
 * converge). Returns the refreshed weight table.
 */
export async function evaluateLearning(organizationId: string, windowDays = 30): Promise<LearningEvaluation> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);

  const decisions = await prisma.decision.findMany({
    where: { organizationId, outcome: "APPROVED", decidedAt: { gte: since } },
    include: { recommendation: { select: { rule: true, campaignId: true } } },
    orderBy: { decidedAt: "desc" },
    take: 200
  });

  const impacts: DecisionImpact[] = [];
  for (const d of decisions) {
    const rule = d.recommendation?.rule;
    const campaignKey = d.recommendation?.campaignId;
    if (!rule || !campaignKey) continue;
    const split = await metricsSplit(campaignKey, organizationId, d.decidedAt);
    if (!split) continue;
    const hoursElapsed = Math.max(1, (Date.now() - d.decidedAt.getTime()) / 3_600_000);
    impacts.push(evaluateDecisionImpact({ rule, before: split.before, after: split.after, hoursElapsed }));
  }

  if (impacts.length > 0) {
    const current = await getRuleWeights(organizationId);
    const updated = updateRuleWeights(current, impacts);
    const counts = impacts.reduce<Record<string, number>>((acc, i) => ((acc[i.rule] = (acc[i.rule] ?? 0) + 1), acc), {});
    await prisma.$transaction(
      Object.entries(updated).map(([rule, weight]) =>
        prisma.ruleWeight.upsert({
          where: { organizationId_rule: { organizationId, rule } },
          create: { organizationId, rule, weight, samples: counts[rule] ?? 0 },
          update: { weight, samples: { increment: counts[rule] ?? 0 } }
        })
      )
    );
    logger.info({ organizationId, evaluated: impacts.length }, "Learning weights updated");
  }

  return { evaluated: impacts.length, windowDays, weights: await listRuleWeights(organizationId) };
}
