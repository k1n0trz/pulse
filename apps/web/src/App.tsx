import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bot, CalendarDays, FileText, Gauge, Layers3, Megaphone, Plus, ShieldCheck, Sparkles, Target, Zap } from "lucide-react";
import { accountTrend, defaultPolicy, mockCampaigns } from "./agents/pulse/services/mockPulseData";
import { createOptimizationPlan, runPulseAutopilot, auditAccount, buildExecutiveReport } from "@pulse/shared";
import { ChatPulse } from "./agents/pulse/components/ChatPulse";
import { CampaignTable } from "./agents/pulse/components/CampaignTable";
import { CampaignWizard } from "./agents/pulse/components/CampaignWizard";
import { DashboardCharts } from "./agents/pulse/components/DashboardCharts";
import { ModeControl } from "./agents/pulse/components/ModeControl";
import { AutopilotPanel } from "./agents/pulse/components/AutopilotPanel";
import { MetaConnectionPanel } from "./agents/pulse/components/MetaConnectionPanel";
import { ApprovalQueue } from "./agents/pulse/components/ApprovalQueue";
import { ActivityTimeline } from "./agents/pulse/components/ActivityTimeline";
import { useMetaConnection } from "./agents/pulse/hooks/useMetaConnection";
import { useCampaigns } from "./agents/pulse/hooks/useCampaigns";
import { NotificationsButton } from "./agents/pulse/components/NotificationsButton";
import { reports } from "./lib/api";
import type { OperationMode } from "@pulse/shared";
import { metaConnectorPrinciples } from "@pulse/shared";

type Section = "inicio" | "campanas" | "autopilot" | "chat" | "auditoria" | "reportes" | "wizard";

const nav = [
  { id: "inicio", label: "Inicio", icon: Gauge },
  { id: "campanas", label: "Campanas", icon: Megaphone },
  { id: "autopilot", label: "Autopilot", icon: Zap },
  { id: "chat", label: "Chat Pulse", icon: Bot },
  { id: "auditoria", label: "Auditoria", icon: ShieldCheck },
  { id: "reportes", label: "Reportes", icon: FileText }
] satisfies Array<{ id: Section; label: string; icon: typeof Gauge }>;

function money(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

export function App() {
  const [mode, setMode] = useState<OperationMode>("assisted");
  const [section, setSection] = useState<Section>("inicio");
  const [policy, setPolicy] = useState(defaultPolicy);

  const metaState = useMetaConnection();
  const liveCampaigns = useCampaigns({ enabled: Boolean(metaState.activeConnection) });
  const campaigns = liveCampaigns.campaigns.length > 0 ? liveCampaigns.campaigns : mockCampaigns;
  const usingLiveData = liveCampaigns.campaigns.length > 0;

  const plan = useMemo(() => createOptimizationPlan(campaigns, policy), [campaigns, policy]);
  const autopilot = useMemo(() => runPulseAutopilot({ campaigns, mode, policy }), [campaigns, mode, policy]);
  const audit = useMemo(() => auditAccount(campaigns, plan.alerts), [campaigns, plan.alerts]);
  const report = useMemo(() => buildExecutiveReport(campaigns, plan), [campaigns, plan]);

  const spend = campaigns.reduce((sum, item) => sum + item.spend, 0);
  const results = campaigns.reduce((sum, item) => sum + item.results, 0);
  const leads = campaigns.filter((item) => item.objective === "Leads").reduce((sum, item) => sum + item.results, 0);
  const sales = campaigns.filter((item) => item.objective === "Ventas").reduce((sum, item) => sum + item.results, 0);
  const avgRoas = report.roas;
  const avgCpa = Math.round(spend / Math.max(results, 1));
  const avgCtr = Number((campaigns.reduce((sum, item) => sum + item.ctr, 0) / Math.max(campaigns.length, 1)).toFixed(2));
  const avgCpm = Number((campaigns.reduce((sum, item) => sum + item.cpm, 0) / Math.max(campaigns.length, 1)).toFixed(2));

  return (
    <div className="pulse-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={26} />
          </div>
          <div>
            <strong>PULSE</strong>
            <span>Ads Intelligence Agent</span>
          </div>
        </div>

        <div className="account-box">
          <span>Cuenta publicitaria</span>
          {metaState.activeConnection?.accounts[0] ? (
            <>
              <strong>{metaState.activeConnection.accounts[0].name}</strong>
              <small>ID: {metaState.activeConnection.accounts[0].metaAccountId}</small>
              <em>Conectado a Meta Ads · {metaState.activeConnection.accounts.length} cuentas</em>
            </>
          ) : (
            <>
              <strong>Sin conexión activa</strong>
              <small>Pulse usa datos demo</small>
              <em>Conecta Meta para datos reales</em>
            </>
          )}
        </div>

        <nav className="nav-list">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <ModeControl mode={mode} onModeChange={setMode} policy={policy} onPolicyChange={setPolicy} />
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>Hola, Edi</h1>
            <p>Rendimiento y ejecucion activa de campanas Meta Ads.</p>
          </div>
          <div className="topbar-actions">
            <NotificationsButton />
            <button className="ghost-button">
              <CalendarDays size={16} />
              Ultimos 7 dias
            </button>
            <button className="ghost-button" onClick={() => setSection("auditoria")}>
              <ShieldCheck size={16} />
              Auditar cuenta
            </button>
            <button className="primary-button" onClick={() => setSection("wizard")}>
              <Plus size={17} />
              Nueva campana
            </button>
          </div>
        </header>

        <section className="metric-grid">
          <Metric icon={BarChart3} label="Inversion total" value={money(spend)} change="+18.7%" tone="good" />
          <Metric icon={Target} label="Resultados" value={results.toLocaleString("en-US")} change="+23.5%" tone="good" />
          <Metric icon={AlertTriangle} label="CPA promedio" value={money(avgCpa)} change="+12.3%" tone="bad" />
          <Metric icon={Sparkles} label="ROAS" value={`${avgRoas}x`} change="+33.3%" tone="good" />
          <Metric icon={Layers3} label="CTR / CPM" value={`${avgCtr}% / $${avgCpm}`} change="+8.4%" tone="good" />
          <Metric icon={Megaphone} label="Campanas activas" value={String(campaigns.filter((c) => c.status === "active").length)} change={`${plan.alerts.length} alertas`} tone="warn" />
        </section>

        {section === "inicio" && (
          <div className="dashboard-grid">
            <MetaConnectionPanel state={metaState} />
            {!usingLiveData && (
              <p className="muted-banner">
                Mostrando datos demo. Conecta una cuenta de Meta para ver campañas reales.
              </p>
            )}
            <DashboardCharts trend={accountTrend} leads={leads} sales={sales} />
            <AlertsPanel plan={plan} />
            <CampaignTable campaigns={campaigns} compact />
            <AutopilotPanel mode={mode} policy={policy} result={autopilot} onPolicyChange={setPolicy} />
            <ApprovalQueue status="OPEN" allowExecute={mode === "autopilot"} />
            <RecommendationsPanel plan={plan} />
            <ActivityTimeline limit={15} />
          </div>
        )}

        {section === "campanas" && <CampaignTable campaigns={campaigns} />}
        {section === "autopilot" && <AutopilotPanel mode={mode} policy={policy} result={autopilot} onPolicyChange={setPolicy} expanded />}
        {section === "chat" && <ChatPulse mode={mode} />}
        {section === "auditoria" && <AuditView audit={audit} />}
        {section === "reportes" && <ReportsView report={report} connectorPrinciples={metaConnectorPrinciples} />}
        {section === "wizard" && <CampaignWizard />}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, change, tone }: { icon: typeof Gauge; label: string; value: string; change: string; tone: "good" | "bad" | "warn" }) {
  return (
    <article className="metric-panel">
      <div className="metric-icon">
        <Icon size={26} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={tone}>{change} vs periodo previo</small>
    </article>
  );
}

function AlertsPanel({ plan }: { plan: ReturnType<typeof createOptimizationPlan> }) {
  return (
    <section className="panel alerts-panel">
      <div className="panel-head">
        <h2>Alertas criticas</h2>
        <span>{plan.alerts.length}</span>
      </div>
      <div className="stack">
        {plan.alerts.slice(0, 4).map((alert) => (
          <div className={`alert-row ${alert.severity}`} key={alert.id}>
            <AlertTriangle size={17} />
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendationsPanel({ plan }: { plan: ReturnType<typeof createOptimizationPlan> }) {
  return (
    <section className="panel recommendations-panel">
      <div className="panel-head">
        <h2>Recomendaciones IA</h2>
        <span>{plan.recommendations.length}</span>
      </div>
      <div className="stack">
        {plan.recommendations.slice(0, 5).map((item) => (
          <div className="recommendation-row" key={item.id}>
            <span className={`severity ${item.severity}`}>{item.severity}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.expectedImpact}</p>
            </div>
            <button>{item.requiresApproval ? "Aprobar" : "Ejecutar"}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditView({ audit }: { audit: ReturnType<typeof auditAccount> }) {
  const items = [
    ["Estructura", audit.structure],
    ["Tracking", audit.tracking],
    ["Creatividad", audit.creative],
    ["Presupuesto", audit.budget],
    ["Segmentacion", audit.audience]
  ];

  return (
    <section className="single-view">
      <div className="panel audit-hero">
        <div>
          <span>Score de cuenta</span>
          <strong>{audit.score}/100</strong>
          <p>Pulse evalua estructura, tracking, creatividades, presupuesto y segmentacion.</p>
        </div>
        <ShieldCheck size={96} />
      </div>
      <div className="audit-grid">
        {items.map(([label, value]) => (
          <article className="panel audit-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <div className="bar"><i style={{ width: `${value}%` }} /></div>
          </article>
        ))}
      </div>
      <section className="panel">
        <h2>Hallazgos</h2>
        <div className="stack">
          {audit.findings.map((finding) => <p className="finding" key={finding}>{finding}</p>)}
        </div>
      </section>
    </section>
  );
}

function ReportsView({ report, connectorPrinciples }: { report: ReturnType<typeof buildExecutiveReport>; connectorPrinciples: string[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="single-view">
      <div className="report-grid">
        <article className="panel report-card">
          <FileText size={34} />
          <h2>Reporte ejecutivo</h2>
          <p>Inversion {money(report.spend)} · ROAS {report.roas}x · Score {report.accountScore}/100</p>
          <div className="report-actions">
            <button disabled={busy !== null} onClick={() => void run("pdf", reports.executivePdf)}>
              {busy === "pdf" ? "Generando…" : "Exportar PDF"}
            </button>
            <button disabled={busy !== null} onClick={() => void run("xlsx", reports.executiveXlsx)}>
              {busy === "xlsx" ? "Generando…" : "Exportar XLSX"}
            </button>
          </div>
        </article>
        <article className="panel report-card">
          <BarChart3 size={34} />
          <h2>Reporte de campañas</h2>
          <p>Tabla completa de campañas con métricas, lista para compartir o analizar.</p>
          <div className="report-actions">
            <button disabled={busy !== null} onClick={() => void run("csv", reports.campaignsCsv)}>
              {busy === "csv" ? "Generando…" : "Exportar CSV"}
            </button>
            <button disabled={busy !== null} onClick={() => void run("camp-xlsx", reports.campaignsXlsx)}>
              {busy === "camp-xlsx" ? "Generando…" : "Exportar XLSX"}
            </button>
          </div>
        </article>
      </div>
      {error && <p className="error-text">{error}</p>}
      <section className="panel">
        <h2>Compatibilidad Meta Ads AI Connectors</h2>
        <div className="connector-list">
          {connectorPrinciples.map((item) => <p key={item}>{item}</p>)}
        </div>
      </section>
    </section>
  );
}
