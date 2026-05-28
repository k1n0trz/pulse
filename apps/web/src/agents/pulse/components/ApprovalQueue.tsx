import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import { api, type RecommendationDTO } from "../../../lib/api";

interface ApprovalQueueProps {
  /** When set, only show recommendations with status === this value. Default: OPEN. */
  status?: "OPEN" | "APPROVED" | "REJECTED" | "EXECUTED";
  limit?: number;
  /** When true (autopilot), the "Aprobar y ejecutar" button is enabled. */
  allowExecute?: boolean;
}

export function ApprovalQueue({ status = "OPEN", limit = 50, allowExecute = false }: ApprovalQueueProps) {
  const [items, setItems] = useState<RecommendationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.recommendations.list({ status, limit });
      setItems(result.recommendations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = useCallback(async (id: string, execute: boolean) => {
    setWorking(id);
    try {
      await api.recommendations.approve(id, { execute });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }, [refresh]);

  const handleReject = useCallback(async (id: string) => {
    setWorking(id);
    try {
      await api.recommendations.reject(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(null);
    }
  }, [refresh]);

  if (loading) {
    return (
      <section className="panel recommendations-panel">
        <div className="panel-head"><h2>Aprobaciones pendientes</h2></div>
        <div className="loading-row"><Loader2 className="spin" size={16} /> Cargando…</div>
      </section>
    );
  }

  return (
    <section className="panel recommendations-panel">
      <div className="panel-head">
        <h2>Aprobaciones pendientes</h2>
        <span>{items.length}</span>
      </div>
      {error && <small className="error-text">{error}</small>}
      {items.length === 0 ? (
        <div className="empty-state">
          <Sparkles size={20} />
          <p>No hay recomendaciones {status === "OPEN" ? "pendientes" : ""}. Pídele a Pulse que proponga optimizaciones desde el chat.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <div className="recommendation-row" key={item.id}>
              <span className={`severity ${item.severity.toLowerCase()}`}>{item.severity.toLowerCase()}</span>
              <div className="rec-body">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <small>{item.expectedImpact}</small>
                {item.budgetDeltaPercent !== null && (
                  <small className="rec-meta">Δ presupuesto: {item.budgetDeltaPercent > 0 ? "+" : ""}{item.budgetDeltaPercent}%</small>
                )}
              </div>
              <div className="rec-actions">
                <button
                  className="approve-button"
                  disabled={working === item.id}
                  onClick={() => void handleApprove(item.id, false)}
                  title="Aprobar (sin ejecutar todavía)"
                >
                  {working === item.id ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  Aprobar
                </button>
                {allowExecute && (
                  <button
                    className="execute-button"
                    disabled={working === item.id || item.severity === "CRITICAL"}
                    onClick={() => void handleApprove(item.id, true)}
                    title={item.severity === "CRITICAL" ? "Bloqueado: severidad crítica requiere revisión humana" : "Aprobar y ejecutar contra Meta"}
                  >
                    {item.severity === "CRITICAL" ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
                    Ejecutar
                  </button>
                )}
                <button
                  className="reject-button"
                  disabled={working === item.id}
                  onClick={() => void handleReject(item.id)}
                >
                  <X size={14} />
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
