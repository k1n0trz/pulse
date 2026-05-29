import { describe, expect, it } from "vitest";
import { PlanLimitError } from "./entitlements.js";

describe("entitlements", () => {
  it("PlanLimitError carries HTTP 402 and a code", () => {
    const err = new PlanLimitError("upgrade needed");
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe("plan_limit");
    expect(err.message).toBe("upgrade needed");
  });
});
