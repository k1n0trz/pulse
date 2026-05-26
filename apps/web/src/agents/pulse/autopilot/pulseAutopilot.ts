import { createOptimizationPlan } from "../optimizer/pulseOptimizer";
import type { AutopilotPolicy, Campaign, ExecutedAction, OperationMode, PulseRecommendation } from "@pulse/shared";

export interface RunPulseAutopilotInput {
  campaigns: Campaign[];
  mode: OperationMode;
  policy: AutopilotPolicy;
}

export interface AutopilotRunResult {
  mode: OperationMode;
  executedActions: ExecutedAction[];
  simulatedActions: ExecutedAction[];
  pendingApprovals: PulseRecommendation[];
  blockedReasons: string[];
}

const prohibitedWithoutApproval = new Set(["duplicate_winner", "rotate_creative", "expand_audience", "simplify_structure", "consolidate_budget", "review_landing", "audit_tracking"]);

function toAction(recommendation: PulseRecommendation, mode: OperationMode, dryRun: boolean): ExecutedAction {
  return {
    id: `act_${recommendation.id}_${Date.now()}`,
    recommendationId: recommendation.id,
    campaignId: recommendation.campaignId,
    type: recommendation.type,
    executedAt: new Date().toISOString(),
    mode,
    dryRun,
    payload: {
      budgetDeltaPercent: recommendation.budgetDeltaPercent,
      rule: recommendation.rule,
      title: recommendation.title
    }
  };
}

function isExecutable(recommendation: PulseRecommendation, policy: AutopilotPolicy, campaigns: Campaign[], blockedReasons: string[]) {
  const campaign = campaigns.find((item) => item.id === recommendation.campaignId);

  if (recommendation.requiresApproval || prohibitedWithoutApproval.has(recommendation.type)) {
    return false;
  }

  if (campaign?.critical && policy.blockedCriticalCampaigns) {
    blockedReasons.push(`Campana critica bloqueada: ${campaign.name}`);
    return false;
  }

  if ((recommendation.budgetDeltaPercent ?? 0) > policy.maxDailyBudgetIncreasePercent) {
    blockedReasons.push(`Incremento supera limite diario de ${policy.maxDailyBudgetIncreasePercent}%`);
    return false;
  }

  return true;
}

export function runPulseAutopilot({ campaigns, mode, policy }: RunPulseAutopilotInput): AutopilotRunResult {
  const blockedReasons: string[] = [];
  const plan = createOptimizationPlan(campaigns, policy);

  if (mode === "read") {
    return {
      mode,
      executedActions: [],
      simulatedActions: [],
      pendingApprovals: [],
      blockedReasons: ["Modo lectura: analisis sin recomendaciones ejecutables"]
    };
  }

  const simulatedActions = plan.recommendations.map((item) => toAction(item, mode, true));

  if (mode === "assisted") {
    return {
      mode,
      executedActions: [],
      simulatedActions,
      pendingApprovals: plan.recommendations,
      blockedReasons
    };
  }

  if (policy.killSwitch) {
    return {
      mode,
      executedActions: [],
      simulatedActions,
      pendingApprovals: plan.recommendations,
      blockedReasons: ["Kill Switch global activo"]
    };
  }

  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  if (totalSpend > policy.maxDailySpend) {
    return {
      mode,
      executedActions: [],
      simulatedActions,
      pendingApprovals: plan.recommendations,
      blockedReasons: [`Limite de gasto diario alcanzado: $${totalSpend.toLocaleString("en-US")}`]
    };
  }

  const executable = plan.recommendations
    .filter((recommendation) => isExecutable(recommendation, policy, campaigns, blockedReasons))
    .slice(0, policy.maxDailyChanges);

  const executedActions = executable.map((recommendation) => toAction(recommendation, mode, false));
  const executedIds = new Set(executable.map((item) => item.id));

  return {
    mode,
    executedActions,
    simulatedActions,
    pendingApprovals: plan.recommendations.filter((item) => !executedIds.has(item.id)),
    blockedReasons
  };
}
