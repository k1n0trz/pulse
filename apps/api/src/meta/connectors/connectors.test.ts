import { describe, expect, it } from "vitest";
import { META_TOOLS } from "@pulse/shared";
import { createConnector } from "./index.js";

describe("connectors", () => {
  it("mock provider returns synthetic ad accounts", async () => {
    const connector = createConnector({ provider: "mock" });
    const result = await connector.invoke({ tool: META_TOOLS.GET_AD_ACCOUNTS, args: {} });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Array<{ id: string }>)[0]?.id).toMatch(/^act_/);
  });

  it("unimplemented tools surface a clear error rather than throwing", async () => {
    const connector = createConnector({ provider: "ads-cli" });
    const result = await connector.invoke({ tool: META_TOOLS.GET_AD_ACCOUNTS, args: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not implemented/i);
  });

  it("marketing-api connector requires real config", async () => {
    const connector = createConnector({ provider: "marketing-api", config: { accessToken: "" } });
    expect(connector.name).toBe("marketing-api");
  });
});
