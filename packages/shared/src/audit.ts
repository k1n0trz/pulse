import type { Campaign, PulseAlert, PulseRecommendation } from "./types.js";

export interface PulseAuditResult {
  score: number;
  structure: number;
  tracking: number;
  creative: number;
  budget: number;
  audience: number;
  findings: string[];
}

export type InsightStatus = "good" | "warn" | "bad";

export interface AuditInsight {
  id: string;
  category: string;
  title: string;
  detail: string;
  status: InsightStatus;
}

export interface AuditAction {
  id: string;
  title: string;
  rationale: string;
  impact: "alto" | "medio" | "bajo";
  effort: "alto" | "medio" | "bajo";
  rule?: string;
}

export interface AuditInsightsResult {
  headline: string;
  insights: AuditInsight[];
  actions: AuditAction[];
}

export function auditAccount(campaigns: Campaign[], alerts: PulseAlert[]): PulseAuditResult {
  if (campaigns.length === 0) {
    return {
      score: 0,
      structure: 0,
      tracking: 0,
      creative: 0,
      budget: 0,
      audience: 0,
      findings: ["Conecta una cuenta de Meta para generar una auditoria real."]
    };
  }

  const criticalAlerts = alerts.filter((item) => item.severity === "critical").length;
  const fatigued = campaigns.filter((item) => item.frequency > 3 || item.phase === "fatigued").length;
  const learningLimited = campaigns.filter((item) => item.learningLimited).length;
  const winners = campaigns.filter((item) => item.phase === "winner").length;
  const fragmented = campaigns.filter((item) => item.budget < 45000).length;

  const structure = Math.max(45, 90 - learningLimited * 12 - fragmented * 4);
  const tracking = Math.max(35, 88 - criticalAlerts * 20);
  const creative = Math.max(40, 86 - fatigued * 14);
  const budget = Math.max(35, 84 + winners * 4 - fragmented * 6);
  const audience = Math.max(45, 82 - learningLimited * 10);
  const score = Math.round((structure + tracking + creative + budget + audience) / 5);

  return {
    score,
    structure,
    tracking,
    creative,
    budget,
    audience,
    findings: [
      learningLimited ? "Simplificar conjuntos en learning limited." : "Estructura estable para aprendizaje.",
      fatigued ? "Rotar creatividades con frecuencia superior a 3." : "Frecuencia creativa bajo control.",
      criticalAlerts ? "Revisar tracking y gasto sin conversiones inmediatamente." : "No hay bloqueo critico de tracking.",
      fragmented ? "Consolidar presupuestos pequenos para evitar dispersion." : "Presupuesto concentrado correctamente."
    ]
  };
}

const STATUS_FROM_SCORE = (score: number): InsightStatus => (score >= 80 ? "good" : score >= 60 ? "warn" : "bad");

const IMPACT_FROM_SEVERITY: Record<string, AuditAction["impact"]> = {
  critical: "alto",
  high: "alto",
  medium: "medio",
  low: "bajo"
};

// Rough effort heuristic per recommendation type.
const EFFORT_FROM_TYPE: Record<string, AuditAction["effort"]> = {
  pause_ad: "bajo",
  reduce_budget: "bajo",
  scale_budget: "bajo",
  consolidate_budget: "medio",
  simplify_structure: "medio",
  rotate_creative: "medio",
  review_landing: "alto"
};

const IMPACT_RANK = { alto: 0, medio: 1, bajo: 2 } as const;

/**
 * Turns an account audit + the optimizer's recommendations into (1) human-readable
 * insights per dimension and (2) a prioritized, de-duplicated list of actionable
 * recommendations sorted by impact. Pure + deterministic so it's easy to test.
 */
export function deriveAuditInsights(
  campaigns: Campaign[],
  audit: PulseAuditResult,
  recommendations: PulseRecommendation[]
): AuditInsightsResult {
  if (campaigns.length === 0) {
    return { headline: "Conecta una cuenta para generar insights.", insights: [], actions: [] };
  }

  const active = campaigns.filter((c) => c.status === "active");
  const winners = campaigns.filter((c) => c.phase === "winner").length;
  const fatigued = campaigns.filter((c) => c.frequency > 3 || c.phase === "fatigued").length;
  const learningLimited = campaigns.filter((c) => c.learningLimited).length;
  const avgCtr = campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length;
  const avgRoas = campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length;

  const insights: AuditInsight[] = [
    {
      id: "structure",
      category: "Estructura",
      title: learningLimited > 0 ? `${learningLimited} campaña(s) en aprendizaje limitado` : "Estructura estable",
      detail: learningLimited > 0 ? "Consolida audiencias y reduce fragmentación para salir de learning limited." : "El número de conjuntos permite que el algoritmo aprenda con estabilidad.",
      status: STATUS_FROM_SCORE(audit.structure)
    },
    {
      id: "creative",
      category: "Creatividad",
      title: fatigued > 0 ? `${fatigued} campaña(s) con fatiga creativa` : `CTR promedio ${avgCtr.toFixed(2)}%`,
      detail: fatigued > 0 ? "Frecuencia alta: rota activos y prueba ángulos nuevos antes de escalar." : "La creatividad mantiene buen rendimiento; prepara variantes para sostenerlo.",
      status: STATUS_FROM_SCORE(audit.creative)
    },
    {
      id: "tracking",
      category: "Tracking",
      title: audit.tracking >= 80 ? "Tracking saludable" : "Riesgo en medición",
      detail: audit.tracking >= 80 ? "No se detectan fugas de conversión relevantes." : "Revisa el pixel/CAPI y campañas que gastan sin registrar conversiones.",
      status: STATUS_FROM_SCORE(audit.tracking)
    },
    {
      id: "budget",
      category: "Presupuesto",
      title: `${winners} ganadora(s) · ROAS prom. ${avgRoas.toFixed(2)}x`,
      detail: audit.budget >= 80 ? "El presupuesto se concentra en lo que funciona." : "Reasigna presupuesto de campañas ineficientes hacia las ganadoras.",
      status: STATUS_FROM_SCORE(audit.budget)
    },
    {
      id: "audience",
      category: "Segmentación",
      title: `${active.length} campaña(s) activas`,
      detail: audit.audience >= 80 ? "Audiencias bien definidas y con volumen suficiente." : "Hay solape o audiencias pequeñas; consolida para ganar señal.",
      status: STATUS_FROM_SCORE(audit.audience)
    }
  ];

  // De-duplicate recommendations by rule and turn into prioritized actions.
  const seen = new Set<string>();
  const actions: AuditAction[] = [];
  for (const rec of recommendations) {
    const key = rec.rule;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      id: rec.id,
      title: rec.title,
      rationale: rec.expectedImpact,
      impact: IMPACT_FROM_SEVERITY[rec.severity] ?? "medio",
      effort: EFFORT_FROM_TYPE[rec.type] ?? "medio",
      rule: rec.rule
    });
  }
  actions.sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]);

  const headline =
    audit.score >= 80
      ? "Cuenta saludable: enfócate en escalar lo que funciona."
      : audit.score >= 60
        ? "Cuenta estable con oportunidades claras de mejora."
        : "Cuenta con riesgos: prioriza las acciones de alto impacto.";

  return { headline, insights, actions };
}
