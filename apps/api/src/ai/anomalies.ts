// Statistical anomaly detection for daily campaign metrics.
// Replaces hardcoded thresholds (e.g. "frequency > 3") with z-score over a
// rolling baseline, so each campaign is judged against its own history.

import { prisma } from "../db/prisma.js";

export type AnomalyMetric = "spend" | "cpa" | "roas" | "ctr" | "cpm" | "frequency";

export interface DailyPoint {
  date: Date;
  value: number;
}

export interface AnomalyFinding {
  campaignId: string;
  metric: AnomalyMetric;
  date: string;
  value: number;
  baselineMean: number;
  baselineStd: number;
  zScore: number;
  direction: "up" | "down";
  severity: "low" | "medium" | "high";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function severityOf(absZ: number): "low" | "medium" | "high" {
  if (absZ >= 3) return "high";
  if (absZ >= 2) return "medium";
  return "low";
}

export function detectAnomaliesInSeries(opts: {
  campaignId: string;
  metric: AnomalyMetric;
  series: DailyPoint[];
  baselineDays?: number;
  threshold?: number;
}): AnomalyFinding[] {
  const baselineDays = opts.baselineDays ?? 14;
  const threshold = opts.threshold ?? 2;

  if (opts.series.length < baselineDays + 1) return [];

  const sorted = [...opts.series].sort((a, b) => a.date.getTime() - b.date.getTime());
  const findings: AnomalyFinding[] = [];

  for (let i = baselineDays; i < sorted.length; i++) {
    const window = sorted.slice(Math.max(0, i - baselineDays), i).map((p) => p.value);
    const avg = mean(window);
    const sd = stddev(window, avg);
    if (sd === 0) continue;
    const point = sorted[i]!;
    const z = (point.value - avg) / sd;
    const absZ = Math.abs(z);
    if (absZ >= threshold) {
      findings.push({
        campaignId: opts.campaignId,
        metric: opts.metric,
        date: point.date.toISOString().slice(0, 10),
        value: point.value,
        baselineMean: Number(avg.toFixed(4)),
        baselineStd: Number(sd.toFixed(4)),
        zScore: Number(z.toFixed(2)),
        direction: z > 0 ? "up" : "down",
        severity: severityOf(absZ)
      });
    }
  }
  return findings;
}

export async function detectAccountAnomalies(opts: {
  organizationId: string;
  accountId?: string;
  metrics?: AnomalyMetric[];
  baselineDays?: number;
  threshold?: number;
  maxFindings?: number;
}): Promise<AnomalyFinding[]> {
  const metrics = opts.metrics ?? ["spend", "cpa", "roas", "ctr", "cpm", "frequency"];
  const maxFindings = opts.maxFindings ?? 50;

  const campaigns = await prisma.campaignSnapshot.findMany({
    where: {
      organizationId: opts.organizationId,
      ...(opts.accountId ? { accountId: opts.accountId } : {})
    },
    select: {
      id: true,
      metaCampaignId: true,
      dailyMetrics: { orderBy: { date: "asc" } }
    }
  });

  const findings: AnomalyFinding[] = [];

  for (const c of campaigns) {
    for (const metric of metrics) {
      const series: DailyPoint[] = c.dailyMetrics
        .map((d) => {
          const raw =
            metric === "spend"
              ? Number(d.spend)
              : metric === "cpa"
                ? d.cpa === null ? null : Number(d.cpa)
                : metric === "roas"
                  ? d.roas === null ? null : Number(d.roas)
                  : metric === "ctr"
                    ? d.ctr === null ? null : Number(d.ctr)
                    : metric === "cpm"
                      ? d.cpm === null ? null : Number(d.cpm)
                      : d.frequency === null ? null : Number(d.frequency);
          return raw === null ? null : { date: d.date, value: raw };
        })
        .filter((p): p is DailyPoint => p !== null);

      const localFindings = detectAnomaliesInSeries({
        campaignId: c.id,
        metric,
        series,
        baselineDays: opts.baselineDays,
        threshold: opts.threshold
      });
      findings.push(...localFindings);
    }
  }

  findings.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return findings.slice(0, maxFindings);
}
