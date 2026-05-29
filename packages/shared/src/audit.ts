import type { Campaign, PulseAlert } from "./types.js";

export interface PulseAuditResult {
  score: number;
  structure: number;
  tracking: number;
  creative: number;
  budget: number;
  audience: number;
  findings: string[];
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
