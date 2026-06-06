import { useState } from "react";
import { Check, Sparkles, ShieldCheck, CreditCard } from "lucide-react";
import type { PlanTier } from "../../../lib/api";
import type { UseBilling, PaymentProvider } from "../hooks/useBilling";

const PLAN_FEATURES: Record<string, string[]> = {
  SOLO: ["1 cuenta publicitaria", "Análisis y recomendaciones IA", "Modos lectura y asistido", "Reportes con tu marca"],
  AGENCY: ["Hasta 10 cuentas · 5 usuarios", "Autopilot con guardrails", "Aprendizaje continuo", "Soporte prioritario"],
  SCALE: ["Cuentas y usuarios ilimitados", "Autopilot completo", "Insights avanzados + API", "Soporte premium"]
};

export function PlansPaywall({ billing }: { billing: UseBilling }) {
  const { config, status, startCheckout, error } = billing;
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const providers = config?.providers;
  // Default provider: MercadoPago when available, else Stripe.
  const defaultProvider: PaymentProvider = providers?.mercadopago ? "mercadopago" : "stripe";

  const purchasable = (config?.plans ?? []).filter((p) => p.tier !== "FREE" && p.purchasable);

  const buy = async (tier: PlanTier, provider: PaymentProvider) => {
    setBusy(`${tier}:${provider}`);
    setLocalError(null);
    try {
      await startCheckout(tier, provider);
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="paywall">
      <div className="paywall-head">
        <div className="brand-mark"><Sparkles size={26} /></div>
        <h1>Activa Pulse</h1>
        <p>
          {status?.subscriptionStatus === "past_due"
            ? "Tu suscripción está pausada. Reactívala para seguir usando Pulse."
            : "Elige un plan para desbloquear el análisis, la automatización y los reportes de Pulse."}
        </p>
      </div>

      <div className="paywall-plans">
        {purchasable.map((plan) => {
          const popular = plan.tier === "AGENCY";
          return (
            <article className={`paywall-plan ${popular ? "popular" : ""}`} key={plan.tier}>
              {popular && <span className="paywall-badge">Más popular</span>}
              <h3>{plan.name}</h3>
              <div className="paywall-price">${plan.monthlyUsd}<span>/mes</span></div>
              <ul>
                {(PLAN_FEATURES[plan.tier] ?? []).map((f) => (
                  <li key={f}><Check size={15} /> {f}</li>
                ))}
              </ul>

              <div className="paywall-actions">
                {providers?.mercadopago && (
                  <button
                    className="primary-button"
                    disabled={busy !== null}
                    onClick={() => void buy(plan.tier as PlanTier, "mercadopago")}
                  >
                    <CreditCard size={16} />
                    {busy === `${plan.tier}:mercadopago` ? "Redirigiendo…" : "Pagar con MercadoPago"}
                  </button>
                )}
                {providers?.stripe && (
                  <button
                    className="ghost-button"
                    disabled={busy !== null}
                    onClick={() => void buy(plan.tier as PlanTier, "stripe")}
                  >
                    <CreditCard size={16} />
                    {busy === `${plan.tier}:stripe` ? "Redirigiendo…" : "Pagar con tarjeta (Stripe)"}
                  </button>
                )}
                {!providers?.mercadopago && !providers?.stripe && (
                  <button className="ghost-button" disabled>Pago no disponible</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {(localError || error) && <p className="error-text">{localError ?? error}</p>}

      <p className="paywall-foot">
        <ShieldCheck size={14} /> Pago seguro · USD · cancela cuando quieras.
        {providers?.mercadopago && providers?.stripe && " MercadoPago para LATAM, tarjeta internacional vía Stripe."}
      </p>
    </div>
  );
}
