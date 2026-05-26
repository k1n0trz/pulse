import { ShieldCheck, SlidersHorizontal, Zap } from "lucide-react";
import type { AutopilotPolicy, OperationMode } from "@pulse/shared";
import type { AutopilotRunResult } from "../autopilot/pulseAutopilot";

export function AutopilotPanel({ mode, policy, result, onPolicyChange, expanded = false }: { mode: OperationMode; policy: AutopilotPolicy; result: AutopilotRunResult; onPolicyChange: (policy: AutopilotPolicy) => void; expanded?: boolean }) {
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
          <p>{result.blockedReasons[0] ?? "Politicas activas y registro completo de acciones."}</p>
        </div>
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
        <p><ShieldCheck size={16} /> No crea campanas nuevas sin aprobacion.</p>
        <p><ShieldCheck size={16} /> No publica anuncios nuevos sin aprobacion.</p>
        <p><ShieldCheck size={16} /> No elimina campanas.</p>
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
