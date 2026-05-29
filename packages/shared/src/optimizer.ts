import type { AutopilotPolicy, Campaign, OptimizationPlan, PulseAlert, PulseRecommendation, Severity } from "./types.js";

const now = () => new Date().toISOString();
const recent = (campaign: Campaign) => campaign.metrics.slice(-3);
const all = <T>(items: T[], predicate: (item: T) => boolean) => items.length > 0 && items.every(predicate);

function recommendation(
  campaign: Campaign,
  type: PulseRecommendation["type"],
  severity: Severity,
  title: string,
  description: string,
  expectedImpact: string,
  rule: string,
  extra: Partial<PulseRecommendation> = {}
): PulseRecommendation {
  return {
    id: `${rule}_${campaign.id}`,
    campaignId: campaign.id,
    type,
    title,
    description,
    severity,
    expectedImpact,
    requiresApproval: false,
    rule,
    ...extra
  };
}

function alert(campaign: Campaign, severity: Severity, rule: string, title: string, description: string): PulseAlert {
  return {
    id: `${rule}_${campaign.id}`,
    campaignId: campaign.id,
    severity,
    rule,
    title,
    description,
    createdAt: now()
  };
}

export function createOptimizationPlan(campaigns: Campaign[], policy: AutopilotPolicy): OptimizationPlan {
  if (campaigns.length === 0) {
    return {
      alerts: [],
      recommendations: [],
      accountScore: 0,
      summary: "Sin datos de cuenta publicitaria conectada."
    };
  }

  const alerts: PulseAlert[] = [];
  const recommendations: PulseRecommendation[] = [];

  for (const campaign of campaigns) {
    const lastThree = recent(campaign);
    const spentWithoutConversions = all(lastThree, (day) => day.spend > policy.targetCpa * 2 && day.conversions === 0);
    const cpaTooHigh = all(lastThree, (day) => day.cpa > policy.targetCpa);
    const roasWinner = all(lastThree, (day) => day.roas > policy.targetRoas);
    const fatigue = campaign.frequency > 3 || all(lastThree, (day) => day.frequency > 3);
    const weakCreative = campaign.ctr < 1.3 && campaign.cpm > 24;
    const landingIssue = campaign.ctr > 2.8 && campaign.objective !== "Trafico" && all(lastThree, (day) => day.conversions === 0);

    if (spentWithoutConversions) {
      alerts.push(alert(campaign, "critical", "spend_without_conversions", "Gasto alto sin conversiones", "Gasto superior a 2x CPA objetivo durante 3 dias sin conversiones."));
      recommendations.push(
        recommendation(campaign, "pause_ad", "critical", "Frenar fuga de presupuesto", "Pausar o reducir el conjunto que gasta sin resultados.", "Protege presupuesto antes de seguir escalando perdidas.", "spend_without_conversions")
      );
    }

    if (cpaTooHigh) {
      alerts.push(alert(campaign, "high", "cpa_above_target_3d", "CPA sobre objetivo por 3 dias", `CPA actual $${campaign.cpa} contra objetivo $${policy.targetCpa}.`));
      recommendations.push(
        recommendation(campaign, "reduce_budget", "high", "Reducir presupuesto por CPA alto", "Reducir 15% y revisar segmentacion/creatividad antes de reactivar escala.", "Baja exposicion a trafico ineficiente.", "cpa_above_target_3d", {
          budgetDeltaPercent: -15
        })
      );
    }

    if (roasWinner) {
      const delta = Math.min(15, policy.maxDailyBudgetIncreasePercent);
      recommendations.push(
        recommendation(campaign, "scale_budget", "medium", `Escalar ${campaign.name}`, `ROAS estable sobre ${policy.targetRoas} por 3 dias.`, `Incremento controlado de ${delta}% dentro del limite diario.`, "scale_winner", {
          budgetDeltaPercent: delta
        })
      );
    }

    if (weakCreative) {
      alerts.push(alert(campaign, "medium", "low_ctr_high_cpm", "CTR bajo con CPM alto", "La combinacion sugiere agotamiento o baja relevancia creativa."));
      recommendations.push(
        recommendation(campaign, "rotate_creative", "medium", "Rotar creatividad", "CTR bajo + CPM alto: preparar nuevas variantes antes de seguir aumentando presupuesto.", "Mejora relevancia y reduce costo de entrega.", "low_ctr_high_cpm", {
          requiresApproval: true
        })
      );
    }

    if (fatigue) {
      alerts.push(alert(campaign, "medium", "creative_fatigue", "Frecuencia alta", "Frecuencia por encima de 3; riesgo de fatiga creativa."));
      recommendations.push(
        recommendation(campaign, "rotate_creative", "medium", "Rotar creatividades fatigadas", "Cambiar orden de activos y promover variantes frescas.", "Recupera CTR y reduce saturacion.", "creative_fatigue", {
          requiresApproval: true
        })
      );
    }

    if (landingIssue) {
      alerts.push(alert(campaign, "high", "landing_problem", "Alto CTR sin conversiones", "El anuncio atrae clics, pero no convierte; revisar landing/tracking."));
      recommendations.push(
        recommendation(campaign, "review_landing", "high", "Auditar landing", "Alto CTR sin conversiones suele indicar friccion post-click o tracking roto.", "Evita optimizar el anuncio equivocado.", "landing_problem", {
          requiresApproval: true
        })
      );
    }

    if (campaign.learningLimited) {
      recommendations.push(
        recommendation(campaign, "simplify_structure", "medium", "Simplificar estructura", "Campana en learning limited: consolidar audiencias y reducir fragmentacion.", "Ayuda al algoritmo a salir de aprendizaje limitado.", "learning_limited", {
          requiresApproval: true
        })
      );
    }
  }

  const smallBudgets = campaigns.filter((campaign) => campaign.status === "active" && campaign.budget < 45000);
  if (smallBudgets.length >= 2) {
    recommendations.push({
      id: "budget_fragmentation_account",
      campaignId: "account",
      type: "consolidate_budget",
      title: "Consolidar presupuesto fragmentado",
      description: "Varias campanas activas tienen bajo presupuesto y compiten por aprendizaje.",
      severity: "medium",
      expectedImpact: "Mayor volumen por conjunto ganador y aprendizaje mas estable.",
      requiresApproval: true,
      rule: "budget_fragmentation"
    });
  }

  const accountScore = Math.max(0, Math.min(100, 86 - alerts.filter((item) => item.severity === "critical").length * 18 - alerts.filter((item) => item.severity === "high").length * 8));

  return {
    alerts,
    recommendations,
    accountScore,
    summary: `${recommendations.length} decisiones detectadas, ${alerts.length} alertas activas, score ${accountScore}/100.`
  };
}
