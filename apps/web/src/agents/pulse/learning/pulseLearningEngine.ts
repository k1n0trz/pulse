import type { DecisionImpact, LearningDecisionInput } from "@pulse/shared";

export function evaluateDecisionImpact(input: LearningDecisionInput): DecisionImpact {
  const cpaDelta = input.before.cpa === 0 ? 0 : (input.before.cpa - input.after.cpa) / input.before.cpa;
  const roasDelta = input.before.roas === 0 ? 0 : (input.after.roas - input.before.roas) / input.before.roas;
  const ctrDelta = input.before.ctr === 0 ? 0 : (input.after.ctr - input.before.ctr) / input.before.ctr;
  const score = Number((cpaDelta * 0.4 + roasDelta * 0.45 + ctrDelta * 0.15).toFixed(3));

  return {
    id: `impact_${input.rule}_${Date.now()}`,
    rule: input.rule,
    action: input.rule,
    sentiment: score > 0.05 ? "positive" : score < -0.05 ? "negative" : "neutral",
    score,
    evaluatedAt: new Date(Date.now() + input.hoursElapsed * 60 * 60 * 1000).toISOString()
  };
}

export function updateRuleWeights(currentWeights: Record<string, number>, impacts: DecisionImpact[]) {
  return impacts.reduce<Record<string, number>>((weights, impact) => {
    const current = weights[impact.rule] ?? 1;
    const adjustment = impact.sentiment === "positive" ? Math.min(0.2, Math.abs(impact.score)) : impact.sentiment === "negative" ? -Math.min(0.2, Math.abs(impact.score)) : 0;
    weights[impact.rule] = Number(Math.max(0.25, Math.min(2, current + adjustment)).toFixed(2));
    return weights;
  }, { ...currentWeights });
}

export const seedRuleWeights: Record<string, number> = {
  scale_winner: 1,
  cpa_above_target_3d: 1,
  spend_without_conversions: 1.2,
  low_ctr_high_cpm: 0.9,
  creative_fatigue: 0.95,
  learning_limited: 0.85,
  budget_fragmentation: 0.8
};
