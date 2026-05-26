import { prisma } from "../db/prisma.js";
import { decryptString } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import { loadEnv } from "../lib/env.js";
import { graphPaginate } from "./graphClient.js";
import type { Prisma } from "@prisma/client";

const env = loadEnv();

function token(connection: { accessTokenEnc: string }): string {
  return decryptString(connection.accessTokenEnc);
}

function auth(connection: { accessTokenEnc: string }) {
  return { accessToken: token(connection), appsecretProofSecret: env.META_APP_SECRET };
}

// ---------- Ad accounts ----------

interface MetaAdAccountRaw {
  id: string;
  account_id?: string;
  name: string;
  currency: string;
  timezone_name: string;
  business?: { id: string };
  account_status: number;
}

const ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED"
};

export async function syncAdAccounts(connectionId: string): Promise<{ created: number; updated: number }> {
  const connection = await prisma.metaConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const accounts = await graphPaginate<MetaAdAccountRaw>(
    "/me/adaccounts",
    {
      ...auth(connection),
      query: { fields: "id,account_id,name,currency,timezone_name,business,account_status" }
    },
    { limit: 100, maxPages: 5 }
  );

  let created = 0;
  let updated = 0;

  for (const acct of accounts) {
    const status = ACCOUNT_STATUS_MAP[acct.account_status] ?? `UNKNOWN_${acct.account_status}`;
    const result = await prisma.metaAdAccount.upsert({
      where: { organizationId_metaAccountId: { organizationId: connection.organizationId, metaAccountId: acct.id } },
      create: {
        organizationId: connection.organizationId,
        connectionId: connection.id,
        metaAccountId: acct.id,
        name: acct.name,
        currency: acct.currency,
        timezoneName: acct.timezone_name,
        businessId: acct.business?.id,
        status,
        lastSyncAt: new Date()
      },
      update: {
        connectionId: connection.id,
        name: acct.name,
        currency: acct.currency,
        timezoneName: acct.timezone_name,
        businessId: acct.business?.id,
        status,
        lastSyncAt: new Date()
      }
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
    else updated += 1;
  }

  await prisma.metaConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date() } });
  logger.info({ connectionId, created, updated }, "syncAdAccounts complete");
  return { created, updated };
}

// ---------- Campaigns + insights ----------

interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface MetaInsightRaw {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

const RESULT_ACTION_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "lead",
  "complete_registration",
  "submit_application",
  "subscribe",
  "messaging_conversation_started_7d"
]);

function sumActionsByType(actions: MetaInsightRaw["actions"]): number {
  if (!actions) return 0;
  return actions.reduce((total, action) => (RESULT_ACTION_TYPES.has(action.action_type) ? total + Number(action.value) : total), 0);
}

function roasFromInsights(row: MetaInsightRaw): number | null {
  if (row.purchase_roas?.[0]?.value) return Number(row.purchase_roas[0].value);
  if (row.action_values) {
    const purchaseValue = row.action_values.find((v) => v.action_type === "purchase" || v.action_type === "omni_purchase");
    if (purchaseValue && row.spend) {
      const value = Number(purchaseValue.value);
      const spend = Number(row.spend);
      if (spend > 0) return value / spend;
    }
  }
  return null;
}

function inferPhase(opts: { frequency: number; ctr: number; conversions: number }): string {
  if (opts.conversions === 0 && opts.ctr > 1) return "loser";
  if (opts.frequency > 3) return "fatigued";
  if (opts.conversions > 0) return "active";
  return "learning";
}

export interface SyncCampaignsOpts {
  /** Date window for the insight rollup. Default: last 7 days. */
  datePreset?: "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "last_90d";
}

export async function syncCampaigns(accountDbId: string, opts: SyncCampaignsOpts = {}): Promise<{ campaigns: number; metrics: number }> {
  const account = await prisma.metaAdAccount.findUniqueOrThrow({
    where: { id: accountDbId },
    include: { connection: true }
  });
  const datePreset = opts.datePreset ?? "last_7d";
  const a = auth(account.connection);

  // 1) Campaigns
  const campaigns = await graphPaginate<MetaCampaignRaw>(
    `/${account.metaAccountId}/campaigns`,
    {
      ...a,
      query: {
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type",
        effective_status: ["ACTIVE", "PAUSED", "WITH_ISSUES", "LIMITED"].join(",")
      }
    },
    { limit: 200, maxPages: 10 }
  );

  // 2) Aggregate insights at campaign level for the window
  const insightsAgg = await graphPaginate<MetaInsightRaw>(
    `/${account.metaAccountId}/insights`,
    {
      ...a,
      query: {
        level: "campaign",
        date_preset: datePreset,
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,date_start,date_stop"
      }
    },
    { limit: 500, maxPages: 20 }
  );

  // 3) Daily breakdown for trend charts
  const insightsDaily = await graphPaginate<MetaInsightRaw>(
    `/${account.metaAccountId}/insights`,
    {
      ...a,
      query: {
        level: "campaign",
        date_preset: datePreset,
        time_increment: "1",
        fields: "campaign_id,spend,impressions,reach,clicks,ctr,cpm,frequency,actions,action_values,purchase_roas,date_start,date_stop"
      }
    },
    { limit: 1000, maxPages: 30 }
  );

  const aggByCampaign = new Map(insightsAgg.map((row) => [row.campaign_id, row]));
  const dailyByCampaign = new Map<string, MetaInsightRaw[]>();
  for (const row of insightsDaily) {
    const list = dailyByCampaign.get(row.campaign_id) ?? [];
    list.push(row);
    dailyByCampaign.set(row.campaign_id, list);
  }

  let campaignsWritten = 0;
  let metricsWritten = 0;

  // Window dates approximate the date_preset for the unique constraint.
  const now = new Date();
  const windowDays = datePreset === "last_30d" ? 30 : datePreset === "last_14d" ? 14 : datePreset === "last_90d" ? 90 : 7;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(now);
  windowEnd.setUTCHours(0, 0, 0, 0);

  for (const c of campaigns) {
    const insight = aggByCampaign.get(c.id);
    const spend = Number(insight?.spend ?? 0);
    const results = sumActionsByType(insight?.actions);
    const cpa = results > 0 ? spend / results : null;
    const roas = insight ? roasFromInsights(insight) : null;
    const ctr = Number(insight?.ctr ?? 0);
    const cpm = Number(insight?.cpm ?? 0);
    const frequency = Number(insight?.frequency ?? 0);
    const phase = inferPhase({ frequency, ctr, conversions: results });

    const snapshot = await prisma.campaignSnapshot.upsert({
      where: {
        accountId_metaCampaignId_windowStart_windowEnd: {
          accountId: account.id,
          metaCampaignId: c.id,
          windowStart,
          windowEnd
        }
      },
      create: {
        organizationId: account.organizationId,
        accountId: account.id,
        metaCampaignId: c.id,
        name: c.name,
        objective: c.objective ?? "UNKNOWN",
        status: c.status,
        effectiveStatus: c.effective_status,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        spend,
        results,
        cpa,
        roas,
        ctr,
        cpm,
        frequency,
        phase,
        critical: false,
        learningLimited: c.effective_status === "LIMITED" || c.effective_status === "LEARNING_LIMITED",
        windowStart,
        windowEnd,
        rawJson: insight as unknown as Prisma.InputJsonValue
      },
      update: {
        name: c.name,
        objective: c.objective ?? "UNKNOWN",
        status: c.status,
        effectiveStatus: c.effective_status,
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        spend,
        results,
        cpa,
        roas,
        ctr,
        cpm,
        frequency,
        phase,
        learningLimited: c.effective_status === "LIMITED" || c.effective_status === "LEARNING_LIMITED",
        rawJson: insight as unknown as Prisma.InputJsonValue,
        capturedAt: new Date()
      }
    });
    campaignsWritten += 1;

    const days = dailyByCampaign.get(c.id) ?? [];
    for (const day of days) {
      const dayResults = sumActionsByType(day.actions);
      const daySpend = Number(day.spend ?? 0);
      await prisma.dailyMetricSnapshot.upsert({
        where: { campaignId_date: { campaignId: snapshot.id, date: new Date(day.date_start) } },
        create: {
          campaignId: snapshot.id,
          date: new Date(day.date_start),
          spend: daySpend,
          results: dayResults,
          cpa: dayResults > 0 ? daySpend / dayResults : null,
          roas: roasFromInsights(day),
          ctr: Number(day.ctr ?? 0),
          cpm: Number(day.cpm ?? 0),
          conversions: dayResults,
          frequency: Number(day.frequency ?? 0),
          impressions: day.impressions ? BigInt(day.impressions) : null,
          clicks: day.clicks ? BigInt(day.clicks) : null
        },
        update: {
          spend: daySpend,
          results: dayResults,
          cpa: dayResults > 0 ? daySpend / dayResults : null,
          roas: roasFromInsights(day),
          ctr: Number(day.ctr ?? 0),
          cpm: Number(day.cpm ?? 0),
          conversions: dayResults,
          frequency: Number(day.frequency ?? 0),
          impressions: day.impressions ? BigInt(day.impressions) : null,
          clicks: day.clicks ? BigInt(day.clicks) : null
        }
      });
      metricsWritten += 1;
    }
  }

  await prisma.metaAdAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  await prisma.auditEvent.create({
    data: {
      organizationId: account.organizationId,
      type: "meta.account.synced",
      severity: "INFO",
      message: `Synced account ${account.metaAccountId} (${campaignsWritten} campaigns, ${metricsWritten} day rows)`
    }
  });
  logger.info({ accountId: account.id, campaignsWritten, metricsWritten }, "syncCampaigns complete");
  return { campaigns: campaignsWritten, metrics: metricsWritten };
}

export async function syncAllForConnection(connectionId: string, opts: SyncCampaignsOpts = {}) {
  const accountsResult = await syncAdAccounts(connectionId);
  const accounts = await prisma.metaAdAccount.findMany({
    where: { connectionId, enabled: true }
  });
  let totalCampaigns = 0;
  let totalMetrics = 0;
  for (const account of accounts) {
    const { campaigns, metrics } = await syncCampaigns(account.id, opts);
    totalCampaigns += campaigns;
    totalMetrics += metrics;
  }
  return { ...accountsResult, campaigns: totalCampaigns, metrics: totalMetrics };
}
