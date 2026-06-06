import { useCallback, useEffect, useState } from "react";
import { api, type BillingConfigDTO, type BillingStatusDTO, type PlanTier } from "../../../lib/api";

export type PaymentProvider = "mercadopago" | "stripe";

export interface UseBilling {
  loading: boolean;
  config: BillingConfigDTO | null;
  status: BillingStatusDTO | null;
  /** True when payment is configured and the org has no active access (and isn't superadmin). */
  blocked: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startCheckout: (tier: PlanTier, provider: PaymentProvider) => Promise<void>;
}

export function useBilling(): UseBilling {
  const [config, setConfig] = useState<BillingConfigDTO | null>(null);
  const [status, setStatus] = useState<BillingStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([api.billing.config(), api.billing.status()]);
      setConfig(cfg);
      setStatus(st);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCheckout = useCallback(async (tier: PlanTier, provider: PaymentProvider) => {
    setError(null);
    const res = provider === "mercadopago" ? await api.billing.mercadopagoCheckout(tier) : await api.billing.checkout(tier);
    if (res.url) window.location.href = res.url;
  }, []);

  // Only block when a provider is actually configured (otherwise checkout is
  // impossible and we'd lock the user out — e.g. local dev without keys).
  const blocked = Boolean(config?.configured && status && !status.active && !status.isSuperadmin);

  return { loading, config, status, blocked, error, refresh, startCheckout };
}
