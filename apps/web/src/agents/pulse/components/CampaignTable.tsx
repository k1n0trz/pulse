import { BarChart3, Copy, Edit3, MoreHorizontal, Pause, Play, TrendingUp } from "lucide-react";
import type { Campaign } from "@pulse/shared";

export function CampaignTable({ campaigns, compact = false }: { campaigns: Campaign[]; compact?: boolean }) {
  const visibleCampaigns = compact ? campaigns.slice(0, 5) : campaigns;

  return (
    <section className={`panel campaign-panel ${compact ? "wide" : "full-view"}`}>
      <div className="panel-head">
        <h2>Rendimiento de campanas</h2>
        <div className="table-tools">
          <input aria-label="Buscar campana" placeholder="Buscar campana..." />
          <button>Filtros</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Campana</th>
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
                <td>${campaign.budget.toLocaleString("en-US")}<span>Diario</span></td>
                <td>${campaign.spend.toLocaleString("en-US")}</td>
                <td>{campaign.results.toLocaleString("en-US")}</td>
                <td className={campaign.cpa > 500 ? "negative" : ""}>${campaign.cpa}</td>
                <td className={campaign.roas >= 3 ? "positive" : "negative"}>{campaign.roas ? `${campaign.roas}x` : "-"}</td>
                <td>{campaign.ctr}%</td>
                <td>${campaign.cpm}</td>
                <td>{campaign.frequency}</td>
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
