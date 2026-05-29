import { useEffect, useState } from "react";
import { api, type TrendPoint } from "../../../lib/api";

interface UseAccountTrendResult {
  trend: TrendPoint[];
  loading: boolean;
  usingLive: boolean;
}

export function useAccountTrend(opts: { enabled: boolean; fallback: TrendPoint[]; days?: number }): UseAccountTrendResult {
  const [trend, setTrend] = useState<TrendPoint[]>(opts.fallback);
  const [loading, setLoading] = useState(opts.enabled);
  const [usingLive, setUsingLive] = useState(false);

  useEffect(() => {
    if (!opts.enabled) {
      setTrend(opts.fallback);
      setUsingLive(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.insights
      .trend(opts.days ?? 30)
      .then((res) => {
        if (cancelled) return;
        if (res.trend.length > 0) {
          setTrend(res.trend);
          setUsingLive(true);
        }
      })
      .catch(() => {
        /* keep fallback */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.days]);

  return { trend, loading, usingLive };
}
