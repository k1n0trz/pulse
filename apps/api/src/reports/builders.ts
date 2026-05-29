// Report data builders — pull from snapshots and shape into report-ready
// structures. Pure-ish (only DB reads), so exporters stay format-only.

import { prisma } from "../db/prisma.js";

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

export async function buildExecutiveReport(organizationId: string): Promise<ExecutiveReport> {
  const [org, campaignsRaw, recommendations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.campaignSnapshot.findMany({
      where: { organizationId },
      orderBy: { capturedAt: "desc" },
      take: 500,
      include: { account: { select: { name: true, currency: true } } }
    }),
    prisma.recommendation.findMany({
      where: { organizationId, status: "OPEN" },
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
    windowLabel: "Snapshot actual",
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

export async function buildCampaignRows(organizationId: string): Promise<CampaignRow[]> {
  const campaigns = await prisma.campaignSnapshot.findMany({
    where: { organizationId },
    orderBy: { spend: "desc" },
    take: 1000,
    include: { account: { select: { name: true, currency: true } } }
  });
  return campaigns.map(toRow);
}
