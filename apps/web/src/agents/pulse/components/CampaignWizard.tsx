import { useState } from "react";
import { CheckCircle2, ChevronRight, Eye, Settings, Target, Users, WandSparkles } from "lucide-react";

const steps = [
  { label: "Objetivo", icon: Target },
  { label: "Configuracion", icon: Settings },
  { label: "Audiencia", icon: Users },
  { label: "Creatividad", icon: WandSparkles },
  { label: "Revision IA", icon: Eye },
  { label: "Publicacion", icon: CheckCircle2 }
];

export function CampaignWizard() {
  const [step, setStep] = useState(4);

  return (
    <section className="single-view wizard-view">
      <div className="panel wizard-shell">
        <div className="wizard-steps">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className={index === step ? "current" : index < step ? "done" : ""} onClick={() => setStep(index)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="wizard-body">
          <div>
            <span>Paso {step + 1} de 6</span>
            <h2>{steps[step].label}</h2>
            <p>Pulse audita objetivo, presupuesto, audiencia, creatividad, tracking y riesgo antes de permitir publicacion.</p>
          </div>

          <div className="review-list">
            <p><CheckCircle2 size={16} /> Presupuesto dentro del limite diario.</p>
            <p><CheckCircle2 size={16} /> No modifica campanas criticas.</p>
            <p><CheckCircle2 size={16} /> Tracking validado para eventos principales.</p>
            <p><CheckCircle2 size={16} /> Publicacion requiere aprobacion humana.</p>
          </div>

          <div className="wizard-actions">
            <button onClick={() => setStep(Math.max(0, step - 1))}>Anterior</button>
            <button className="primary-button" onClick={() => setStep(Math.min(steps.length - 1, step + 1))}>Continuar <ChevronRight size={17} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
