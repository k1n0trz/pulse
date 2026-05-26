import { META_TOOLS, type MetaToolName } from "@pulse/shared";
import { BaseConnector, NotImplementedError, type ToolHandler } from "./base.js";

// The Meta Ads CLI authenticates locally with `meta auth login` (browser OAuth).
// For multi-tenant SaaS use, our backend uses the Marketing API. The CLI
// connector here is kept as a contract for end users running scripts locally;
// the implementation will land in a future phase as a "bring-your-own-CLI" option.
export class AdsCliConnector extends BaseConnector {
  readonly name = "ads-cli" as const;

  protected handlers(): Partial<Record<MetaToolName, ToolHandler>> {
    const stub: ToolHandler = async () => {
      throw new NotImplementedError(META_TOOLS.GET_AD_ACCOUNTS, "Fase 4 (bring-your-own-CLI)");
    };
    return Object.fromEntries(Object.values(META_TOOLS).map((tool) => [tool, stub]));
  }
}
