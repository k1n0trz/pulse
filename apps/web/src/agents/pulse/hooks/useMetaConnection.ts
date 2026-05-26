import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type MetaConnectionDTO, type MetaOAuthConfig } from "../../../lib/api";

export interface MetaConnectionState {
  loading: boolean;
  configured: boolean | null;
  config: MetaOAuthConfig | null;
  connections: MetaConnectionDTO[];
  activeConnection: MetaConnectionDTO | null;
  error: string | null;
  refresh: () => Promise<void>;
  startConnect: () => Promise<void>;
  syncNow: (datePreset?: "last_7d" | "last_14d" | "last_30d" | "last_90d") => Promise<void>;
  revoke: (connectionId: string) => Promise<void>;
}

export function useMetaConnection(): MetaConnectionState {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<MetaOAuthConfig | null>(null);
  const [connections, setConnections] = useState<MetaConnectionDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, list] = await Promise.all([api.meta.config(), api.connections.list().catch(() => ({ connections: [] as MetaConnectionDTO[] }))]);
      setConfig(cfg);
      setConnections(list.connections ?? []);
    } catch (err) {
      const message = err instanceof ApiError ? `${err.status}: ${err.message}` : (err as Error).message;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startConnect = useCallback(async () => {
    setError(null);
    try {
      const { url } = await api.meta.startUrl({ redirectTo: window.location.href });
      window.location.assign(url);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
    }
  }, []);

  const syncNow = useCallback(
    async (datePreset?: "last_7d" | "last_14d" | "last_30d" | "last_90d") => {
      const active = connections.find((c) => c.status === "ACTIVE");
      if (!active) {
        setError("No hay conexión activa.");
        return;
      }
      try {
        await api.connections.sync(active.id, datePreset);
        await refresh();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : (err as Error).message;
        setError(message);
      }
    },
    [connections, refresh]
  );

  const revoke = useCallback(
    async (connectionId: string) => {
      try {
        await api.connections.revoke(connectionId);
        await refresh();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : (err as Error).message;
        setError(message);
      }
    },
    [refresh]
  );

  const activeConnection = connections.find((c) => c.status === "ACTIVE") ?? null;
  const configured = config?.configured ?? null;

  return { loading, configured, config, connections, activeConnection, error, refresh, startConnect, syncNow, revoke };
}
