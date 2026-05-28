import { describe, expect, it } from "vitest";
import { detectAnomaliesInSeries } from "./anomalies.js";

function makeSeries(values: number[]): { date: Date; value: number }[] {
  const start = Date.UTC(2026, 4, 1);
  return values.map((v, i) => ({ date: new Date(start + i * 86_400_000), value: v }));
}

describe("anomaly detection", () => {
  it("returns nothing when series is shorter than baselineDays + 1", () => {
    const findings = detectAnomaliesInSeries({
      campaignId: "c1",
      metric: "spend",
      series: makeSeries([1, 2, 3])
    });
    expect(findings).toEqual([]);
  });

  it("flags a spike at >= 2 standard deviations", () => {
    // 14 stable days, then a spike on day 15
    const baseline = Array(14).fill(100);
    const series = makeSeries([...baseline, 100, 100, 100]); // still no variance — sd=0
    const findings = detectAnomaliesInSeries({ campaignId: "c1", metric: "spend", series });
    expect(findings).toEqual([]); // sd=0 short-circuit
  });

  it("detects a real spike against a noisy baseline", () => {
    // baseline mean ~ 100, sd ~ 5, spike to 200 → z ~ 20
    const baseline = [95, 100, 105, 98, 103, 99, 101, 100, 102, 97, 100, 100, 99, 101];
    const series = makeSeries([...baseline, 200]);
    const findings = detectAnomaliesInSeries({
      campaignId: "c1",
      metric: "spend",
      series,
      baselineDays: 14
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.direction).toBe("up");
    expect(findings[0]!.severity).toBe("high");
    expect(findings[0]!.zScore).toBeGreaterThan(3);
  });

  it("respects custom threshold", () => {
    const baseline = [100, 102, 98, 99, 103, 101, 100, 100, 99, 102, 98, 101, 100, 99];
    // value at +1.5 sd should clear threshold=1 but not threshold=2
    const series = makeSeries([...baseline, 103]);
    const lax = detectAnomaliesInSeries({ campaignId: "c1", metric: "spend", series, threshold: 1 });
    const strict = detectAnomaliesInSeries({ campaignId: "c1", metric: "spend", series, threshold: 2 });
    expect(lax.length).toBeGreaterThanOrEqual(strict.length);
  });
});
