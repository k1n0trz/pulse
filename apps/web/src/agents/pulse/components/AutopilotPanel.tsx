import { useCallback, useState } from "react";
import { Loader2, Play, ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import type { AutopilotPolicy, OperationMode } from "@pulse/shared";
import type { AutopilotRunResult } from "@pulse/shared";
import { api } from "../../../lib/api";

export function AutopilotPanel({ mode, policy, result, onPolicyChange, expanded = false }: { mode: OperationMode; policy: AutopilotPolicy; result: AutopilotRunResult; onPolicyChange: (policy: AutopilotPolicy) => void; expanded?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  const execute = mode === "autopilot";
  const disabledReason = mode === "read"
    ? "Modo lectura: Pulse solo analiza, no ejecuta."
    : policy.killSwitch
      ? "Kill switch activo: ejecución bloqueada."
      : null;

  const run = useCallback(async () => {
    setBusy(true);
    setRunMsg(null);
    setRunErr(null);
    try {
      const { recommendations } = await api.recommendations.list({ status: "OPEN", limit: 50 });
      if (recommendations.length === 0) {
        setRunMsg("No hay acciones pendientes. Pídele optimizaciones a Pulse desde el chat.");
        return;
      }
      let processed = 0;
      let skipped = 0;
      for (const rec of recommendations) {
        // In autopilot, critical changes still require human review.
        if (execute && rec.severity === "CRITICAL") { skipped++; continue; }
        await api.recommendations.approve(rec.id, { execute });
        processed++;
      }
      setRunMsg(
        execute
          ? `${processed} acción(es) ejecutada(s)${skipped ? ` · ${skipped} crítica(s) requieren revisión` : ""}.`
          : `${processed} acción(es) aprobada(s) y en cola de ejecución.`
      );
    } catch (err) {
      setRunErr((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [execute]);

  return (
    <section className={`panel autopilot-panel ${expanded ? "full-view" : ""}`}>
      <div className="panel-head">
        <h2>Autopilot</h2>
        <span>{mode}</span>
      </div>
      <div className="autopilot-status">
        <Zap size={32} />
        <div>
          <strong>{result.executedActions.length} ejecutadas · {result.pendingApprovals.length} pendientes</strong>
          <p>{result.blockedReasons[0] ?? "Políticas activas y registro completo de acciones."}</p>
        </div>
      </div>

      <div className="autopilot-run">
        <button
          className="primary-button"
          onClick={() => void run()}
          disabled={busy || disabledReason !== null}
          title={disabledReason ?? (execute ? "Ejecuta las acciones pendientes contra Meta dentro de tus límites." : "Aprueba y encola las acciones pendientes para revisión.")}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {busy ? "Procesando…" : execute ? "Ejecutar autopilot ahora" : "Preparar acciones"}
        </button>
        {disabledReason && <small className="muted-inline">{disabledReason}</small>}
        {runMsg && <small className="run-ok">{runMsg}</small>}
        {runErr && <small className="error-text">{runErr}</small>}
      </div>

      <div className="policy-grid">
        <label>
          CPA objetivo
          <input type="number" value={policy.targetCpa} onChange={(event) => onPolicyChange({ ...policy, targetCpa: Number(event.target.value) })} />
        </label>
        <label>
          ROAS objetivo
          <input type="number" step="0.1" value={policy.targetRoas} onChange={(event) => onPolicyChange({ ...policy, targetRoas: Number(event.target.value) })} />
        </label>
        <label>
          Max aumento diario %
          <input type="number" value={policy.maxDailyBudgetIncreasePercent} onChange={(event) => onPolicyChange({ ...policy, maxDailyBudgetIncreasePercent: Number(event.target.value) })} />
        </label>
        <label>
          Max cambios diarios
          <input type="number" value={policy.maxDailyChanges} onChange={(event) => onPolicyChange({ ...policy, maxDailyChanges: Number(event.target.value) })} />
        </label>
      </div>

      <div className="guardrails">
        <p><ShieldCheck size={16} /> No crea campañas nuevas sin aprobación.</p>
        <p><ShieldCheck size={16} /> No publica anuncios nuevos sin aprobación.</p>
        <p><ShieldCheck size={16} /> No elimina campañas.</p>
        <p><SlidersHorizontal size={16} /> Limite de gasto diario: ${policy.maxDailySpend.toLocaleString("en-US")}.</p>
      </div>

      {expanded && (
        <div className="execution-log">
          <h3>Registro de acciones</h3>
          {[...result.executedActions, ...result.simulatedActions.slice(0, 6)].map((action) => (
            <p key={action.id}><span>{action.dryRun ? "Simulada" : "Real"}</span>{action.type} · {action.campaignId}</p>
          ))}
        </div>
      )}
    </section>
  );
}
