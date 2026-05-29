import { describe, expect, it } from "vitest";
import { campaignsToCsv, campaignsToXlsx, executiveToPdf } from "./exporters.js";
import type { CampaignRow, ExecutiveReport } from "./builders.js";

const rows: CampaignRow[] = [
  {
    name: "Black Friday | CBO",
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
    account: "k1n0",
    currency: "COP",
    budget: 100000,
    spend: 152430,
    results: 512,
    cpa: 297,
    roas: 3.85,
    ctr: 2.41,
    cpm: 18.7,
    frequency: 2.2,
    phase: "active"
  },
  {
    name: 'Campaign with "quotes", commas',
    objective: "OUTCOME_LEADS",
    status: "PAUSED",
    account: "UVA",
    currency: "COP",
    budget: 0,
    spend: 0,
    results: 0,
    cpa: null,
    roas: null,
    ctr: null,
    cpm: null,
    frequency: null,
    phase: null
  }
];

const report: ExecutiveReport = {
  organizationName: "Demo Org",
  generatedAt: new Date().toISOString(),
  windowLabel: "Snapshot actual",
  totals: { spend: 152430, results: 512, campaigns: 2, activeCampaigns: 1, avgCpa: 297, weightedRoas: 3.85, avgCtr: 2.41 },
  topByRoas: rows.slice(0, 1),
  worstByCpa: rows.slice(0, 1),
  openRecommendations: [{ title: "Escalar ganadora", severity: "MEDIUM", expectedImpact: "+15% spend", type: "SCALE_BUDGET" }],
  campaigns: rows
};

describe("exporters", () => {
  it("CSV escapes quotes/commas and includes a header", () => {
    const file = campaignsToCsv(rows);
    const text = file.buffer.toString("utf8");
    expect(file.contentType).toContain("text/csv");
    expect(file.filename).toMatch(/\.csv$/);
    expect(text).toContain("Campaña,Objetivo");
    expect(text).toContain('"Campaign with ""quotes"", commas"');
  });

  it("XLSX produces a non-empty zip (PK header)", async () => {
    const file = await campaignsToXlsx(rows);
    expect(file.contentType).toContain("spreadsheetml");
    expect(file.buffer.length).toBeGreaterThan(1000);
    // .xlsx is a zip — starts with PK
    expect(file.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("PDF produces a non-empty doc (%PDF header)", async () => {
    const file = await executiveToPdf(report);
    expect(file.contentType).toBe("application/pdf");
    expect(file.buffer.length).toBeGreaterThan(500);
    expect(file.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
