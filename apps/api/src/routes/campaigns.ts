import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../auth/context.js";
import { assertActiveSubscription } from "../lib/entitlements.js";
import { createAd, createAdSet, createCampaign, updateCampaign } from "../meta/adWrites.js";

const ListQuery = z.object({
  accountId: z.string().optional(),
  status: z.string().optional(), // ACTIVE | PAUSED | ARCHIVED | ...
  objective: z.string().optional(),
  q: z.string().optional(),
  dateFrom: z.string().optional(), // ISO date — filters on capturedAt
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  // Back-compat: callers can still pass limit for an unpaginated cap.
  limit: z.coerce.number().int().min(1).max(500).optional()
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
    const f = parsed.data;

    const capturedAt: Prisma.DateTimeFilter = {};
    if (f.dateFrom) capturedAt.gte = new Date(f.dateFrom);
    if (f.dateTo) {
      const to = new Date(f.dateTo);
      to.setUTCHours(23, 59, 59, 999);
      capturedAt.lte = to;
    }

    const where: Prisma.CampaignSnapshotWhereInput = {
      organizationId,
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.objective ? { objective: f.objective } : {}),
      ...(f.q ? { name: { contains: f.q, mode: "insensitive" } } : {}),
      ...(Object.keys(capturedAt).length > 0 ? { capturedAt } : {})
    };

    // Back-compat: when `limit` is provided, behave like the old unpaginated call.
    const usePaging = f.limit == null;
    const take = usePaging ? f.pageSize : f.limit;
    const skip = usePaging ? (f.page - 1) * f.pageSize : 0;

    const [total, campaigns] = await Promise.all([
      prisma.campaignSnapshot.count({ where }),
      prisma.campaignSnapshot.findMany({
        where,
        orderBy: [{ capturedAt: "desc" }, { spend: "desc" }],
        skip,
        take,
        include: {
          account: { select: { id: true, metaAccountId: true, name: true, currency: true } },
          dailyMetrics: { orderBy: { date: "asc" } }
        }
      })
    ]);

    return {
      ok: true,
      organizationId,
      count: campaigns.length,
      total,
      page: usePaging ? f.page : 1,
      pageSize: usePaging ? f.pageSize : campaigns.length,
      totalPages: usePaging ? Math.max(1, Math.ceil(total / f.pageSize)) : 1,
      campaigns: campaigns.map(toCampaignDTO)
    };
  });

  // ---------- Writes (Fase 4) — Meta Ads-style management ----------

  const CreateCampaignBody = z.object({
    accountId: z.string().min(1),
    name: z.string().min(1).max(200),
    objective: z.string().min(1),
    status: z.enum(["PAUSED", "ACTIVE"]).optional(),
    dailyBudget: z.number().positive().optional(),
    specialAdCategories: z.array(z.string()).optional()
  });

  app.post("/campaigns", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    await assertActiveSubscription(auth.organizationId, auth.email);
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    const created = await createCampaign({ organizationId: auth.organizationId, userId: auth.userId, accountDbId: parsed.data.accountId, ...parsed.data });
    return reply.code(201).send({ ok: true, id: created.id });
  });

  const UpdateCampaignBody = z.object({
    name: z.string().min(1).max(200).optional(),
    dailyBudget: z.number().positive().optional(),
    status: z.enum(["PAUSED", "ACTIVE"]).optional()
  });

  app.patch("/campaigns/:id", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    await assertActiveSubscription(auth.organizationId, auth.email);
    const id = (req.params as { id: string }).id;
    const parsed = UpdateCampaignBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    await updateCampaign({ organizationId: auth.organizationId, userId: auth.userId, campaignDbId: id, ...parsed.data });
    return { ok: true };
  });

  const StatusBody = z.object({ status: z.enum(["PAUSED", "ACTIVE"]) });

  app.post("/campaigns/:id/status", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    await assertActiveSubscription(auth.organizationId, auth.email);
    const id = (req.params as { id: string }).id;
    const parsed = StatusBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    await updateCampaign({ organizationId: auth.organizationId, userId: auth.userId, campaignDbId: id, status: parsed.data.status });
    return { ok: true };
  });

  const CreateAdSetBody = z.object({
    accountId: z.string().min(1),
    campaignId: z.string().min(1), // meta campaign id
    name: z.string().min(1).max(200),
    dailyBudget: z.number().positive().optional(),
    billingEvent: z.string().optional(),
    optimizationGoal: z.string().optional(),
    targeting: z.record(z.unknown()).optional(),
    status: z.enum(["PAUSED", "ACTIVE"]).optional()
  });

  app.post("/ad-sets", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    await assertActiveSubscription(auth.organizationId, auth.email);
    const parsed = CreateAdSetBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    const created = await createAdSet({ organizationId: auth.organizationId, userId: auth.userId, accountDbId: parsed.data.accountId, ...parsed.data });
    return reply.code(201).send({ ok: true, id: created.id });
  });

  const CreateAdBody = z.object({
    accountId: z.string().min(1),
    adsetId: z.string().min(1),
    name: z.string().min(1).max(200),
    creativeId: z.string().optional(),
    status: z.enum(["PAUSED", "ACTIVE"]).optional()
  });

  app.post("/ads", async (req, reply) => {
    const auth = await req.getAuth();
    requireRole(auth, "ANALYST");
    await assertActiveSubscription(auth.organizationId, auth.email);
    const parsed = CreateAdBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    const created = await createAd({ organizationId: auth.organizationId, userId: auth.userId, accountDbId: parsed.data.accountId, ...parsed.data });
    return reply.code(201).send({ ok: true, id: created.id });
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
