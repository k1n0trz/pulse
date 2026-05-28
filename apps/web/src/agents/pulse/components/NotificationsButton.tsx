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

  if (status === "loading") {
    return (
      <button className="ghost-button" disabled title="Verificando notificaciones…">
        <Loader2 size={16} className="spin" /> Notificaciones
      </button>
    );
  }

  if (status === "not-configured") {
    return (
      <button className="ghost-button" disabled title="Set ONESIGNAL_APP_ID + ONESIGNAL_API_KEY en .env">
        <BellOff size={16} /> Notificaciones off
      </button>
    );
  }

  if (status === "unsupported") {
    return (
      <button className="ghost-button" disabled title="Browser sin soporte web push">
        <BellOff size={16} /> No soportado
      </button>
    );
  }

  return (
    <button
      className={`ghost-button ${status === "on" ? "is-on" : ""}`}
      onClick={() => void toggle()}
      disabled={working}
      title={status === "on" ? "Desactivar notificaciones push" : status === "denied" ? "Permiso denegado — revisa site settings" : "Activar notificaciones push"}
    >
      {working ? <Loader2 size={16} className="spin" /> : status === "on" ? <Bell size={16} /> : status === "denied" ? <AlertCircle size={16} /> : <BellOff size={16} />}
      {status === "on" ? "Notificaciones ON" : status === "denied" ? "Bloqueadas" : "Activar push"}
      {error && <small className="error-text" style={{ marginLeft: 8 }}>{error}</small>}
    </button>
  );
}
