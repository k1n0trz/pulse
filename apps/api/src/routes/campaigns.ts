import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const ListQuery = z.object({
  accountId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

const InsightsQuery = z.object({
  campaignId: z.string().optional(),
  accountId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(180).default(30)
});

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.get("/campaigns", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();

    const campaigns = await prisma.campaignSnapshot.findMany({
      where: {
        organizationId,
        ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {})
      },
      orderBy: [{ capturedAt: "desc" }, { spend: "desc" }],
      take: parsed.data.limit,
      include: {
        account: { select: { id: true, metaAccountId: true, name: true, currency: true } },
        dailyMetrics: { orderBy: { date: "asc" } }
      }
    });

    return {
      ok: true,
      organizationId,
      count: campaigns.length,
      campaigns: campaigns.map(toCampaignDTO)
    };
  });

  app.get("/insights/trend", async (req, reply) => {
    const Query = z.object({
      accountId: z.string().optional(),
      days: z.coerce.number().int().min(1).max(180).default(30)
    });
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - parsed.data.days);

    const rows = await prisma.dailyMetricSnapshot.findMany({
      where: {
        date: { gte: since },
        campaign: {
          organizationId,
          ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {})
        }
      },
      orderBy: { date: "asc" },
      select: { date: true, spend: true, results: true, conversions: true, roas: true, cpa: true }
    });

    // Aggregate by date.
    const byDate = new Map<string, { spend: number; results: number; conversions: number; roasNum: number; roasDen: number }>();
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const acc = byDate.get(key) ?? { spend: 0, results: 0, conversions: 0, roasNum: 0, roasDen: 0 };
      const spend = Number(r.spend);
      acc.spend += spend;
      acc.results += r.results;
      acc.conversions += r.conversions;
      if (r.roas !== null) {
        acc.roasNum += Number(r.roas) * spend;
        acc.roasDen += spend;
      }
      byDate.set(key, acc);
    }

    const trend = [...byDate.entries()].map(([date, a]) => ({
      date,
      spend: Number(a.spend.toFixed(2)),
      results: a.results,
      conversions: a.conversions,
      roas: a.roasDen > 0 ? Number((a.roasNum / a.roasDen).toFixed(2)) : 0,
      cpa: a.results > 0 ? Number((a.spend / a.results).toFixed(2)) : 0
    }));

    return { ok: true, days: parsed.data.days, points: trend.length, trend };
  });

  app.get("/insights", async (req, reply) => {
    const parsed = InsightsQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - parsed.data.days);

    const rows = await prisma.dailyMetricSnapshot.findMany({
      where: {
        date: { gte: since },
        campaign: {
          organizationId,
          ...(parsed.data.campaignId ? { id: parsed.data.campaignId } : {}),
          ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {})
        }
      },
      orderBy: { date: "asc" },
      include: { campaign: { select: { id: true, name: true, accountId: true } } }
    });

    return {
      ok: true,
      count: rows.length,
      rows: rows.map((r) => ({
        ...r,
        impressions: r.impressions === null ? null : Number(r.impressions),
        clicks: r.clicks === null ? null : Number(r.clicks),
        spend: Number(r.spend),
        cpa: r.cpa === null ? null : Number(r.cpa),
        roas: r.roas === null ? null : Number(r.roas),
        ctr: r.ctr === null ? null : Number(r.ctr),
        cpm: r.cpm === null ? null : Number(r.cpm),
        frequency: r.frequency === null ? null : Number(r.frequency)
      }))
    };
  });
};

function toCampaignDTO(c: Awaited<ReturnType<typeof prisma.campaignSnapshot.findMany>>[number] & { account?: { metaAccountId: string; name: string; currency: string } | null }) {
  return {
    id: c.id,
    metaCampaignId: c.metaCampaignId,
    name: c.name,
    objective: c.objective,
    status: c.status,
    effectiveStatus: c.effectiveStatus,
    budget: Number(c.dailyBudget ?? c.lifetimeBudget ?? 0),
    spend: Number(c.spend),
    results: c.results,
    cpa: c.cpa ? Number(c.cpa) : null,
    roas: c.roas ? Number(c.roas) : null,
    ctr: c.ctr ? Number(c.ctr) : null,
    cpm: c.cpm ? Number(c.cpm) : null,
    frequency: c.frequency ? Number(c.frequency) : null,
    phase: c.phase,
    critical: c.critical,
    learningLimited: c.learningLimited,
    account: c.account,
    windowStart: c.windowStart,
    windowEnd: c.windowEnd,
    capturedAt: c.capturedAt
  };
}
