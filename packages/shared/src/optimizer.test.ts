import { describe, expect, it } from "vitest";
import { createOptimizationPlan } from "./optimizer.js";
import type { AutopilotPolicy, Campaign } from "./types.js";

const policy: AutopilotPolicy = {
  targetCpa: 300,
  targetRoas: 3,
  maxDailyBudgetIncreasePercent: 20,
  maxDailySpend: 200000,
  maxDailyChanges: 8,
  killSwitch: false,
  blockedCriticalCampaigns: true
};

function days(base: { spend: number; conversions: number; roas: number; ctr: number; cpm: number; frequency: number; cpa: number }, length = 3): Campaign["metrics"] {
  return Array.from({ length }, (_, i) => ({
    date: `2026-05-0${i + 1}`,
    spend: base.spend,
    results: base.conversions,
    cpa: base.cpa,
    roas: base.roas,
    ctr: base.ctr,
    cpm: base.cpm,
    conversions: base.conversions,
    frequency: base.frequency
  }));
}

const winner: Campaign = {
  id: "cmp_winner",
  name: "Winner",
  objective: "Ventas",
  status: "active",
  budget: 40000,
  spend: 32000,
  results: 100,
  cpa: 320,
  roas: 5,
  ctr: 2.9,
  cpm: 16,
  frequency: 2.8,
  phase: "winner",
  critical: false,
  metrics: days({ spend: 5000, conversions: 18, roas: 5.2, ctr: 2.9, cpm: 16, frequency: 2.7, cpa: 280 })
};

const fugitive: Campaign = {
  id: "cmp_fugitive",
  name: "Spend without conversions",
  objective: "Ventas",
  status: "active",
  budget: 80000,
  spend: 90000,
  results: 0,
  cpa: 0,
  roas: 0,
  ctr: 1.1,
  cpm: 26,
  frequency: 3.3,
  phase: "loser",
  critical: false,
  metrics: days({ spend: 6000, conversions: 0, roas: 0, ctr: 1.1, cpm: 27, frequency: 3.4, cpa: 0 })
};

describe("optimizer", () => {
  it("flags spend without conversions as critical and proposes a pause", () => {
    const plan = createOptimizationPlan([fugitive], policy);
    expect(plan.alerts.some((a) => a.rule === "spend_without_conversions")).toBe(true);
    expect(plan.recommendations.some((r) => r.type === "pause_ad")).toBe(true);
  });

  it("proposes scaling a winner with stable ROAS", () => {
    const plan = createOptimizationPlan([winner], policy);
    const scaling = plan.recommendations.find((r) => r.type === "scale_budget");
    expect(scaling).toBeTruthy();
    expect(scaling?.budgetDeltaPercent).toBeLessThanOrEqual(policy.maxDailyBudgetIncreasePercent);
  });
});
