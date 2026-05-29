import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { buildCampaignRows, buildExecutiveReport } from "../reports/builders.js";
import { campaignsToCsv, campaignsToXlsx, executiveToPdf, executiveToXlsx, type ExportedFile } from "../reports/exporters.js";

const ExecutiveQuery = z.object({
  format: z.enum(["pdf", "xlsx", "json"]).default("json")
});

const CampaignsQuery = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv")
});

function sendFile(reply: import("fastify").FastifyReply, file: ExportedFile) {
  reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `attachment; filename="${file.filename}"`)
    .header("Content-Length", String(file.buffer.length))
    .send(file.buffer);
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/reports/executive", async (req, reply) => {
    const parsed = ExecutiveQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query" });
    const { organizationId } = await req.getAuth();
    const report = await buildExecutiveReport(organizationId);

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
    const rows = await buildCampaignRows(organizationId);
    const file = parsed.data.format === "xlsx" ? await campaignsToXlsx(rows) : campaignsToCsv(rows);
    return sendFile(reply, file);
  });
};
