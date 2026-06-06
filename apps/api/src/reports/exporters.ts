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
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () =>
      resolve({ buffer: Buffer.concat(chunks), contentType: "application/pdf", filename: `pulse-executive-${dateStamp()}.pdf` })
    );
    doc.on("error", reject);

    // Pulse brand palette
    const PURPLE = "#6d28d9";
    const PURPLE2 = "#a855f7";
    const INK = "#1b1530";
    const MUTED = "#6b6680";
    const LINE = "#e8e1f7";
    const CARD = "#f6f2fe";

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 48;
    const innerW = W - 2 * M;

    // ---------- Header band ----------
    doc.rect(0, 0, W, 104).fill(PURPLE);
    doc.rect(0, 100, W, 4).fill(PURPLE2);
    // Wordmark with a small lightning/pulse glyph
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13).text("⚡", M, 34, { continued: true }).fontSize(24).text(" PULSE");
    doc.font("Helvetica").fontSize(10.5).fillColor("#e9defb").text("Reporte ejecutivo · Ads Intelligence Agent", M, 66);
    // Right-aligned meta
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(report.organizationName, W - M - 240, 32, { width: 240, align: "right" });
    doc.font("Helvetica").fontSize(8.5).fillColor("#e9defb")
      .text(`Generado: ${new Date(report.generatedAt).toLocaleString("es-MX")}`, W - M - 240, 50, { width: 240, align: "right" })
      .text(`Periodo: ${report.windowLabel}`, W - M - 240, 64, { width: 240, align: "right" });

    // ---------- KPI cards ----------
    const kpis: Array<[string, string]> = [
      ["Inversión total", money(report.totals.spend)],
      ["Resultados", report.totals.results.toLocaleString("en-US")],
      ["Campañas (activas)", `${report.totals.campaigns} (${report.totals.activeCampaigns})`],
      ["CPA promedio", report.totals.avgCpa !== null ? money(report.totals.avgCpa) : "—"],
      ["ROAS ponderado", report.totals.weightedRoas !== null ? `${report.totals.weightedRoas}x` : "—"],
      ["CTR promedio", report.totals.avgCtr !== null ? `${report.totals.avgCtr}%` : "—"]
    ];
    const cols = 3;
    const gap = 12;
    const cardW = (innerW - gap * (cols - 1)) / cols;
    const cardH = 58;
    const kpiTop = 132;
    kpis.forEach(([label, value], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = M + col * (cardW + gap);
      const cy = kpiTop + row * (cardH + gap);
      doc.roundedRect(x, cy, cardW, cardH, 9).fill(CARD);
      doc.roundedRect(x, cy, 4, cardH, 2).fill(PURPLE2);
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), x + 14, cy + 12, { width: cardW - 22, characterSpacing: 0.3 });
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(17).text(value, x + 14, cy + 26, { width: cardW - 22 });
    });

    let y = kpiTop + 2 * (cardH + gap) + 8;

    const heading = (text: string) => {
      doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(13).text(text, M, y);
      y = doc.y + 4;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor(LINE).lineWidth(1).stroke();
      y += 10;
    };
    const line = (cb: () => void) => { cb(); y = doc.y + 4; };

    // ---------- Recommendations ----------
    if (report.openRecommendations.length > 0) {
      heading("Recomendaciones abiertas");
      for (const r of report.openRecommendations.slice(0, 8)) {
        doc.fillColor(severityColor(r.severity)).font("Helvetica-Bold").fontSize(9).text("●  ", M, y, { continued: true })
          .fillColor(INK).text(`${r.title}  `, { continued: true })
          .fillColor(MUTED).font("Helvetica").text(`— ${r.expectedImpact}`, { width: innerW });
        y = doc.y + 5;
      }
      y += 6;
    }

    // ---------- Top by ROAS ----------
    heading("Top 5 por ROAS");
    for (const c of report.topByRoas) {
      line(() => doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(c.name, M, y, { continued: true })
        .fillColor(MUTED).font("Helvetica").text(`  ·  ROAS ${c.roas ?? "—"}x · gasto ${money(c.spend)} · ${c.results} resultados`, { width: innerW }));
    }
    y += 10;

    // ---------- Worst by CPA ----------
    heading("5 campañas con CPA más alto");
    for (const c of report.worstByCpa) {
      line(() => doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(c.name, M, y, { continued: true })
        .fillColor(MUTED).font("Helvetica").text(`  ·  CPA ${c.cpa !== null ? money(c.cpa) : "—"} · gasto ${money(c.spend)} · ${c.results} resultados`, { width: innerW }));
    }

    // ---------- Footer ----------
    doc.fillColor("#b3acc4").font("Helvetica").fontSize(8)
      .text("Generado por Pulse · Pulse no está afiliado a Meta Platforms, Inc.", M, H - 40, { width: innerW, align: "center" });

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
