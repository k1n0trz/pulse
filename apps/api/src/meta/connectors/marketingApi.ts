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
      [META_TOOLS.CREATE_CAMPAIGN]: this.createCampaign,
      [META_TOOLS.CREATE_AD_SET]: this.createAdSet,
      [META_TOOLS.CREATE_AD]: this.createAd,

      // Stubs — surface a clear error until we wire each one in later phases.
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

  // ---------- Writes (Fase 4) ----------
  // Per Meta's design, entities created via the API land PAUSED by default; we keep
  // that as the safe default. Budgets are in the account currency's minor units (cents).

  private createCampaign: ToolHandler = async (args) => {
    const accountId = String(args.accountId ?? "");
    if (!accountId) throw new Error("createCampaign: accountId required");
    if (!args.name) throw new Error("createCampaign: name required");
    if (!args.objective) throw new Error("createCampaign: objective required");
    const body: Record<string, unknown> = {
      name: args.name,
      objective: args.objective,
      status: args.status ?? "PAUSED",
      special_ad_categories: args.specialAdCategories ?? [],
      ...((args.fields as Record<string, unknown>) ?? {})
    };
    if (args.dailyBudget != null) body.daily_budget = args.dailyBudget;
    if (args.lifetimeBudget != null) body.lifetime_budget = args.lifetimeBudget;
    return graphRequest(`/${accountId}/campaigns`, { ...this.auth(), method: "POST", body });
  };

  private createAdSet: ToolHandler = async (args) => {
    const accountId = String(args.accountId ?? "");
    if (!accountId) throw new Error("createAdSet: accountId required");
    if (!args.campaignId) throw new Error("createAdSet: campaignId required");
    const body: Record<string, unknown> = {
      name: args.name,
      campaign_id: args.campaignId,
      status: args.status ?? "PAUSED",
      ...(args.dailyBudget != null ? { daily_budget: args.dailyBudget } : {}),
      ...(args.lifetimeBudget != null ? { lifetime_budget: args.lifetimeBudget } : {}),
      ...(args.billingEvent ? { billing_event: args.billingEvent } : {}),
      ...(args.optimizationGoal ? { optimization_goal: args.optimizationGoal } : {}),
      ...(args.bidAmount != null ? { bid_amount: args.bidAmount } : {}),
      ...(args.targeting ? { targeting: args.targeting } : {}),
      ...(args.startTime ? { start_time: args.startTime } : {}),
      ...((args.fields as Record<string, unknown>) ?? {})
    };
    return graphRequest(`/${accountId}/adsets`, { ...this.auth(), method: "POST", body });
  };

  private createAd: ToolHandler = async (args) => {
    const accountId = String(args.accountId ?? "");
    if (!accountId) throw new Error("createAd: accountId required");
    if (!args.adsetId) throw new Error("createAd: adsetId required");
    const body: Record<string, unknown> = {
      name: args.name,
      adset_id: args.adsetId,
      status: args.status ?? "PAUSED",
      ...(args.creativeId ? { creative: { creative_id: args.creativeId } } : {}),
      ...(args.creative ? { creative: args.creative } : {}),
      ...((args.fields as Record<string, unknown>) ?? {})
    };
    return graphRequest(`/${accountId}/ads`, { ...this.auth(), method: "POST", body });
  };
}

function notImpl(tool: MetaToolName, phase: string): ToolHandler {
  return async () => {
    throw new NotImplementedError(tool, phase);
  };
}
