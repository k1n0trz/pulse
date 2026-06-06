import { useState } from "react";
import { ShieldCheck, Search, Loader2, ExternalLink, TrendingUp, Lightbulb, Users } from "lucide-react";
import type { Campaign } from "@pulse/shared";
import { auditAccount, createOptimizationPlan, deriveAuditInsights } from "@pulse/shared";
import { api, type CompetitiveResultDTO } from "../../../lib/api";

type Audit = ReturnType<typeof auditAccount>;
type Plan = ReturnType<typeof createOptimizationPlan>;

const COUNTRIES = [
  { code: "CO", name: "Colombia" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "PE", name: "Perú" },
  { code: "ES", name: "España" },
  { code: "US", name: "Estados Unidos" }
];

export function AuditPanel({ audit, campaigns, plan }: { audit: Audit; campaigns: Campaign[]; plan: Plan }) {
  const insights = deriveAuditInsights(campaigns, audit, plan.recommendations);
  const categories: Array<[string, number]> = [
    ["Estructura", audit.structure],
    ["Tracking", audit.tracking],
    ["Creatividad", audit.creative],
    ["Presupuesto", audit.budget],
    ["Segmentación", audit.audience]
  ];

  return (
    <section className="single-view audit-panel">
      <div className="panel audit-hero">
        <div>
          <span>Score de cuenta</span>
          <strong>{audit.score}/100</strong>
          <p>{insights.headline}</p>
        </div>
        <ShieldCheck size={96} />
      </div>

      <div className="audit-grid">
        {categories.map(([label, value]) => (
          <article className="panel audit-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <div className="bar"><i style={{ width: `${value}%` }} /></div>
          </article>
        ))}
      </div>

      {/* Insights */}
      <section className="panel">
        <div className="panel-head"><h2><Lightbulb size={18} /> Insights</h2><span>{insights.insights.length}</span></div>
        <div className="insight-grid">
          {insights.insights.map((it) => (
            <article key={it.id} className={`insight-card ${it.status}`}>
              <span className="insight-cat">{it.category}</span>
              <strong>{it.title}</strong>
              <p>{it.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Prioritized actions */}
      <section className="panel">
        <div className="panel-head"><h2><TrendingUp size={18} /> Recomendaciones priorizadas</h2><span>{insights.actions.length}</span></div>
        {insights.actions.length === 0 ? (
          <p className="muted">Sin acciones pendientes. La cuenta está optimizada.</p>
        ) : (
          <div className="action-list">
            {insights.actions.map((a) => (
              <div className="action-item" key={a.id}>
                <div className="action-tags">
                  <span className={`tag impact-${a.impact}`}>Impacto {a.impact}</span>
                  <span className="tag effort">Esfuerzo {a.effort}</span>
                </div>
                <div className="action-body">
                  <strong>{a.title}</strong>
                  <p>{a.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <CompetitivePanel />
    </section>
  );
}

function CompetitivePanel() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("CO");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompetitiveResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.competitive.search(q.trim(), country));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel competitive-panel">
      <div className="panel-head"><h2><Users size={18} /> Inteligencia competitiva</h2></div>
      <p className="muted competitive-intro">Busca anuncios activos de marcas que pautan productos similares (Meta Ad Library).</p>

      <div className="competitive-search">
        <label className="cm-search">
          <Search size={15} />
          <input type="search" placeholder="Ej. zapatillas running, crema facial…" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} />
        </label>
        <select className="pulse-select" value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <button className="primary-button" disabled={loading || q.trim().length < 2} onClick={() => void run()}>
          {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Buscar
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <>
          {result.source === "demo" && <div className="cm-demo-banner">{result.note ?? "Datos de ejemplo."}</div>}
          <div className="competitive-summary">
            <div className="cs-stat"><strong>{result.insights.totalAds}</strong><span>anuncios activos</span></div>
            <div className="cs-stat"><strong>{result.insights.topAdvertisers.length}</strong><span>anunciantes</span></div>
            <div className="cs-stat"><strong>{result.insights.platforms.map((p) => p.platform).join(", ") || "—"}</strong><span>plataformas</span></div>
          </div>

          {result.insights.topAdvertisers.length > 0 && (
            <div className="competitive-top">
              <h4>Quién pauta más</h4>
              {result.insights.topAdvertisers.map((a) => (
                <div className="ct-row" key={a.pageName}><span>{a.pageName}</span><span className="ct-count">{a.ads} anuncio(s)</span></div>
              ))}
            </div>
          )}

          <div className="competitive-ads">
            {result.ads.map((ad, i) => (
              <article className="comp-ad" key={i}>
                <div className="comp-ad-head">
                  <strong>{ad.pageName}</strong>
                  {ad.snapshotUrl && <a href={ad.snapshotUrl} target="_blank" rel="noreferrer" title="Ver en Ad Library"><ExternalLink size={13} /></a>}
                </div>
                <p>{ad.body || "(sin texto)"}</p>
                {ad.linkTitle && <small className="comp-ad-cta">{ad.linkTitle}</small>}
                <div className="comp-ad-platforms">{ad.platforms.map((p) => <span key={p}>{p}</span>)}</div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
