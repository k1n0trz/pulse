import { useCallback, useEffect, useState } from "react";
import type { Campaign, CampaignObjective, CampaignPhase, CampaignStatus } from "@pulse/shared";
import { api, ApiError, type CampaignDTO } from "../../../lib/api";

interface UseCampaignsResult {
  loading: boolean;
  campaigns: Campaign[];
  error: string | null;
  refresh: () => Promise<void>;
}

const OBJECTIVE_MAP: Record<string, CampaignObjective> = {
  OUTCOME_SALES: "Ventas",
  CONVERSIONS: "Ventas",
  OUTCOME_LEADS: "Leads",
  LEAD_GENERATION: "Leads",
  OUTCOME_TRAFFIC: "Trafico",
  LINK_CLICKS: "Trafico",
  OUTCOME_ENGAGEMENT: "Interaccion",
  POST_ENGAGEMENT: "Interaccion",
  OUTCOME_AWARENESS: "Interaccion",
  MESSAGES: "Mensajes"
};

const STATUS_MAP: Record<string, CampaignStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  DELETED: "paused",
  ARCHIVED: "paused"
};

const PHASE_MAP: Record<string, CampaignPhase> = {
  active: "active",
  learning: "learning",
  fatigued: "fatigued",
  winner: "winner",
  loser: "loser"
};

function toCampaign(dto: CampaignDTO): Campaign {
  return {
    id: dto.id,
    name: dto.name,
    objective: OBJECTIVE_MAP[dto.objective] ?? "Ventas",
    status: STATUS_MAP[dto.status] ?? "active",
    budget: dto.budget ?? 0,
    spend: dto.spend ?? 0,
    results: dto.results ?? 0,
    cpa: dto.cpa ?? 0,
    roas: dto.roas ?? 0,
    ctr: dto.ctr ?? 0,
    cpm: dto.cpm ?? 0,
    frequency: dto.frequency ?? 0,
    phase: dto.phase ? PHASE_MAP[dto.phase] ?? "active" : "active",
    critical: dto.critical,
    learningLimited: dto.learningLimited,
    metrics: []
  };
}

export function useCampaigns(opts: { enabled: boolean }): UseCampaignsResult {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(opts.enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!opts.enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.campaigns.list({ limit: 200 });
      setCampaigns(result.campaigns.map(toCampaign));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [opts.enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, campaigns, error, refresh };
}
