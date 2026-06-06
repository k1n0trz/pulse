import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, Loader2, Pause, Pencil, Play, Plus, Search, X } from "lucide-react";
import type { Campaign } from "@pulse/shared";
import { api, ApiError, type CampaignDTO } from "../../../lib/api";

const META_OBJECTIVES: Array<{ value: string; label: string }> = [
  { value: "OUTCOME_SALES", label: "Ventas" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_TRAFFIC", label: "Tráfico" },
  { value: "OUTCOME_ENGAGEMENT", label: "Interacción" },
  { value: "OUTCOME_AWARENESS", label: "Reconocimiento" },
  { value: "OUTCOME_APP_PROMOTION", label: "App" }
];

interface Row {
  id: string;
  metaCampaignId: string | null;
  accountId: string | null;
  name: string;
  objective: string;
  status: string; // normalized upper
  budget: number;
  spend: number;
  results: number;
  cpa: number | null;
  roas: number | null;
  ctr: number | null;
  live: boolean;
}

function fromDTO(c: CampaignDTO): Row {
  return {
    id: c.id,
    metaCampaignId: c.metaCampaignId,
    accountId: c.account?.id ?? null,
    name: c.name,
    objective: c.objective,
    status: (c.status || "").toUpperCase(),
    budget: c.budget ?? 0,
    spend: c.spend ?? 0,
    results: c.results ?? 0,
    cpa: c.cpa,
    roas: c.roas,
    ctr: c.ctr,
    live: true
  };
}

function fromMock(c: Campaign): Row {
  return {
    id: c.id,
    metaCampaignId: null,
    accountId: null,
    name: c.name,
    objective: c.objective,
    status: c.status === "active" ? "ACTIVE" : "PAUSED",
    budget: c.budget,
    spend: c.spend,
    results: c.results,
    cpa: c.cpa ?? null,
    roas: c.roas ?? null,
    ctr: c.ctr ?? null,
    live: false
  };
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function CampaignManager({
  fallback,
  accounts,
  selectedAccountId,
  onConnect
}: {
  fallback: Campaign[];
  accounts: Array<{ id: string; name: string; metaAccountId: string }>;
  selectedAccountId: string | null;
  onConnect: () => void;
}) {
  const [live, setLive] = useState<CampaignDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [objective, setObjective] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // modals
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [adsetFor, setAdsetFor] = useState<Row | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.campaigns.list({
        pageSize: 200,
        accountId: selectedAccountId ?? undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      setLive(res.campaigns);
    } catch {
      setLive([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const liveMode = live.length > 0;
  const allRows: Row[] = useMemo(
    () => (liveMode ? live.map(fromDTO) : fallback.map(fromMock)),
    [liveMode, live, fallback]
  );

  const objectives = useMemo(() => Array.from(new Set(allRows.map((r) => r.objective))).sort(), [allRows]);

  // Date range is applied server-side (capturedAt) via refresh(); search/status/
  // objective filter client-side so they work over both live and demo data.
  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (status && r.status !== status) return false;
      if (objective && r.objective !== objective) return false;
      return true;
    });
  }, [allRows, q, status, objective]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [q, status, objective, dateFrom, dateTo, pageSize, liveMode]);

  const act = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setWorking(key);
    setBanner(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 409) setBanner("Conecta una cuenta de Meta para gestionar campañas.");
      else setBanner(e.message);
    } finally {
      setWorking(null);
    }
  }, [refresh]);

  const toggleStatus = (r: Row) =>
    act(`status-${r.id}`, () => api.campaigns.setStatus(r.id, r.status === "ACTIVE" ? "PAUSED" : "ACTIVE"));

  const clearFilters = () => { setQ(""); setStatus(""); setObjective(""); setDateFrom(""); setDateTo(""); };
  const hasFilters = q || status || objective || dateFrom || dateTo;

  return (
    <section className="single-view campaign-manager">
      <div className="section-header">
        <div>
          <h2>Campañas</h2>
          <p>Gestiona campañas, conjuntos y anuncios al estilo Meta Ads.</p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Nueva campaña
        </button>
      </div>

      {!liveMode && !loading && (
        <div className="cm-demo-banner">
          Mostrando datos de ejemplo. <button className="link-button" onClick={onConnect}>Conecta tu cuenta de Meta</button> para gestionar campañas reales.
        </div>
      )}
      {banner && <div className="cm-error">{banner} <button onClick={() => setBanner(null)}><X size={13} /></button></div>}

      {/* Filter bar */}
      <div className="cm-filters">
        <label className="cm-search">
          <Search size={15} />
          <input type="search" placeholder="Buscar campaña…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="pulse-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
          <option value="ARCHIVED">Archivadas</option>
        </select>
        <select className="pulse-select" value={objective} onChange={(e) => setObjective(e.target.value)} aria-label="Objetivo">
          <option value="">Todos los objetivos</option>
          {objectives.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="cm-date">Desde <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="cm-date">Hasta <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        {hasFilters && <button className="ghost-button" onClick={clearFilters}>Limpiar</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-row"><Loader2 className="spin" size={16} /> Cargando campañas…</div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>Campaña</th><th>Objetivo</th><th>Estado</th><th>Presupuesto</th>
                <th>Gasto</th><th>Resultados</th><th>CPA</th><th>ROAS</th><th>CTR</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={10} className="cm-empty">No hay campañas que coincidan con los filtros.</td></tr>
              ) : pageRows.map((r) => (
                <tr key={r.id}>
                  <td className="cm-name">{r.name}</td>
                  <td>{r.objective}</td>
                  <td><span className={`cm-badge ${r.status === "ACTIVE" ? "on" : "off"}`}>{r.status === "ACTIVE" ? "Activa" : r.status === "PAUSED" ? "Pausada" : r.status}</span></td>
                  <td>{r.budget ? money(r.budget) : "—"}</td>
                  <td>{money(r.spend)}</td>
                  <td>{r.results.toLocaleString("en-US")}</td>
                  <td>{r.cpa != null ? money(r.cpa) : "—"}</td>
                  <td>{r.roas != null ? `${r.roas}x` : "—"}</td>
                  <td>{r.ctr != null ? `${r.ctr}%` : "—"}</td>
                  <td className="cm-actions">
                    <button title={r.status === "ACTIVE" ? "Pausar" : "Activar"} disabled={!r.live || working === `status-${r.id}`} onClick={() => void toggleStatus(r)}>
                      {working === `status-${r.id}` ? <Loader2 size={14} className="spin" /> : r.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button title="Editar" disabled={!r.live} onClick={() => setEditRow(r)}><Pencil size={14} /></button>
                    <button title="Crear conjunto de anuncios" disabled={!r.live} onClick={() => setAdsetFor(r)}><Layers size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="cm-pagination">
        <span>{filtered.length} campaña(s)</span>
        <div className="cm-pager">
          <label>Por página
            <select className="pulse-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
            </select>
          </label>
          <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
          <span>{currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      {showCreate && (
        <CampaignFormModal
          title="Nueva campaña"
          accounts={accounts}
          defaultAccountId={selectedAccountId}
          submitting={working === "create"}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => act("create", async () => {
            await api.campaigns.create(data);
            setShowCreate(false);
          })}
        />
      )}

      {editRow && (
        <EditCampaignModal
          row={editRow}
          submitting={working === `edit-${editRow.id}`}
          onClose={() => setEditRow(null)}
          onSubmit={(data) => act(`edit-${editRow.id}`, async () => {
            await api.campaigns.update(editRow.id, data);
            setEditRow(null);
          })}
        />
      )}

      {adsetFor && (
        <AdSetModal
          row={adsetFor}
          submitting={working === `adset-${adsetFor.id}`}
          onClose={() => setAdsetFor(null)}
          onSubmit={(data) => act(`adset-${adsetFor.id}`, async () => {
            if (!adsetFor.accountId || !adsetFor.metaCampaignId) throw new ApiError("Campaña sin cuenta/Meta ID", 409);
            await api.campaigns.createAdSet({ accountId: adsetFor.accountId, campaignId: adsetFor.metaCampaignId, ...data });
            setAdsetFor(null);
          })}
        />
      )}
    </section>
  );
}

// ---------- Modals ----------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-modal-head"><h3>{title}</h3><button onClick={onClose}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function CampaignFormModal({ title, accounts, defaultAccountId, submitting, onClose, onSubmit }: {
  title: string;
  accounts: Array<{ id: string; name: string; metaAccountId: string }>;
  defaultAccountId: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: { accountId: string; name: string; objective: string; dailyBudget?: number; status?: "PAUSED" | "ACTIVE" }) => void;
}) {
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState(META_OBJECTIVES[0].value);
  const [budget, setBudget] = useState("");

  const canSubmit = accountId && name.trim().length > 0;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="cm-form">
        <label>Cuenta publicitaria
          <select className="pulse-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 && <option value="">Conecta una cuenta primero</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.metaAccountId}</option>)}
          </select>
        </label>
        <label>Nombre <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ventas — Retargeting Q3" /></label>
        <label>Objetivo
          <select className="pulse-select" value={objective} onChange={(e) => setObjective(e.target.value)}>
            {META_OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>Presupuesto diario (USD, opcional) <input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Ej. 20" /></label>
        <p className="cm-hint">Las campañas se crean <strong>pausadas</strong> (regla de Meta) para que las revises antes de activar.</p>
        <div className="cm-form-actions">
          <button className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={!canSubmit || submitting}
            onClick={() => onSubmit({ accountId, name: name.trim(), objective, dailyBudget: budget ? Number(budget) : undefined, status: "PAUSED" })}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Crear campaña
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditCampaignModal({ row, submitting, onClose, onSubmit }: {
  row: Row;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: { name?: string; dailyBudget?: number; status?: "PAUSED" | "ACTIVE" }) => void;
}) {
  const [name, setName] = useState(row.name);
  const [budget, setBudget] = useState(row.budget ? String(row.budget) : "");

  return (
    <Modal title={`Editar: ${row.name}`} onClose={onClose}>
      <div className="cm-form">
        <label>Nombre <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Presupuesto diario (USD) <input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <div className="cm-form-actions">
          <button className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={submitting}
            onClick={() => onSubmit({ name: name.trim() || undefined, dailyBudget: budget ? Number(budget) : undefined })}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Pencil size={15} />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AdSetModal({ row, submitting, onClose, onSubmit }: {
  row: Row;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; dailyBudget?: number; optimizationGoal?: string; billingEvent?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  return (
    <Modal title={`Nuevo conjunto · ${row.name}`} onClose={onClose}>
      <div className="cm-form">
        <label>Nombre del conjunto <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Lookalike 1% — 18-34" /></label>
        <label>Presupuesto diario (USD, opcional) <input type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <p className="cm-hint">Se crea pausado. La segmentación detallada y los anuncios se configuran después.</p>
        <div className="cm-form-actions">
          <button className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={!name.trim() || submitting}
            onClick={() => onSubmit({ name: name.trim(), dailyBudget: budget ? Number(budget) : undefined })}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Layers size={15} />} Crear conjunto
          </button>
        </div>
      </div>
    </Modal>
  );
}
