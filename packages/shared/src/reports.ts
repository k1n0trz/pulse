import type { Campaign, OptimizationPlan } from "./types.js";

export function buildExecutiveReport(campaigns: Campaign[], plan: OptimizationPlan) {
  const spend = campaigns.reduce((sum, item) => sum + item.spend, 0);
  const results = campaigns.reduce((sum, item) => sum + item.results, 0);
  const weightedRoas = campaigns.reduce((sum, item) => sum + item.roas * item.spend, 0) / Math.max(1, spend);

  return {
    title: "Reporte ejecutivo Pulse",
    spend,
    results,
    roas: Number(weightedRoas.toFixed(2)),
    accountScore: plan.accountScore,
    nextActions: plan.recommendations.slice(0, 5).map((item) => item.title)
  };
}

export function campaignsToCsv(campaigns: Campaign[]) {
  const header = ["Campana", "Objetivo", "Estado", "Presupuesto", "Gasto", "Resultados", "CPA", "ROAS", "CTR", "CPM", "Frecuencia", "Fase"];
  const rows = campaigns.map((campaign) => [
    campaign.name,
    campaign.objective,
    campaign.status,
    campaign.budget,
    campaign.spend,
    campaign.results,
    campaign.cpa,
    campaign.roas,
    campaign.ctr,
    campaign.cpm,
    campaign.frequency,
    campaign.phase
  ]);

  return [header, ...rows].map((row) => row.join(",")).join("\n");
}
