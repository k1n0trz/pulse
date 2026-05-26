import { describe, expect, it } from "vitest";
import { signState, verifyState } from "./signedState.js";

describe("signedState", () => {
  it("round trips signed payload", () => {
    const state = signState({ organizationId: "org_1", redirectTo: "https://app.example.com/connections" });
    const verified = verifyState(state);
    expect(verified.organizationId).toBe("org_1");
    expect(verified.redirectTo).toBe("https://app.example.com/connections");
    expect(verified.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verified.exp).toBeGreaterThan(verified.iat);
  });

  it("rejects tampered payloads", () => {
    const state = signState({ organizationId: "org_1" });
    const tampered = state.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(() => verifyState(tampered)).toThrow();
  });

  it("rejects malformed state", () => {
    expect(() => verifyState("not-a-real-state")).toThrow("Malformed state");
  });

  it("rejects expired state", () => {
    const state = signState({ organizationId: "org_1" }, -10);
    expect(() => verifyState(state)).toThrow("State expired");
  });
});
