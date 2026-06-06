import { Power, ShieldAlert } from "lucide-react";
import type { AutopilotPolicy, OperationMode } from "@pulse/shared";
import { useI18n } from "../../../i18n";

export function ModeControl({ mode, onModeChange, policy, onPolicyChange }: { mode: OperationMode; onModeChange: (mode: OperationMode) => void; policy: AutopilotPolicy; onPolicyChange: (policy: AutopilotPolicy) => void }) {
  const { t } = useI18n();
  return (
    <section className="mode-box">
      <span>{t("mode.title")}</span>
      <div className="segmented">
        <button className={mode === "read" ? "selected" : ""} onClick={() => onModeChange("read")}>{t("mode.read")}</button>
        <button className={mode === "assisted" ? "selected" : ""} onClick={() => onModeChange("assisted")}>{t("mode.assisted")}</button>
        <button className={mode === "autopilot" ? "selected" : ""} onClick={() => onModeChange("autopilot")}>{t("mode.auto")}</button>
      </div>
      <p>{mode === "read" ? t("mode.read_desc") : mode === "assisted" ? t("mode.assisted_desc") : t("mode.auto_desc")}</p>
      <label className="switch-line">
        <ShieldAlert size={16} />
        {t("mode.kill")}
        <input type="checkbox" checked={policy.killSwitch} onChange={(event) => onPolicyChange({ ...policy, killSwitch: event.target.checked })} />
      </label>
      <label className="switch-line">
        <Power size={16} />
        {t("mode.blockCritical")}
        <input type="checkbox" checked={policy.blockedCriticalCampaigns} onChange={(event) => onPolicyChange({ ...policy, blockedCriticalCampaigns: event.target.checked })} />
      </label>
    </section>
  );
}
