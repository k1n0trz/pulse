import { describe, expect, it } from "vitest";
import { runPulseAutopilot } from "./autopilot.js";
import type { AutopilotPolicy, Campaign } from "./types.js";

const policy: AutopilotPolicy = {
  targetCpa: 300,
  targetRoas: 3,
  maxDailyBudgetIncreasePercent: 20,
  maxDailySpend: 1_000_000,
  maxDailyChanges: 8,
  killSwitch: false,
  blockedCriticalCampaigns: true
};

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
  metrics: Array.from({ length: 3 }, (_, i) => ({
    date: `2026-05-0${i + 1}`,
    spend: 5000,
    results: 18,
    cpa: 280,
    roas: 5.2,
    ctr: 2.9,
    cpm: 16,
    conversions: 18,
    frequency: 2.7
  }))
};

describe("autopilot", () => {
  it("read mode never executes", () => {
    const result = runPulseAutopilot({ campaigns: [winner], mode: "read", policy });
    expect(result.executedActions).toHaveLength(0);
    expect(result.simulatedActions).toHaveLength(0);
    expect(result.blockedReasons[0]).toMatch(/lectura/i);
  });

  it("assisted mode never auto-executes; pending approvals surface", () => {
    const result = runPulseAutopilot({ campaigns: [winner], mode: "assisted", policy });
    expect(result.executedActions).toHaveLength(0);
    expect(result.pendingApprovals.length).toBeGreaterThan(0);
  });

  it("autopilot executes within max daily changes", () => {
    const result = runPulseAutopilot({ campaigns: [winner], mode: "autopilot", policy });
    expect(result.executedActions.length).toBeLessThanOrEqual(policy.maxDailyChanges);
  });

  it("kill switch blocks autopilot execution", () => {
    const killed = { ...policy, killSwitch: true };
    const result = runPulseAutopilot({ campaigns: [winner], mode: "autopilot", policy: killed });
    expect(result.executedActions).toHaveLength(0);
    expect(result.blockedReasons[0]).toMatch(/Kill Switch/i);
  });
});
