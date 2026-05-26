import { describe, expect, it } from "vitest";
import { evaluateDecisionImpact, updateRuleWeights } from "./pulseLearningEngine";

describe("pulseLearningEngine", () => {
  it("scores a budget scale as positive when ROAS improves and CPA drops", () => {
    const impact = evaluateDecisionImpact({
      rule: "scale_winner",
      before: { cpa: 260, roas: 3.4, ctr: 2.1 },
      after: { cpa: 220, roas: 4.1, ctr: 2.4 },
      hoursElapsed: 48
    });

    expect(impact.sentiment).toBe("positive");
    expect(impact.score).toBeGreaterThan(0);
  });

  it("reduces rule weight after a negative outcome", () => {
    const weights = updateRuleWeights({ scale_winner: 1 }, [
      {
        id: "d1",
        rule: "scale_winner",
        action: "scale_budget",
        sentiment: "negative",
        score: -0.4,
        evaluatedAt: "2026-05-01T12:00:00.000Z"
      }
    ]);

    expect(weights.scale_winner).toBeLessThan(1);
  });
});
