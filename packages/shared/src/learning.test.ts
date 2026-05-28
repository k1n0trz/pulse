import { describe, expect, it } from "vitest";
import { evaluateDecisionImpact, updateRuleWeights } from "./learning.js";

describe("learning", () => {
  it("scores a budget scale as positive when ROAS improves and CPA drops", () => {
    const impact = evaluateDecisionImpact({
      rule: "scale_winner",
      before: { cpa: 320, roas: 3.5, ctr: 2.1 },
      after: { cpa: 280, roas: 4.2, ctr: 2.3 },
      hoursElapsed: 24
    });
    expect(impact.sentiment).toBe("positive");
    expect(impact.score).toBeGreaterThan(0);
  });

  it("scores a budget scale as negative when CPA rises sharply", () => {
    const impact = evaluateDecisionImpact({
      rule: "scale_winner",
      before: { cpa: 280, roas: 4.2, ctr: 2.4 },
      after: { cpa: 480, roas: 3.0, ctr: 2.1 },
      hoursElapsed: 24
    });
    expect(impact.sentiment).toBe("negative");
    expect(impact.score).toBeLessThan(0);
  });

  it("updateRuleWeights increases positives and dampens negatives", () => {
    const weights = { scale_winner: 1 };
    const updated = updateRuleWeights(weights, [
      { id: "i1", rule: "scale_winner", action: "scale_winner", sentiment: "positive", score: 0.1, evaluatedAt: new Date().toISOString() }
    ]);
    expect(updated.scale_winner).toBeGreaterThan(1);
  });
});
