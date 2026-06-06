import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { buildCampaignRows, buildExecutiveReport, buildReportOptions, type ReportFilters } from "../reports/builders.js";
import { campaignsToCsv, campaignsToXlsx, executiveToPdf, executiveToXlsx, type ExportedFile } from "../reports/exporters.js";

const csv = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

const FilterQuery = z.object({
  accountIds: z.string().optional(),
  businessId: z.string().optional(),
  campaignIds: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

function parseFilters(q: z.infer<typeof FilterQuery>): ReportFilters {
  return {
    accountIds: csv(q.accountIds),
    businessId: q.businessId || undefined,
    campaignIds: csv(q.campaignIds),
    dateFrom: q.dateFrom || undefined,
    dateTo: q.dateTo || undefined
  };
}

const ExecutiveQuery = FilterQuery.extend({ format: z.enum(["pdf", "xlsx", "json"]).default("json") });
const CampaignsQuery = FilterQuery.extend({ format: z.enum(["csv", "xlsx"]).default("xlsx") });

function sendFile(reply: import("fastify").FastifyReply, file: ExportedFile) {
  reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `attachment; filename="${file.filename}"`)
    .header("Content-Length", String(file.buffer.length))
    .send(file.buffer);
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/reports/options", async (req) => {
    const { organizationId } = await req.getAuth();
    const options = await buildReportOptions(organizationId);
    return { ok: true, ...options };
  });

  app.get("/reports/executive", async (req, reply) => {
    const parsed = ExecutiveQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();
    const report = await buildExecutiveReport(organizationId, parseFilters(parsed.data));

    if (parsed.data.format === "json") {
      return { ok: true, report };
    }
    const file = parsed.data.format === "pdf" ? await executiveToPdf(report) : await executiveToXlsx(report);
    return sendFile(reply, file);
  });

  app.get("/reports/campaigns", async (req, reply) => {
    const parsed = CampaignsQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();
    const rows = await buildCampaignRows(organizationId, parseFilters(parsed.data));
    const file = parsed.data.format === "csv" ? campaignsToCsv(rows) : await campaignsToXlsx(rows);
    return sendFile(reply, file);
  });
};
