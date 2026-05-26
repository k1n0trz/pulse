import type { OperationMode, PulseRecommendation } from "@pulse/shared";

export interface PulseChatResponse {
  intent: string;
  text: string;
  matchedRecommendations: PulseRecommendation[];
}

export function handlePulseCommand(command: string, mode: OperationMode, recommendations: PulseRecommendation[]): PulseChatResponse {
  const normalized = command.toLowerCase();
  const wantsScale = normalized.includes("escala") || normalized.includes("ganadora");
  const wantsPause = normalized.includes("pausa") || normalized.includes("perdiendo");
  const wantsAudit = normalized.includes("audita") || normalized.includes("fallando");
  const wantsOptimize = normalized.includes("optimiza todo");

  const matchedRecommendations = recommendations.filter((item) => {
    if (wantsScale) return item.type === "scale_budget";
    if (wantsPause) return item.type === "pause_ad" || item.type === "reduce_budget";
    if (wantsOptimize) return true;
    return false;
  });

  if (wantsAudit) {
    return {
      intent: "audit_account",
      text: "Voy a evaluar estructura, tracking, creatividades, presupuesto y segmentacion antes de proponer cambios.",
      matchedRecommendations: []
    };
  }

  return {
    intent: wantsOptimize ? "optimize_all" : wantsScale ? "scale_winner" : wantsPause ? "pause_losers" : "answer",
    text:
      mode === "autopilot"
        ? `Puedo ejecutar ${matchedRecommendations.length} acciones dentro de los limites activos.`
        : `Prepare ${matchedRecommendations.length} acciones para aprobacion en modo ${mode === "read" ? "lectura" : "asistido"}.`,
    matchedRecommendations
  };
}
