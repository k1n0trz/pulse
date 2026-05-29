import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { MetaConnectionState } from "../hooks/useMetaConnection";

interface OnboardingChecklistProps {
  metaState: MetaConnectionState;
  hasCampaigns: boolean;
  onConnect: () => void;
  onSync: () => void;
  onGoToChat: () => void;
}

export function OnboardingChecklist({ metaState, hasCampaigns, onConnect, onSync, onGoToChat }: OnboardingChecklistProps) {
  const connected = Boolean(metaState.activeConnection);
  const synced = hasCampaigns;

  // Once everything is done, the checklist hides itself.
  if (connected && synced) return null;

  const steps = [
    {
      done: connected,
      label: "Conecta tu cuenta de Meta",
      hint: "Autoriza Pulse para leer tus campañas.",
      action: !connected ? { label: "Conectar", fn: onConnect } : null
    },
    {
      done: synced,
      label: "Sincroniza tus campañas",
      hint: "Pulse trae campañas, ad sets y métricas.",
      action: connected && !synced ? { label: "Sincronizar", fn: onSync } : null
    },
    {
      done: false,
      label: "Pide tu primera auditoría",
      hint: 'Abre el chat y escribe "audita la cuenta".',
      action: synced ? { label: "Ir al chat", fn: onGoToChat } : null
    }
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <section className="panel onboarding-panel">
      <div className="panel-head">
        <h2>Primeros pasos</h2>
        <span>{completed}/3</span>
      </div>
      <div className="onboarding-steps">
        {steps.map((step, i) => (
          <div key={i} className={`onboarding-step ${step.done ? "done" : ""}`}>
            {step.done ? <CheckCircle2 size={20} className="step-icon ok" /> : <Circle size={20} className="step-icon" />}
            <div className="step-text">
              <strong>{step.label}</strong>
              <small>{step.hint}</small>
            </div>
            {step.action && (
              <button className="step-action" onClick={step.action.fn} disabled={metaState.loading}>
                {metaState.loading ? <Loader2 size={14} className="spin" /> : step.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
