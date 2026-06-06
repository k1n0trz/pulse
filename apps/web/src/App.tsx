import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bot, CalendarDays, FileText, Gauge, Layers3, Megaphone, Plus, ShieldCheck, Sparkles, Target, UserCircle, Zap } from "lucide-react";
import { accountTrend, defaultPolicy, mockCampaigns } from "./agents/pulse/services/mockPulseData";
import { createOptimizationPlan, runPulseAutopilot, auditAccount, buildExecutiveReport } from "@pulse/shared";
import { ChatPulse } from "./agents/pulse/components/ChatPulse";
import { CampaignTable } from "./agents/pulse/components/CampaignTable";
import { CampaignManager } from "./agents/pulse/components/CampaignManager";
import { AuditPanel } from "./agents/pulse/components/AuditPanel";
import { ReportsGateway } from "./agents/pulse/components/ReportsGateway";
import { CampaignWizard } from "./agents/pulse/components/CampaignWizard";
import { DashboardCharts } from "./agents/pulse/components/DashboardCharts";
import { ModeControl } from "./agents/pulse/components/ModeControl";
import { AutopilotPanel } from "./agents/pulse/components/AutopilotPanel";
import { LearningPanel } from "./agents/pulse/components/LearningPanel";
import { MetaConnectionPanel } from "./agents/pulse/components/MetaConnectionPanel";
import { ApprovalQueue } from "./agents/pulse/components/ApprovalQueue";
import { ActivityTimeline } from "./agents/pulse/components/ActivityTimeline";
import { useMetaConnection } from "./agents/pulse/hooks/useMetaConnection";
import { useCampaigns } from "./agents/pulse/hooks/useCampaigns";
import { NotificationsButton } from "./agents/pulse/components/NotificationsButton";
import { OnboardingChecklist } from "./agents/pulse/components/OnboardingChecklist";
import { useAccountTrend } from "./agents/pulse/hooks/useAccountTrend";
import { useBilling } from "./agents/pulse/hooks/useBilling";
import { PlansPaywall } from "./agents/pulse/components/PlansPaywall";
import { ProfilePanel } from "./agents/pulse/components/ProfilePanel";
import { useI18n } from "./i18n";
import type { OperationMode } from "@pulse/shared";

type Section = "inicio" | "campanas" | "autopilot" | "chat" | "auditoria" | "reportes" | "perfil" | "wizard";

const nav = [
  { id: "inicio", icon: Gauge },
  { id: "campanas", icon: Megaphone },
  { id: "autopilot", icon: Zap },
  { id: "chat", icon: Bot },
  { id: "auditoria", icon: ShieldCheck },
  { id: "reportes", icon: FileText },
  { id: "perfil", icon: UserCircle }
] satisfies Array<{ id: Section; icon: typeof Gauge }>;

function money(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

type TrendLike = { spend: number; results: number; roas: number; cpa: number };

// Period-over-period: compares the first vs second half of the window.
function periodDelta(points: TrendLike[], key: keyof TrendLike, mode: "sum" | "avg"): number | null {
  if (points.length < 4) return null;
  const mid = Math.floor(points.length / 2);
  const a = points.slice(0, mid);
  const b = points.slice(mid);
  const agg = (arr: TrendLike[]) => {
    const total = arr.reduce((s, p) => s + (Number(p[key]) || 0), 0);
    return mode === "avg" ? total / Math.max(arr.length, 1) : total;
  };
  const prev = agg(a);
  const curr = agg(b);
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// Returns { caption, tone } for a metric card. higherIsBetter flips tone for CPA.
function deltaCaption(pct: number | null, higherIsBetter = true): { caption: string; tone: "good" | "bad" | "warn" } {
  if (pct === null) return { caption: "sin histórico suficiente", tone: "warn" };
  const sign = pct > 0 ? "+" : "";
  const improving = higherIsBetter ? pct >= 0 : pct < 0;
  return { caption: `${sign}${pct.toFixed(1)}% vs periodo previo`, tone: improving ? "good" : "bad" };
}

export function App() {
  const { t } = useI18n();
  const [mode, setMode] = useState<OperationMode>("assisted");
  const [section, setSection] = useState<Section>("inicio");
  const [policy, setPolicy] = useState(defaultPolicy);

  const billing = useBilling();
  const metaState = useMetaConnection();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const liveCampaigns = useCampaigns({ enabled: Boolean(metaState.activeConnection) });
  const campaigns = liveCampaigns.campaigns.length > 0 ? liveCampaigns.campaigns : mockCampaigns;
  const usingLiveData = liveCampaigns.campaigns.length > 0;
  const accounts = metaState.activeConnection?.accounts ?? [];
  const trendFallback = useMemo(() => accountTrend.map((t) => ({ ...t, results: t.conversions })), []);
  const { trend } = useAccountTrend({ enabled: Boolean(metaState.activeConnection), fallback: trendFallback });

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

  const dSpend = useMemo(() => deltaCaption(periodDelta(trend, "spend", "sum")), [trend]);
  const dResults = useMemo(() => deltaCaption(periodDelta(trend, "results", "sum")), [trend]);
  const dCpa = useMemo(() => deltaCaption(periodDelta(trend, "cpa", "avg"), false), [trend]);
  const dRoas = useMemo(() => deltaCaption(periodDelta(trend, "roas", "avg")), [trend]);

  // Subscription gate: block the app behind the paywall when there's no active
  // access (superadmins and orgs with an active subscription pass through).
  if (billing.blocked) {
    return (
      <div className="paywall-screen">
        <PlansPaywall billing={billing} />
      </div>
    );
  }

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
          <span>{t("common.connectedAccount")}</span>
          {metaState.activeConnection?.accounts[0] ? (
            <>
              <strong>{metaState.activeConnection.accounts[0].name}</strong>
              <small>ID: {metaState.activeConnection.accounts[0].metaAccountId}</small>
              <em>Meta Ads · {metaState.activeConnection.accounts.length}</em>
            </>
          ) : (
            <>
              <strong>{t("common.noConnection")}</strong>
              <small>Pulse demo</small>
              <em>{t("common.connectMeta")}</em>
            </>
          )}
        </div>

        <nav className="nav-list">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
                <Icon size={18} />
                <span>{t(`nav.${item.id}`)}</span>
              </button>
            );
          })}
        </nav>

        <ModeControl mode={mode} onModeChange={setMode} policy={policy} onPolicyChange={setPolicy} />
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{metaState.activeConnection?.accounts[0]?.name ? `${t("topbar.greeting")}, ${metaState.activeConnection.accounts[0].name}` : t("topbar.summary")}</h1>
            <p>{t("topbar.subtitle")}</p>
          </div>
          <div className="topbar-actions">
            {accounts.length > 0 && (
              <label className="account-switcher" title={t("topbar.account")}>
                <span>{t("topbar.account")}</span>
                <select
                  className="pulse-select"
                  value={selectedAccountId ?? accounts[0]?.id ?? ""}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} · {acc.metaAccountId}</option>
                  ))}
                </select>
              </label>
            )}
            <NotificationsButton />
            <button className="ghost-button">
              <CalendarDays size={16} />
              {t("topbar.last7")}
            </button>
            <button className="ghost-button" onClick={() => setSection("auditoria")}>
              <ShieldCheck size={16} />
              {t("topbar.audit")}
            </button>
            <button className="primary-button" onClick={() => void metaState.startConnect()} title={t("topbar.connect")}>
              <Plus size={17} />
              {t("topbar.connect")}
            </button>
          </div>
        </header>

        <section className="metric-grid">
          <Metric icon={BarChart3} label={t("metrics.spend")} value={money(spend)} change={dSpend.caption} tone={dSpend.tone} />
          <Metric icon={Target} label={t("metrics.results")} value={results.toLocaleString("en-US")} change={dResults.caption} tone={dResults.tone} />
          <Metric icon={AlertTriangle} label={t("metrics.cpa")} value={money(avgCpa)} change={dCpa.caption} tone={dCpa.tone} />
          <Metric icon={Sparkles} label={t("metrics.roas")} value={`${avgRoas}x`} change={dRoas.caption} tone={dRoas.tone} />
          <Metric icon={Layers3} label={t("metrics.ctrcpm")} value={`${avgCtr}% / $${avgCpm}`} change={t("metrics.accountAvg")} tone="warn" />
          <Metric icon={Megaphone} label={t("metrics.activeCampaigns")} value={String(campaigns.filter((c) => c.status === "active").length)} change={`${plan.alerts.length} ${t("metrics.activeCampaigns").toLowerCase()}`} tone="warn" />
        </section>

        {section === "inicio" && (
          <div className="dashboard-grid">
            <MetaConnectionPanel state={metaState} />
            <OnboardingChecklist
              metaState={metaState}
              hasCampaigns={usingLiveData}
              onConnect={() => void metaState.startConnect()}
              onSync={() => void metaState.syncNow("last_30d")}
              onGoToChat={() => setSection("chat")}
            />
            {!usingLiveData && (
              <p className="muted-banner">
                Mostrando datos demo. Conecta una cuenta de Meta para ver campañas reales.
              </p>
            )}
            <DashboardCharts trend={trend} leads={leads} sales={sales} />
            <AlertsPanel plan={plan} />
            <CampaignTable campaigns={campaigns} compact />
            <AutopilotPanel mode={mode} policy={policy} result={autopilot} onPolicyChange={setPolicy} />
            <ApprovalQueue status="OPEN" allowExecute={mode === "autopilot"} />
            <RecommendationsPanel plan={plan} />
            <ActivityTimeline limit={15} />
          </div>
        )}

        {section === "campanas" && (
          <CampaignManager
            fallback={mockCampaigns}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onConnect={() => void metaState.startConnect()}
          />
        )}
        {section === "autopilot" && (
          <div className="autopilot-layout">
            <AutopilotPanel mode={mode} policy={policy} result={autopilot} onPolicyChange={setPolicy} expanded />
            <LearningPanel />
          </div>
        )}
        {section === "chat" && <ChatPulse mode={mode} />}
        {section === "auditoria" && <AuditPanel audit={audit} campaigns={campaigns} plan={plan} />}
        {section === "reportes" && <ReportsGateway />}
        {section === "perfil" && <ProfilePanel />}
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
      <small className={tone}>{change}</small>
    </article>
  );
}

function AlertsPanel({ plan }: { plan: ReturnType<typeof createOptimizationPlan> }) {
  return (
    <section className="panel alerts-panel">
      <div className="panel-head">
        <h2>Alertas críticas</h2>
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

// Reports moved to the ReportsGateway component (Fase 7).
