// Meta Ads CLI / MCP integration contracts.
// Mirrors the 29 official tools Meta exposes through the Ads AI Connectors (open beta, April 2026)
// and adds Pulse-specific wrappers.

export type MetaConnectorProvider = "ads-cli" | "ads-mcp" | "marketing-api" | "mock";

export type MetaOAuthScope = "ads_read" | "ads_management" | "ads_management_finance";

export type MetaAuthScopeTier = "read" | "read_write" | "read_write_finance";

export type MetaEntityKind = "campaign" | "ad_set" | "ad" | "creative" | "audience" | "catalog" | "product_set";

export type MetaEntityStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "ARCHIVED"
  | "PREAPPROVED"
  | "PENDING_REVIEW"
  | "DISAPPROVED"
  | "WITH_ISSUES";

export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string;
  timezoneName: string;
  businessId?: string;
  status: "ACTIVE" | "DISABLED" | "UNSETTLED" | "PENDING_RISK_REVIEW" | "PENDING_SETTLEMENT" | "IN_GRACE_PERIOD" | "PENDING_CLOSURE" | "CLOSED" | "ANY_ACTIVE";
}

export interface MetaCampaignSummary {
  id: string;
  accountId: string;
  name: string;
  objective: string;
  status: MetaEntityStatus;
  effectiveStatus: MetaEntityStatus;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startTime?: string;
  stopTime?: string;
  buyingType?: "AUCTION" | "RESERVED";
  specialAdCategories?: string[];
}

export interface MetaInsightsRow {
  entityId: string;
  entityKind: MetaEntityKind;
  dateStart: string;
  dateStop: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc?: number;
  reach?: number;
  frequency?: number;
  results?: number;
  costPerResult?: number;
  roas?: number;
  conversions?: number;
  conversionValue?: number;
}

export interface MetaToolResult<T = unknown> {
  ok: boolean;
  provider: MetaConnectorProvider;
  tool: string;
  message: string;
  data?: T;
  raw?: unknown;
  requestId?: string;
  durationMs?: number;
}

// The 29 official tools exposed by Meta Ads CLI / MCP (open beta, April 2026).
export const META_TOOLS = {
  // Campaign management (5)
  CREATE_CAMPAIGN: "ads_create_campaign",
  CREATE_AD_SET: "ads_create_ad_set",
  CREATE_AD: "ads_create_ad",
  UPDATE_ENTITY: "ads_update_entity",
  ACTIVATE_ENTITY: "ads_activate_entity",
  // Accounts & assets (3)
  GET_AD_ACCOUNTS: "ads_get_ad_accounts",
  GET_AD_ENTITY: "ads_get_ad_entity",
  GET_PAGES: "ads_get_pages",
  // Product catalog (10)
  CATALOG_CREATE: "ads_catalog_create",
  CATALOG_LIST: "ads_catalog_list",
  CATALOG_GET: "ads_catalog_get",
  CATALOG_FEED_GET: "ads_catalog_feed_get",
  CATALOG_FEED_RULES: "ads_catalog_feed_rules",
  CATALOG_DIAGNOSTICS: "ads_catalog_diagnostics",
  CATALOG_PRODUCT_GET: "ads_catalog_product_get",
  CATALOG_PRODUCT_SET_GET: "ads_catalog_product_set_get",
  CATALOG_PRODUCT_SET_LIST: "ads_catalog_product_set_list",
  CATALOG_PRODUCT_SET_CONTENTS: "ads_catalog_product_set_contents",
  // Dataset quality (4)
  DATASET_GET: "ads_dataset_get",
  DATASET_STATS: "ads_dataset_stats",
  DATASET_QUALITY: "ads_dataset_quality",
  DATASET_CAPI_ERRORS: "ads_dataset_capi_errors",
  // Insights & benchmarks (7)
  INSIGHTS_GET: "ads_insights_get",
  INSIGHTS_TRENDS: "ads_insights_trends",
  INSIGHTS_ANOMALIES: "ads_insights_anomalies",
  INSIGHTS_AUCTION_RANK: "ads_insights_auction_rank",
  INSIGHTS_BENCHMARKS: "ads_insights_benchmarks",
  INSIGHTS_OPPORTUNITY: "ads_insights_opportunity",
  INSIGHTS_ADVERTISER_CONTEXT: "ads_insights_advertiser_context"
} as const;

export type MetaToolName = (typeof META_TOOLS)[keyof typeof META_TOOLS];

export interface MetaConnector {
  name: MetaConnectorProvider;
  invoke<T = unknown>(input: { tool: MetaToolName; args: Record<string, unknown> }): Promise<MetaToolResult<T>>;
}

export const metaConnectorPrinciples = [
  "No se hardcodean endpoints de Meta Marketing API: todo pasa por el adapter MetaConnector.",
  "Ads CLI/MCP se integran como dos providers del mismo contrato (`ads-cli`, `ads-mcp`).",
  "Toda mutacion pasa por modo operativo, politicas de riesgo, auditoria y registro de aprendizaje.",
  "Campanas nuevas, anuncios nuevos y cambios masivos quedan bloqueados sin aprobacion humana.",
  "Entidades creadas por CLI/MCP nacen siempre en PAUSED por diseno de Meta; activacion requiere humano."
];
