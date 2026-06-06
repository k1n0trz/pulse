// Report data builders — pull from snapshots and shape into report-ready
// structures. Pure-ish (only DB reads), so exporters stay format-only.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export interface ReportFilters {
  accountIds?: string[];
  businessId?: string;
  campaignIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

function buildWhere(organizationId: string, f: ReportFilters = {}): Prisma.CampaignSnapshotWhereInput {
  const capturedAt: Prisma.DateTimeFilter = {};
  if (f.dateFrom) capturedAt.gte = new Date(f.dateFrom);
  if (f.dateTo) {
    const to = new Date(f.dateTo);
    to.setUTCHours(23, 59, 59, 999);
    capturedAt.lte = to;
  }
  return {
    organizationId,
    ...(f.accountIds && f.accountIds.length > 0 ? { accountId: { in: f.accountIds } } : {}),
    ...(f.campaignIds && f.campaignIds.length > 0 ? { id: { in: f.campaignIds } } : {}),
    ...(f.businessId ? { account: { businessId: f.businessId } } : {}),
    ...(Object.keys(capturedAt).length > 0 ? { capturedAt } : {})
  };
}

function windowLabel(f: ReportFilters): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("es-MX");
  if (f.dateFrom && f.dateTo) return `${fmt(f.dateFrom)} – ${fmt(f.dateTo)}`;
  if (f.dateFrom) return `Desde ${fmt(f.dateFrom)}`;
  if (f.dateTo) return `Hasta ${fmt(f.dateTo)}`;
  return "Snapshot actual";
}

export interface CampaignRow {
  name: string;
  objective: string;
  status: string;
  account: string;
  currency: string;
  budget: number;
  spend: number;
  results: number;
  cpa: number | null;
  roas: number | null;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
  phase: string | null;
}

export interface ExecutiveReport {
  organizationName: string;
  generatedAt: string;
  windowLabel: string;
  totals: {
    spend: number;
    results: number;
    campaigns: number;
    activeCampaigns: number;
    avgCpa: number | null;
    weightedRoas: number | null;
    avgCtr: number | null;
  };
  topByRoas: CampaignRow[];
  worstByCpa: CampaignRow[];
  openRecommendations: Array<{ title: string; severity: string; expectedImpact: string; type: string }>;
  campaigns: CampaignRow[];
}

function toRow(c: Awaited<ReturnType<typeof prisma.campaignSnapshot.findMany>>[number] & { account?: { name: string; currency: string } | null }): CampaignRow {
  return {
    name: c.name,
    objective: c.objective,
    status: c.status,
    account: c.account?.name ?? "—",
    currency: c.account?.currency ?? "",
    budget: Number(c.dailyBudget ?? c.lifetimeBudget ?? 0),
    spend: Number(c.spend),
    results: c.results,
    cpa: c.cpa === null ? null : Number(c.cpa),
    roas: c.roas === null ? null : Number(c.roas),
    ctr: c.ctr === null ? null : Number(c.ctr),
    cpm: c.cpm === null ? null : Number(c.cpm),
    frequency: c.frequency === null ? null : Number(c.frequency),
    phase: c.phase
  };
}

export async function buildExecutiveReport(organizationId: string, filters: ReportFilters = {}): Promise<ExecutiveReport> {
  const where = buildWhere(organizationId, filters);
  const [org, campaignsRaw, recommendations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.campaignSnapshot.findMany({
      where,
      orderBy: { capturedAt: "desc" },
      take: 500,
      include: { account: { select: { name: true, currency: true } } }
    }),
    prisma.recommendation.findMany({
      where: { organizationId, status: "OPEN", ...(filters.campaignIds && filters.campaignIds.length > 0 ? { campaignId: { in: filters.campaignIds } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  const rows = campaignsRaw.map(toRow);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const results = rows.reduce((s, r) => s + r.results, 0);
  const activeCampaigns = rows.filter((r) => r.status.toLowerCase() === "active").length;
  const weightedRoasNum = rows.reduce((s, r) => s + (r.roas ?? 0) * r.spend, 0);
  const weightedRoas = spend > 0 ? Number((weightedRoasNum / spend).toFixed(2)) : null;
  const avgCpa = results > 0 ? Number((spend / results).toFixed(2)) : null;
  const ctrRows = rows.filter((r) => r.ctr !== null);
  const avgCtr = ctrRows.length > 0 ? Number((ctrRows.reduce((s, r) => s + (r.ctr ?? 0), 0) / ctrRows.length).toFixed(2)) : null;

  const topByRoas = [...rows].filter((r) => r.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0)).slice(0, 5);
  const worstByCpa = [...rows].filter((r) => r.cpa !== null && r.results > 0).sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0)).slice(0, 5);

  return {
    organizationName: org.name,
    generatedAt: new Date().toISOString(),
    windowLabel: windowLabel(filters),
    totals: {
      spend: Number(spend.toFixed(2)),
      results,
      campaigns: rows.length,
      activeCampaigns,
      avgCpa,
      weightedRoas,
      avgCtr
    },
    topByRoas,
    worstByCpa,
    openRecommendations: recommendations.map((r) => ({
      title: r.title,
      severity: r.severity,
      expectedImpact: r.expectedImpact,
      type: r.type
    })),
    campaigns: rows
  };
}

export async function buildCampaignRows(organizationId: string, filters: ReportFilters = {}): Promise<CampaignRow[]> {
  const campaigns = await prisma.campaignSnapshot.findMany({
    where: buildWhere(organizationId, filters),
    orderBy: { spend: "desc" },
    take: 1000,
    include: { account: { select: { name: true, currency: true } } }
  });
  return campaigns.map(toRow);
}

export interface ReportOptions {
  portfolios: Array<{ businessId: string; accounts: number }>;
  accounts: Array<{ id: string; name: string; businessId: string | null }>;
  campaigns: Array<{ id: string; name: string; accountId: string }>;
}

/** Selectable dimensions for the report gateway (portfolio · account · campaign). */
export async function buildReportOptions(organizationId: string): Promise<ReportOptions> {
  const [accounts, campaigns] = await Promise.all([
    prisma.metaAdAccount.findMany({
      where: { organizationId },
      select: { id: true, name: true, businessId: true },
      orderBy: { name: "asc" }
    }),
    prisma.campaignSnapshot.findMany({
      where: { organizationId },
      select: { id: true, name: true, accountId: true },
      orderBy: { capturedAt: "desc" },
      take: 500
    })
  ]);

  const portfolioCounts = new Map<string, number>();
  for (const a of accounts) {
    if (a.businessId) portfolioCounts.set(a.businessId, (portfolioCounts.get(a.businessId) ?? 0) + 1);
  }
  // De-duplicate campaigns by id (snapshots repeat) keeping the latest.
  const seen = new Set<string>();
  const uniqueCampaigns = campaigns.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  return {
    portfolios: [...portfolioCounts.entries()].map(([businessId, accounts]) => ({ businessId, accounts })),
    accounts,
    campaigns: uniqueCampaigns
  };
}
