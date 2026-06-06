import { useEffect, useMemo, useState } from "react";
import { FileText, FileSpreadsheet, Loader2, Filter } from "lucide-react";
import { reports, type ReportFilters, type ReportOptionsDTO } from "../../../lib/api";

export function ReportsGateway() {
  const [options, setOptions] = useState<ReportOptionsDTO | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reports.options().then(setOptions).catch(() => setOptions({ ok: false, portfolios: [], accounts: [], campaigns: [] }));
  }, []);

  // Accounts filtered by the selected portfolio.
  const accounts = useMemo(() => {
    const all = options?.accounts ?? [];
    return businessId ? all.filter((a) => a.businessId === businessId) : all;
  }, [options, businessId]);

  // Campaigns filtered by the selected account.
  const campaigns = useMemo(() => {
    const all = options?.campaigns ?? [];
    return accountId ? all.filter((c) => c.accountId === accountId) : all;
  }, [options, accountId]);

  const filters: ReportFilters = {
    businessId: businessId || undefined,
    accountIds: accountId ? [accountId] : undefined,
    campaignIds: campaignIds.length > 0 ? campaignIds : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  };

  const run = async (key: string, fn: (f: ReportFilters) => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn(filters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleCampaign = (id: string) =>
    setCampaignIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clear = () => { setBusinessId(""); setAccountId(""); setCampaignIds([]); setDateFrom(""); setDateTo(""); };
  const hasFilters = businessId || accountId || campaignIds.length > 0 || dateFrom || dateTo;

  return (
    <section className="single-view reports-gateway">
      <div className="section-header">
        <div>
          <h2>Reportes</h2>
          <p>Genera reportes filtrando por fecha, portafolio, cuenta y campañas.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><h2><Filter size={18} /> Filtros</h2>{hasFilters && <button className="link-button" onClick={clear}>Limpiar</button>}</div>
        <div className="rg-filters">
          <label>Desde <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label>Hasta <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <label>Portafolio comercial
            <select className="pulse-select" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setAccountId(""); setCampaignIds([]); }}>
              <option value="">Todos los portafolios</option>
              {(options?.portfolios ?? []).map((p) => (
                <option key={p.businessId} value={p.businessId}>Portafolio {p.businessId} · {p.accounts} cuenta(s)</option>
              ))}
            </select>
          </label>
          <label>Cuenta publicitaria
            <select className="pulse-select" value={accountId} onChange={(e) => { setAccountId(e.target.value); setCampaignIds([]); }}>
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>

        <div className="rg-campaigns">
          <div className="rg-campaigns-head">
            <span>Campañas {campaignIds.length > 0 ? `(${campaignIds.length} seleccionadas)` : "(todas)"}</span>
            {campaignIds.length > 0 && <button className="link-button" onClick={() => setCampaignIds([])}>Quitar selección</button>}
          </div>
          <div className="rg-campaign-list">
            {campaigns.length === 0 ? (
              <p className="muted">No hay campañas para esta selección.</p>
            ) : campaigns.map((c) => (
              <label key={c.id} className="rg-campaign">
                <input type="checkbox" checked={campaignIds.includes(c.id)} onChange={() => toggleCampaign(c.id)} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      <div className="rg-outputs">
        <article className="panel rg-card">
          <FileText size={30} />
          <h3>Reporte ejecutivo</h3>
          <p>Resumen con KPIs, recomendaciones y top de campañas, con diseño de marca Pulse.</p>
          <div className="rg-actions">
            <button className="primary-button" disabled={busy !== null} onClick={() => void run("exec-pdf", reports.executivePdf)}>
              {busy === "exec-pdf" ? <Loader2 size={15} className="spin" /> : <FileText size={15} />} PDF
            </button>
            <button className="ghost-button" disabled={busy !== null} onClick={() => void run("exec-xlsx", reports.executiveXlsx)}>
              {busy === "exec-xlsx" ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />} XLSX
            </button>
          </div>
        </article>

        <article className="panel rg-card">
          <FileSpreadsheet size={30} />
          <h3>Reporte de campañas</h3>
          <p>Tabla completa de campañas con todas sus métricas, en formato Excel (XLSX).</p>
          <div className="rg-actions">
            <button className="primary-button" disabled={busy !== null} onClick={() => void run("camp-xlsx", reports.campaignsXlsx)}>
              {busy === "camp-xlsx" ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />} Descargar XLSX
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
