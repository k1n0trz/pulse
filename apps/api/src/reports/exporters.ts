// Format-only exporters. Take report data, emit Buffer + content-type + filename.

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { CampaignRow, ExecutiveReport } from "./builders.js";

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const CAMPAIGN_HEADERS = ["Campaña", "Objetivo", "Estado", "Cuenta", "Moneda", "Presupuesto", "Gasto", "Resultados", "CPA", "ROAS", "CTR", "CPM", "Frecuencia", "Fase"];

function campaignToArray(c: CampaignRow): (string | number)[] {
  return [
    c.name,
    c.objective,
    c.status,
    c.account,
    c.currency,
    c.budget,
    c.spend,
    c.results,
    c.cpa ?? "",
    c.roas ?? "",
    c.ctr ?? "",
    c.cpm ?? "",
    c.frequency ?? "",
    c.phase ?? ""
  ];
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function campaignsToCsv(rows: CampaignRow[]): ExportedFile {
  const lines = [CAMPAIGN_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(campaignToArray(row).map(csvEscape).join(","));
  }
  // BOM so Excel opens UTF-8 correctly
  const buffer = Buffer.from("﻿" + lines.join("\r\n"), "utf8");
  return { buffer, contentType: "text/csv; charset=utf-8", filename: `pulse-campaigns-${dateStamp()}.csv` };
}

export async function campaignsToXlsx(rows: CampaignRow[], sheetName = "Campañas"): Promise<ExportedFile> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulse";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(CAMPAIGN_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const row of rows) ws.addRow(campaignToArray(row));
  // Currency-ish columns
  ws.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 36 : 14;
  });
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `pulse-campaigns-${dateStamp()}.xlsx`
  };
}

export async function executiveToXlsx(report: ExecutiveReport): Promise<ExportedFile> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulse";
  wb.created = new Date();

  const summary = wb.addWorksheet("Resumen");
  summary.addRow(["Pulse — Reporte ejecutivo"]);
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.addRow(["Organización", report.organizationName]);
  summary.addRow(["Generado", new Date(report.generatedAt).toLocaleString("es-MX")]);
  summary.addRow([]);
  summary.addRow(["Métrica", "Valor"]);
  summary.getRow(5).font = { bold: true };
  summary.addRow(["Inversión total", report.totals.spend]);
  summary.addRow(["Resultados", report.totals.results]);
  summary.addRow(["Campañas", report.totals.campaigns]);
  summary.addRow(["Campañas activas", report.totals.activeCampaigns]);
  summary.addRow(["CPA promedio", report.totals.avgCpa ?? "—"]);
  summary.addRow(["ROAS ponderado", report.totals.weightedRoas ?? "—"]);
  summary.addRow(["CTR promedio", report.totals.avgCtr ?? "—"]);
  summary.getColumn(1).width = 22;
  summary.getColumn(2).width = 28;

  const recs = wb.addWorksheet("Recomendaciones");
  recs.addRow(["Severidad", "Tipo", "Título", "Impacto esperado"]);
  recs.getRow(1).font = { bold: true };
  for (const r of report.openRecommendations) recs.addRow([r.severity, r.type, r.title, r.expectedImpact]);
  recs.columns.forEach((c, i) => (c.width = i === 2 ? 40 : 22));

  const camps = wb.addWorksheet("Campañas");
  camps.addRow(CAMPAIGN_HEADERS);
  camps.getRow(1).font = { bold: true };
  for (const row of report.campaigns) camps.addRow(campaignToArray(row));
  camps.columns.forEach((col, idx) => (col.width = idx === 0 ? 36 : 14));

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `pulse-executive-${dateStamp()}.xlsx`
  };
}

export function executiveToPdf(report: ExecutiveReport): Promise<ExportedFile> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () =>
      resolve({
        buffer: Buffer.concat(chunks),
        contentType: "application/pdf",
        filename: `pulse-executive-${dateStamp()}.pdf`
      })
    );
    doc.on("error", reject);

    const purple = "#6d28d9";

    // Header
    doc.fillColor(purple).fontSize(24).text("PULSE", { continued: true }).fillColor("#666").fontSize(12).text("  ·  Reporte ejecutivo");
    doc.moveDown(0.3);
    doc.fillColor("#111").fontSize(14).text(report.organizationName);
    doc.fillColor("#888").fontSize(9).text(`Generado: ${new Date(report.generatedAt).toLocaleString("es-MX")} · ${report.windowLabel}`);
    doc.moveDown(1);

    // KPIs
    doc.fillColor("#111").fontSize(13).text("Resumen", { underline: false });
    doc.moveDown(0.4);
    const kpis: Array<[string, string]> = [
      ["Inversión total", money(report.totals.spend)],
      ["Resultados", String(report.totals.results)],
      ["Campañas (activas)", `${report.totals.campaigns} (${report.totals.activeCampaigns})`],
      ["CPA promedio", report.totals.avgCpa !== null ? money(report.totals.avgCpa) : "—"],
      ["ROAS ponderado", report.totals.weightedRoas !== null ? `${report.totals.weightedRoas}x` : "—"],
      ["CTR promedio", report.totals.avgCtr !== null ? `${report.totals.avgCtr}%` : "—"]
    ];
    doc.fontSize(10).fillColor("#333");
    for (const [label, value] of kpis) {
      doc.text(`${label}: `, { continued: true }).fillColor("#111").text(value).fillColor("#333");
    }
    doc.moveDown(1);

    // Open recommendations
    if (report.openRecommendations.length > 0) {
      doc.fillColor("#111").fontSize(13).text("Recomendaciones abiertas");
      doc.moveDown(0.4);
      doc.fontSize(9);
      for (const r of report.openRecommendations.slice(0, 12)) {
        doc.fillColor(severityColor(r.severity)).text(`● `, { continued: true })
          .fillColor("#111").text(`${r.title} `, { continued: true })
          .fillColor("#777").text(`— ${r.expectedImpact}`);
      }
      doc.moveDown(1);
    }

    // Top by ROAS
    doc.fillColor("#111").fontSize(13).text("Top 5 por ROAS");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#333");
    for (const c of report.topByRoas) {
      doc.text(`${c.name} — ROAS ${c.roas ?? "—"}x · gasto ${money(c.spend)} · ${c.results} resultados`);
    }
    doc.moveDown(0.8);

    doc.fillColor("#111").fontSize(13).text("5 campañas con CPA más alto");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#333");
    for (const c of report.worstByCpa) {
      doc.text(`${c.name} — CPA ${c.cpa !== null ? money(c.cpa) : "—"} · gasto ${money(c.spend)} · ${c.results} resultados`);
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#aaa").text("Generado por Pulse · Ads Intelligence Agent", { align: "center" });

    doc.end();
  });
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "#dc2626";
    case "HIGH":
      return "#ea580c";
    case "MEDIUM":
      return "#ca8a04";
    default:
      return "#16a34a";
  }
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
