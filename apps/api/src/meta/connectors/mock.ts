import { META_TOOLS, type MetaToolName } from "@pulse/shared";
import { BaseConnector, type ToolHandler } from "./base.js";

// Used by tests and the dev sandbox before a real Meta connection is wired.
export class MockConnector extends BaseConnector {
  readonly name = "mock" as const;

  protected handlers(): Partial<Record<MetaToolName, ToolHandler>> {
    return {
      [META_TOOLS.GET_AD_ACCOUNTS]: async () => [
        {
          id: "act_1234567890",
          account_id: "1234567890",
          name: "Edi Business Account (mock)",
          currency: "USD",
          timezone_name: "America/Mexico_City",
          account_status: 1
        }
      ],
      [META_TOOLS.GET_AD_ENTITY]: async (args) => ({
        id: String(args.id ?? "cmp_mock"),
        name: "Mock Campaign",
        status: "PAUSED",
        effective_status: "PAUSED",
        objective: "OUTCOME_SALES"
      }),
      [META_TOOLS.INSIGHTS_GET]: async () => [
        {
          campaign_id: "cmp_mock",
          campaign_name: "Mock Campaign",
          spend: "150.0",
          impressions: "10000",
          clicks: "240",
          ctr: "2.4",
          cpm: "15.0",
          purchase_roas: [{ action_type: "omni_purchase", value: "3.85" }],
          date_start: "2026-05-01",
          date_stop: "2026-05-07"
        }
      ]
    };
  }
}
