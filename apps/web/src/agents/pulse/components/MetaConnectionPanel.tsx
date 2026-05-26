import { Activity, AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import type { MetaConnectionState } from "../hooks/useMetaConnection";

export function MetaConnectionPanel({ state }: { state: MetaConnectionState }) {
  const { loading, configured, activeConnection, connections, error, startConnect, syncNow, revoke } = state;

  if (loading) {
    return (
      <section className="panel meta-panel">
        <Loader2 className="spin" size={18} />
        <span>Verificando conexión con Meta…</span>
      </section>
    );
  }

  if (configured === false) {
    return (
      <section className="panel meta-panel warn">
        <AlertCircle size={18} />
        <div>
          <strong>Meta no está configurado</strong>
          <p>
            Falta llenar <code>META_APP_ID</code>, <code>META_APP_SECRET</code> y <code>META_REDIRECT_URI</code> en{" "}
            <code>.env</code>. Cuando estén, podrás conectar tu cuenta publicitaria.
          </p>
        </div>
      </section>
    );
  }

  if (!activeConnection) {
    return (
      <section className="panel meta-panel">
        <Link2 size={18} />
        <div className="meta-info">
          <strong>Conecta tu cuenta de Meta</strong>
          <p>Autoriza Pulse para leer campañas, métricas y, cuando lo autorices, ejecutar optimizaciones.</p>
          <button className="primary-button" onClick={() => void startConnect()}>
            Conectar con Meta
          </button>
        </div>
        {error && <small className="error-text">{error}</small>}
      </section>
    );
  }

  return (
    <section className="panel meta-panel ok">
      <CheckCircle2 size={18} />
      <div className="meta-info">
        <strong>Meta conectado</strong>
        <p>
          User ID <code>{activeConnection.metaUserId}</code> · {activeConnection.scopeTier.toLowerCase().replace(/_/g, " ")} ·{" "}
          {activeConnection.accounts.length} cuentas
        </p>
        <p className="muted">
          Última sync: {activeConnection.lastSyncAt ? new Date(activeConnection.lastSyncAt).toLocaleString() : "—"}
        </p>
        <div className="meta-actions">
          <button onClick={() => void syncNow("last_7d")}>
            <RefreshCw size={14} /> Sincronizar 7d
          </button>
          <button onClick={() => void syncNow("last_30d")}>
            <Activity size={14} /> Sincronizar 30d
          </button>
          <button className="danger" onClick={() => void revoke(activeConnection.id)}>
            <Unlink size={14} /> Desconectar
          </button>
        </div>
      </div>
      {connections.length > 1 && (
        <small className="muted">{connections.length - 1} conexiones inactivas en histórico.</small>
      )}
      {error && <small className="error-text">{error}</small>}
    </section>
  );
}
