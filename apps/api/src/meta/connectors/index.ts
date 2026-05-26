import type { MetaConnector, MetaConnectorProvider } from "@pulse/shared";
import { MarketingApiConnector, type MarketingApiConnectorConfig } from "./marketingApi.js";
import { AdsCliConnector } from "./cli.js";
import { AdsMcpConnector } from "./mcp.js";
import { MockConnector } from "./mock.js";

export type ConnectorFactoryInput =
  | { provider: "marketing-api"; config: MarketingApiConnectorConfig }
  | { provider: "ads-cli" }
  | { provider: "ads-mcp" }
  | { provider: "mock" };

export function createConnector(input: ConnectorFactoryInput): MetaConnector {
  switch (input.provider) {
    case "marketing-api":
      return new MarketingApiConnector(input.config);
    case "ads-cli":
      return new AdsCliConnector();
    case "ads-mcp":
      return new AdsMcpConnector();
    case "mock":
      return new MockConnector();
    default: {
      const _exhaustive: never = input;
      throw new Error(`Unknown provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export const SUPPORTED_PROVIDERS: MetaConnectorProvider[] = ["marketing-api", "ads-cli", "ads-mcp", "mock"];

export { MarketingApiConnector, AdsCliConnector, AdsMcpConnector, MockConnector };
