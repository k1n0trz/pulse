// Core domain types shared between web (UI) and api (backend).
// These remain the source of truth for runtime contracts; Prisma owns DB-side modeling.

export type OperationMode = "read" | "assisted" | "autopilot";

export type CampaignStatus = "active" | "paused" | "limited";
export type CampaignPhase = "learning" | "active" | "fatigued" | "winner" | "loser";
export type Severity = "low" | "medium" | "high" | "critical";

export type RecommendationType =
  | "scale_budget"
  | "reduce_budget"
  | "pause_ad"
  | "duplicate_winner"
  | "rotate_creative"
  | "expand_audience"
  | "simplify_structure"
  | "consolidate_budget"
  | "review_landing"
  | "audit_tracking";

export type CampaignObjective = "Ventas" | "Leads" | "Trafico" | "Interaccion" | "Mensajes";

export interface DailyMetric {
  date: string;
  spend: number;
  results: number;
  cpa: number;
  roas: number;
  ctr: number;
  cpm: number;
  conversions: number;
  frequency: number;
}

export interface Campaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget: number;
  spend: number;
  results: number;
  cpa: number;
  roas: number;
  ctr: number;
  cpm: number;
  frequency: number;
  phase: CampaignPhase;
  critical: boolean;
  learningLimited?: boolean;
  metrics: DailyMetric[];
}

export interface AutopilotPolicy {
  targetCpa: number;
  targetRoas: number;
  maxDailyBudgetIncreasePercent: number;
  maxDailySpend: number;
  maxDailyChanges: number;
  killSwitch: boolean;
  blockedCriticalCampaigns: boolean;
}

export interface PulseRecommendation {
  id: string;
  campaignId: string;
  type: RecommendationType;
  title: string;
  description: string;
  severity: Severity;
  expectedImpact: string;
  budgetDeltaPercent?: number;
  requiresApproval: boolean;
  rule: string;
}

export interface PulseAlert {
  id: string;
  campaignId: string;
  severity: Severity;
  rule: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface OptimizationPlan {
  alerts: PulseAlert[];
  recommendations: PulseRecommendation[];
  accountScore: number;
  summary: string;
}

export interface ExecutedAction {
  id: string;
  recommendationId: string;
  campaignId: string;
  type: RecommendationType;
  executedAt: string;
  mode: OperationMode;
  dryRun: boolean;
  payload: Record<string, unknown>;
}

export interface LearningDecisionInput {
  rule: string;
  before: Pick<DailyMetric, "cpa" | "roas" | "ctr">;
  after: Pick<DailyMetric, "cpa" | "roas" | "ctr">;
  hoursElapsed: number;
}

export interface DecisionImpact {
  id: string;
  rule: string;
  action: RecommendationType | string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  evaluatedAt: string;
}

export type AuditDimension = "structure" | "tracking" | "creative" | "budget" | "audience";

export interface PulseAuditResult {
  score: number;
  structure: number;
  tracking: number;
  creative: number;
  budget: number;
  audience: number;
  findings: string[];
}
