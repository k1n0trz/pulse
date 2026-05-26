import type { ExecutedAction, PulseRecommendation } from "@pulse/shared";
export { metaConnectorPrinciples } from "@pulse/shared";

export interface ConnectorResult {
  ok: boolean;
  provider: "ads-cli" | "meta-mcp" | "mock";
  message: string;
  action?: ExecutedAction;
  raw?: unknown;
}

export interface AdsCliCommandTemplate {
  executable: string;
  args: string[];
}

export interface AdsCliAdapterConfig {
  executable: string;
  templates: Partial<Record<PulseRecommendation["type"], (recommendation: PulseRecommendation) => AdsCliCommandTemplate>>;
}

export interface MetaMcpClient {
  invoke(input: { capability: string; payload: Record<string, unknown> }): Promise<ConnectorResult>;
}

export function createMockConnector() {
  return {
    async execute(action: ExecutedAction): Promise<ConnectorResult> {
      return {
        ok: true,
        provider: "mock",
        message: action.dryRun ? "Simulacion registrada; sin cambios reales." : "Accion mock ejecutada y auditada.",
        action
      };
    }
  };
}

export function prepareAdsCliCommand(config: AdsCliAdapterConfig, recommendation: PulseRecommendation): AdsCliCommandTemplate {
  const template = config.templates[recommendation.type];
  if (!template) {
    return {
      executable: config.executable,
      args: ["--help"]
    };
  }

  return template(recommendation);
}

export const metaConnectorPrinciples = [
  "No se hardcodean endpoints de Meta Marketing API.",
  "Ads CLI/MCP se integran por adaptadores configurables cuando la instalacion oficial este autenticada.",
  "Toda mutacion pasa por modo operativo, politicas de riesgo, auditoria y registro de aprendizaje.",
  "Campanas nuevas, anuncios nuevos y cambios masivos quedan bloqueados sin aprobacion humana."
];
