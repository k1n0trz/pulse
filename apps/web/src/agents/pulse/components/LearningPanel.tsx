import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import { api, type RuleWeightDTO } from "../../../lib/api";

// Friendly labels for the optimizer rules Pulse learns from.
const RULE_LABELS: Record<string, string> = {
  scale_winner: "Escalar ganadoras",
  cpa_above_target_3d: "Reducir por CPA alto",
  spend_without_conversions: "Frenar gasto sin conversiones",
  low_ctr_high_cpm: "Rotar por CTR bajo / CPM alto",
  creative_fatigue: "Rotar creatividad fatigada",
  learning_limited: "Simplificar estructura",
  budget_fragmentation: "Consolidar presupuesto",
  landing_problem: "Auditar landing"
};

export function LearningPanel() {
  const [weights, setWeights] = useState<RuleWeightDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.learning.get();
      setWeights(res.weights);
    } catch {
      setWeights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recompute = async () => {
    setEvaluating(true);
    setMsg(null);
    try {
      const res = await api.learning.evaluate();
      setWeights(res.weights);
      setMsg(res.evaluated > 0
        ? `Aprendizaje actualizado con ${res.evaluated} decisión(es) de los últimos ${res.windowDays} días.`
        : `Aún no hay suficientes decisiones ejecutadas con histórico para aprender. Los pesos se mantienen.`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <section className="panel learning-panel">
      <div className="panel-head">
        <h2><Brain size={18} /> Autoaprendizaje de Pulse</h2>
        <button className="ghost-button" onClick={() => void recompute()} disabled={evaluating}>
          {evaluating ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Recalcular
        </button>
      </div>
      <p className="muted learning-intro">
        Pulse ajusta el peso de cada estrategia según el impacto real (CPA · ROAS · CTR) de las decisiones que ejecutas.
        Las estrategias con más peso se priorizan en los modos lectura, asistido y autopilot.
      </p>

      {loading ? (
        <div className="loading-row"><Loader2 size={16} className="spin" /> Cargando…</div>
      ) : (
        <div className="learning-list">
          {weights.map((w) => {
            const pct = Math.max(6, Math.min(100, (w.weight / 2) * 100));
            const tone = w.weight >= 1.15 ? "good" : w.weight <= 0.85 ? "bad" : "warn";
            return (
              <div className="learning-row" key={w.rule}>
                <div className="learning-label">
                  <strong>{RULE_LABELS[w.rule] ?? w.rule}</strong>
                  <small>{w.weight.toFixed(2)}× {w.samples > 0 && `· ${w.samples} muestra(s)`}</small>
                </div>
                <div className={`learning-bar ${tone}`}><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
      {msg && <small className="run-ok">{msg}</small>}
    </section>
  );
}
