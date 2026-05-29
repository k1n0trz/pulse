import { BarChart3, Copy, Edit3, MoreHorizontal, Pause, Play, TrendingUp } from "lucide-react";
import type { Campaign } from "@pulse/shared";

function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
function num(value: number, decimals = 1): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

export function CampaignTable({ campaigns, compact = false }: { campaigns: Campaign[]; compact?: boolean }) {
  const visibleCampaigns = compact ? campaigns.slice(0, 5) : campaigns;

  return (
    <section className={`panel campaign-panel ${compact ? "wide" : "full-view"}`}>
      <div className="panel-head">
        <h2>Rendimiento de campañas</h2>
        <div className="table-tools">
          <input aria-label="Buscar campaña" placeholder="Buscar campaña..." />
          <button>Filtros</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Estado</th>
              <th>Presupuesto</th>
              <th>Gasto</th>
              <th>Resultados</th>
              <th>CPA</th>
              <th>ROAS</th>
              <th>CTR</th>
              <th>CPM</th>
              <th>Frecuencia</th>
              <th>Fase</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleCampaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <strong>{campaign.name}</strong>
                  <span>{campaign.objective}</span>
                </td>
                <td><i className={`dot ${campaign.status}`} />{campaign.status}</td>
                <td>{money(campaign.budget)}<span>Diario</span></td>
                <td>{money(campaign.spend)}</td>
                <td>{campaign.results.toLocaleString("en-US")}</td>
                <td className={campaign.cpa > campaign.budget ? "negative" : ""}>{money(campaign.cpa)}</td>
                <td className={campaign.roas >= 3 ? "positive" : campaign.roas > 0 ? "negative" : ""}>{campaign.roas ? `${num(campaign.roas, 2)}x` : "-"}</td>
                <td>{num(campaign.ctr, 2)}%</td>
                <td>{money(campaign.cpm)}</td>
                <td>{num(campaign.frequency, 2)}</td>
                <td><span className={`phase ${campaign.phase}`}>{campaign.phase}</span></td>
                <td>
                  <div className="action-icons">
                    <button title="Analizar"><BarChart3 size={15} /></button>
                    <button title="Editar"><Edit3 size={15} /></button>
                    <button title="Duplicar"><Copy size={15} /></button>
                    <button title={campaign.status === "paused" ? "Activar" : "Pausar"}>{campaign.status === "paused" ? <Play size={15} /> : <Pause size={15} />}</button>
                    <button title="Escalar"><TrendingUp size={15} /></button>
                    <button title="Mas"><MoreHorizontal size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
