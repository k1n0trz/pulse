import { describe, expect, it } from "vitest";
import type { OrgRole } from "@prisma/client";
import { hasRole, requireRole, ForbiddenError, type AuthContext } from "./context.js";

function ctx(role: OrgRole): AuthContext {
  return { userId: "u1", organizationId: "o1", role, email: "e@x.com", source: "demo" };
}

describe("role hierarchy", () => {
  it("OWNER satisfies every minimum", () => {
    const owner = ctx("OWNER");
    for (const min of ["VIEWER", "ANALYST", "ADMIN", "OWNER"] as OrgRole[]) {
      expect(hasRole(owner, min)).toBe(true);
    }
  });

  it("VIEWER only satisfies VIEWER", () => {
    const viewer = ctx("VIEWER");
    expect(hasRole(viewer, "VIEWER")).toBe(true);
    expect(hasRole(viewer, "ANALYST")).toBe(false);
    expect(hasRole(viewer, "ADMIN")).toBe(false);
    expect(hasRole(viewer, "OWNER")).toBe(false);
  });

  it("ANALYST satisfies VIEWER and ANALYST but not ADMIN", () => {
    const analyst = ctx("ANALYST");
    expect(hasRole(analyst, "VIEWER")).toBe(true);
    expect(hasRole(analyst, "ANALYST")).toBe(true);
    expect(hasRole(analyst, "ADMIN")).toBe(false);
  });

  it("requireRole throws ForbiddenError when below minimum", () => {
    expect(() => requireRole(ctx("VIEWER"), "ADMIN")).toThrow(ForbiddenError);
    expect(() => requireRole(ctx("ADMIN"), "ADMIN")).not.toThrow();
  });

  it("ForbiddenError carries statusCode 403", () => {
    const err = new ForbiddenError("ADMIN");
    expect(err.statusCode).toBe(403);
  });
});
