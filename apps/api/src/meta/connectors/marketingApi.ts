import { META_TOOLS, type MetaToolName } from "@pulse/shared";
import { graphPaginate, graphRequest } from "../graphClient.js";
import { BaseConnector, NotImplementedError, type ToolHandler } from "./base.js";

export interface MarketingApiConnectorConfig {
  accessToken: string;
  appSecret?: string; // used for appsecret_proof
}

export class MarketingApiConnector extends BaseConnector {
  readonly name = "marketing-api" as const;

  constructor(private readonly config: MarketingApiConnectorConfig) {
    super();
  }

  private auth() {
    return { accessToken: this.config.accessToken, appsecretProofSecret: this.config.appSecret };
  }

  protected handlers(): Partial<Record<MetaToolName, ToolHandler>> {
    return {
      [META_TOOLS.GET_AD_ACCOUNTS]: this.getAdAccounts,
      [META_TOOLS.GET_AD_ENTITY]: this.getEntity,
      [META_TOOLS.GET_PAGES]: this.getPages,
      [META_TOOLS.INSIGHTS_GET]: this.getInsights,
      [META_TOOLS.UPDATE_ENTITY]: this.updateEntity,
      [META_TOOLS.ACTIVATE_ENTITY]: this.activateEntity,

      // Stubs — surface a clear error until we wire each one in later phases.
      [META_TOOLS.CREATE_CAMPAIGN]: notImpl(META_TOOLS.CREATE_CAMPAIGN, "Fase 4"),
      [META_TOOLS.CREATE_AD_SET]: notImpl(META_TOOLS.CREATE_AD_SET, "Fase 4"),
      [META_TOOLS.CREATE_AD]: notImpl(META_TOOLS.CREATE_AD, "Fase 4"),
      [META_TOOLS.INSIGHTS_TRENDS]: notImpl(META_TOOLS.INSIGHTS_TRENDS, "Fase 2"),
      [META_TOOLS.INSIGHTS_ANOMALIES]: notImpl(META_TOOLS.INSIGHTS_ANOMALIES, "Fase 2"),
      [META_TOOLS.INSIGHTS_BENCHMARKS]: notImpl(META_TOOLS.INSIGHTS_BENCHMARKS, "Fase 2"),
      [META_TOOLS.INSIGHTS_AUCTION_RANK]: notImpl(META_TOOLS.INSIGHTS_AUCTION_RANK, "Fase 2"),
      [META_TOOLS.INSIGHTS_OPPORTUNITY]: notImpl(META_TOOLS.INSIGHTS_OPPORTUNITY, "Fase 2"),
      [META_TOOLS.INSIGHTS_ADVERTISER_CONTEXT]: notImpl(META_TOOLS.INSIGHTS_ADVERTISER_CONTEXT, "Fase 2"),
      [META_TOOLS.CATALOG_LIST]: notImpl(META_TOOLS.CATALOG_LIST, "Fase 4"),
      [META_TOOLS.CATALOG_GET]: notImpl(META_TOOLS.CATALOG_GET, "Fase 4"),
      [META_TOOLS.CATALOG_CREATE]: notImpl(META_TOOLS.CATALOG_CREATE, "Fase 4"),
      [META_TOOLS.CATALOG_FEED_GET]: notImpl(META_TOOLS.CATALOG_FEED_GET, "Fase 4"),
      [META_TOOLS.CATALOG_FEED_RULES]: notImpl(META_TOOLS.CATALOG_FEED_RULES, "Fase 4"),
      [META_TOOLS.CATALOG_DIAGNOSTICS]: notImpl(META_TOOLS.CATALOG_DIAGNOSTICS, "Fase 4"),
      [META_TOOLS.CATALOG_PRODUCT_GET]: notImpl(META_TOOLS.CATALOG_PRODUCT_GET, "Fase 4"),
      [META_TOOLS.CATALOG_PRODUCT_SET_GET]: notImpl(META_TOOLS.CATALOG_PRODUCT_SET_GET, "Fase 4"),
      [META_TOOLS.CATALOG_PRODUCT_SET_LIST]: notImpl(META_TOOLS.CATALOG_PRODUCT_SET_LIST, "Fase 4"),
      [META_TOOLS.CATALOG_PRODUCT_SET_CONTENTS]: notImpl(META_TOOLS.CATALOG_PRODUCT_SET_CONTENTS, "Fase 4"),
      [META_TOOLS.DATASET_GET]: notImpl(META_TOOLS.DATASET_GET, "Fase 2"),
      [META_TOOLS.DATASET_STATS]: notImpl(META_TOOLS.DATASET_STATS, "Fase 2"),
      [META_TOOLS.DATASET_QUALITY]: notImpl(META_TOOLS.DATASET_QUALITY, "Fase 2"),
      [META_TOOLS.DATASET_CAPI_ERRORS]: notImpl(META_TOOLS.DATASET_CAPI_ERRORS, "Fase 2")
    };
  }

  private getAdAccounts: ToolHandler = async (args) => {
    const fields =
      (args.fields as string | undefined) ??
      "id,account_id,name,currency,timezone_name,business,account_status,disable_reason,amount_spent,balance";
    return graphPaginate("/me/adaccounts", { ...this.auth(), query: { fields } }, { limit: 100, maxPages: 5 });
  };

  private getEntity: ToolHandler = async (args) => {
    const id = String(args.id ?? args.entityId ?? "");
    if (!id) throw new Error("getEntity: id required");
    const fields =
      (args.fields as string | undefined) ??
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget,buying_type,special_ad_categories,start_time,stop_time,updated_time,created_time";
    return graphRequest(`/${id}`, { ...this.auth(), query: { fields } });
  };

  private getPages: ToolHandler = async (args) => {
    const fields = (args.fields as string | undefined) ?? "id,name,category,picture,tasks";
    return graphPaginate("/me/accounts", { ...this.auth(), query: { fields } });
  };

  private getInsights: ToolHandler = async (args) => {
    const id = String(args.accountId ?? args.entityId ?? args.id ?? "");
    if (!id) throw new Error("getInsights: accountId/entityId required");
    const level = String(args.level ?? "campaign"); // account|campaign|adset|ad
    const fields =
      (args.fields as string | undefined) ??
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,date_start,date_stop";
    const datePreset = args.datePreset as string | undefined;
    const timeRange = args.timeRange as { since: string; until: string } | undefined;
    const breakdowns = args.breakdowns as string | undefined;
    const timeIncrement = args.timeIncrement as number | string | undefined;

    const query: Record<string, string | number> = { level, fields };
    if (datePreset) query.date_preset = datePreset;
    if (timeRange) query.time_range = JSON.stringify(timeRange);
    if (breakdowns) query.breakdowns = breakdowns;
    if (timeIncrement !== undefined) query.time_increment = String(timeIncrement);

    return graphPaginate(`/${id}/insights`, { ...this.auth(), query }, { limit: 500, maxPages: 20 });
  };

  private updateEntity: ToolHandler = async (args) => {
    const id = String(args.id ?? args.entityId ?? "");
    if (!id) throw new Error("updateEntity: id required");
    const body = (args.fields ?? args.body) as Record<string, unknown> | undefined;
    if (!body) throw new Error("updateEntity: fields/body required");
    return graphRequest(`/${id}`, { ...this.auth(), method: "POST", body });
  };

  private activateEntity: ToolHandler = async (args) => {
    const id = String(args.id ?? args.entityId ?? "");
    if (!id) throw new Error("activateEntity: id required");
    return graphRequest(`/${id}`, { ...this.auth(), method: "POST", body: { status: "ACTIVE" } });
  };
}

function notImpl(tool: MetaToolName, phase: string): ToolHandler {
  return async () => {
    throw new NotImplementedError(tool, phase);
  };
}
