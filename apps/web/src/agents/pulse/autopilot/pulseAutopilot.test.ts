import { describe, expect, it } from "vitest";
import { runPulseAutopilot } from "./pulseAutopilot";
import { mockCampaigns } from "../services/mockPulseData";

describe("pulseAutopilot", () => {
  it("does not execute mutations in assisted mode", () => {
    const result = runPulseAutopilot({
      campaigns: mockCampaigns,
      mode: "assisted",
      policy: {
        targetCpa: 300,
        targetRoas: 3,
        maxDailyBudgetIncreasePercent: 20,
        maxDailySpend: 200000,
        maxDailyChanges: 8,
        killSwitch: false,
        blockedCriticalCampaigns: false
      }
    });

    expect(result.executedActions).toHaveLength(0);
    expect(result.pendingApprovals.length).toBeGreaterThan(0);
  });

  it("stops all execution when kill switch is enabled", () => {
    const result = runPulseAutopilot({
      campaigns: mockCampaigns,
      mode: "autopilot",
      policy: {
        targetCpa: 300,
        targetRoas: 3,
        maxDailyBudgetIncreasePercent: 20,
        maxDailySpend: 200000,
        maxDailyChanges: 8,
        killSwitch: true,
        blockedCriticalCampaigns: false
      }
    });

    expect(result.executedActions).toHaveLength(0);
    expect(result.blockedReasons).toContain("Kill Switch global activo");
  });
});
