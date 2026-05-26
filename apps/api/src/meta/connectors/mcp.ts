import { META_TOOLS, type MetaToolName } from "@pulse/shared";
import { BaseConnector, NotImplementedError, type ToolHandler } from "./base.js";

// Meta Ads MCP at mcp.facebook.com/ads is intended for AI assistants (Claude
// Desktop, ChatGPT). Pulse uses the Marketing API in-server; we keep an MCP
// connector contract so Pulse can be re-exposed as an MCP server later if
// useful for power users.
export class AdsMcpConnector extends BaseConnector {
  readonly name = "ads-mcp" as const;

  protected handlers(): Partial<Record<MetaToolName, ToolHandler>> {
    const stub: ToolHandler = async () => {
      throw new NotImplementedError(META_TOOLS.GET_AD_ACCOUNTS, "Fase 6 (Pulse-as-MCP-server)");
    };
    return Object.fromEntries(Object.values(META_TOOLS).map((tool) => [tool, stub]));
  }
}
