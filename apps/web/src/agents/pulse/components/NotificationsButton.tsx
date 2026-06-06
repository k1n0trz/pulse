import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, AlertCircle } from "lucide-react";
import { api } from "../../../lib/api";
import { ensureOneSignal, getPushStatus, identifyUser, optInToPush, optOutOfPush } from "../../../lib/onesignal";

type Status = "loading" | "not-configured" | "unsupported" | "off" | "on" | "denied";

export function NotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const config = await api.notifications.config();
      if (!config.onesignal.configured) {
        setStatus("not-configured");
        return;
      }
      const me = await api.me.get();
      const os = await ensureOneSignal();
      if (!os) {
        setStatus("not-configured");
        return;
      }
      // Register our identity with OneSignal so backend can target us.
      if (me.user.oneSignalExternalId !== me.user.id) {
        await identifyUser(me.user.id);
      }
      const push = await getPushStatus();
      if (!push.supported) {
        setStatus("unsupported");
        return;
      }
      if (push.optedIn && push.permission) {
        setStatus("on");
      } else if (push.permission === false && push.optedIn === false) {
        setStatus("off");
      } else {
        setStatus("denied");
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("off");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (status === "loading" || status === "unsupported" || status === "not-configured" || working) return;
    setWorking(true);
    setError(null);
    try {
      if (status === "on") {
        await optOutOfPush();
      } else {
        const result = await optInToPush();
        if (!result.ok) {
          if (result.reason === "permission_denied") setError("Permiso bloqueado por el browser. Habilítalo en site settings.");
          else if (result.reason === "push_unsupported") setError("Este browser no soporta web push.");
          else setError(result.reason ?? "No se pudo activar.");
        }
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  }, [refresh, status, working]);

  // Explains, in plain language, what enabling notifications does.
  const HELP = "Recibe un aviso en este navegador cuando una campaña necesite tu atención: gasto sin resultados, caída de ROAS o presupuesto agotándose.";

  if (status === "loading") {
    return (
      <button className="ghost-button" disabled title="Verificando avisos…">
        <Loader2 size={16} className="spin" /> Avisos
      </button>
    );
  }

  if (status === "not-configured") {
    return (
      <button className="ghost-button" disabled title="Avisos no disponibles: falta configurar ONESIGNAL_APP_ID + ONESIGNAL_API_KEY.">
        <BellOff size={16} /> Avisos no disponibles
      </button>
    );
  }

  if (status === "unsupported") {
    return (
      <button className="ghost-button" disabled title="Este navegador no soporta avisos push.">
        <BellOff size={16} /> Avisos no soportados
      </button>
    );
  }

  return (
    <button
      className={`ghost-button ${status === "on" ? "is-on" : ""}`}
      onClick={() => void toggle()}
      disabled={working}
      title={status === "on" ? `Avisos activos. Clic para desactivar. ${HELP}` : status === "denied" ? "Avisos bloqueados por el navegador — habilítalos en la configuración del sitio." : `Activar avisos. ${HELP}`}
    >
      {working ? <Loader2 size={16} className="spin" /> : status === "on" ? <Bell size={16} /> : status === "denied" ? <AlertCircle size={16} /> : <BellOff size={16} />}
      {status === "on" ? "Avisos activos" : status === "denied" ? "Avisos bloqueados" : "Activar avisos"}
      {error && <small className="error-text" style={{ marginLeft: 8 }}>{error}</small>}
    </button>
  );
}
