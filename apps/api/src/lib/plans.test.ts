import { describe, expect, it } from "vitest";
import { PLANS, planByTier, planForPriceId } from "./plans.js";

describe("plans", () => {
  it("exposes the 4 tiers with ascending price", () => {
    expect(PLANS.FREE.monthlyUsd).toBe(0);
    expect(PLANS.SOLO.monthlyUsd).toBeLessThan(PLANS.AGENCY.monthlyUsd);
    expect(PLANS.AGENCY.monthlyUsd).toBeLessThan(PLANS.SCALE.monthlyUsd);
  });

  it("entitlements escalate by tier", () => {
    expect(PLANS.FREE.limits.autopilot).toBe(false);
    expect(PLANS.SOLO.limits.autopilot).toBe(false);
    expect(PLANS.AGENCY.limits.autopilot).toBe(true);
    expect(PLANS.SCALE.limits.apiAccess).toBe(true);
    expect(PLANS.SCALE.limits.maxAdAccounts).toBe(-1); // unlimited
  });

  it("planByTier returns the right def", () => {
    expect(planByTier("AGENCY").name).toBe("Agency");
  });

  it("planForPriceId returns null for unknown price", () => {
    expect(planForPriceId("price_does_not_exist")).toBeNull();
  });
});
