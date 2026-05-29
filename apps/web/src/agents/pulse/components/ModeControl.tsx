import { Power, ShieldAlert } from "lucide-react";
import type { AutopilotPolicy, OperationMode } from "@pulse/shared";

export function ModeControl({ mode, onModeChange, policy, onPolicyChange }: { mode: OperationMode; onModeChange: (mode: OperationMode) => void; policy: AutopilotPolicy; onPolicyChange: (policy: AutopilotPolicy) => void }) {
  return (
    <section className="mode-box">
      <span>Modo actual</span>
      <div className="segmented">
        <button className={mode === "read" ? "selected" : ""} onClick={() => onModeChange("read")}>Lectura</button>
        <button className={mode === "assisted" ? "selected" : ""} onClick={() => onModeChange("assisted")}>Asistido</button>
        <button className={mode === "autopilot" ? "selected" : ""} onClick={() => onModeChange("autopilot")}>Auto</button>
      </div>
      <p>{mode === "read" ? "Solo analiza." : mode === "assisted" ? "Requiere aprobación para ejecutar." : "Ejecuta dentro de límites."}</p>
      <label className="switch-line">
        <ShieldAlert size={16} />
        Kill Switch
        <input type="checkbox" checked={policy.killSwitch} onChange={(event) => onPolicyChange({ ...policy, killSwitch: event.target.checked })} />
      </label>
      <label className="switch-line">
        <Power size={16} />
        Bloquear críticas
        <input type="checkbox" checked={policy.blockedCriticalCampaigns} onChange={(event) => onPolicyChange({ ...policy, blockedCriticalCampaigns: event.target.checked })} />
      </label>
    </section>
  );
}
