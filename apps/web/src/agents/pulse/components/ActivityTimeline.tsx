import { useEffect, useState } from "react";
import { Activity, AlertCircle, Loader2 } from "lucide-react";
import { api, type AuditEventDTO } from "../../../lib/api";

const ICONS: Record<string, typeof Activity> = {
  INFO: Activity,
  WARN: AlertCircle,
  ERROR: AlertCircle,
  CRITICAL: AlertCircle
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "hace segundos";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

export function ActivityTimeline({ limit = 20 }: { limit?: number }) {
  const [events, setEvents] = useState<AuditEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.audit.list({ limit })
      .then((res) => setEvents(res.events))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <section className="panel activity-panel">
      <div className="panel-head">
        <h2>Actividad reciente</h2>
        <span>{loading ? "…" : events.length}</span>
      </div>
      {error && <small className="error-text">{error}</small>}
      {loading ? (
        <div className="loading-row"><Loader2 className="spin" size={16} /> Cargando…</div>
      ) : events.length === 0 ? (
        <p className="muted-banner">Sin actividad reciente. Conecta Meta y pide una auditoría a Pulse.</p>
      ) : (
        <div className="timeline">
          {events.map((event) => {
            const Icon = ICONS[event.severity] ?? Activity;
            return (
              <p key={event.id} className={`timeline-row sev-${event.severity.toLowerCase()}`}>
                <Icon size={14} />
                <span className="timeline-msg"><strong>{event.type}</strong>{event.message ? ` · ${event.message}` : ""}</span>
                <em>{formatRelative(event.createdAt)}</em>
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}
