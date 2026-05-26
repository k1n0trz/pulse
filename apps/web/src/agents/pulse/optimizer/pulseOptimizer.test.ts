import { describe, expect, it } from "vitest";
import { createOptimizationPlan } from "./pulseOptimizer";
import { mockCampaigns } from "../services/mockPulseData";

describe("pulseOptimizer", () => {
  it("recommends scaling a campaign when ROAS beats target for three days", () => {
    const plan = createOptimizationPlan(mockCampaigns, {
      targetCpa: 300,
      targetRoas: 3,
      maxDailyBudgetIncreasePercent: 20,
      maxDailySpend: 200000,
      maxDailyChanges: 8,
      killSwitch: false,
      blockedCriticalCampaigns: false
    });

    expect(plan.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: "cmp_remarketing_7d",
          type: "scale_budget",
          requiresApproval: false
        })
      ])
    );
  });

  it("flags spend above twice target CPA without conversions as critical risk", () => {
    const plan = createOptimizationPlan(mockCampaigns, {
      targetCpa: 300,
      targetRoas: 3,
      maxDailyBudgetIncreasePercent: 20,
      maxDailySpend: 200000,
      maxDailyChanges: 8,
      killSwitch: false,
      blockedCriticalCampaigns: false
    });

    expect(plan.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          campaignId: "cmp_interest_cold",
          rule: "spend_without_conversions"
        })
      ])
    );
  });
});
