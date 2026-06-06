// Minimal typed API client for the Pulse backend.
// All endpoints live under /v1; the backend handles CORS for the Vite dev origins.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

// Auth token getter — set by the Clerk gate when configured. In demo mode it
// stays null and the backend resolves the demo org.
let authTokenGetter: (() => Promise<string | null>) | null = null;
export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null) {
  authTokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!authTokenGetter) return {};
  try {
    const token = await authTokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (body as { message?: string; error?: string } | null)?.message ?? response.statusText;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

export interface MetaOAuthConfig {
  configured: boolean;
  apiVersion: string;
  redirectUri: string | null;
  defaultScopes: string[];
}

export interface MetaConnectionDTO {
  id: string;
  metaUserId: string;
  scopeTier: "READ" | "READ_WRITE" | "READ_WRITE_FINANCE";
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR";
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  accounts: Array<{
    id: string;
    metaAccountId: string;
    name: string;
    currency: string;
    timezoneName: string;
    status: string;
    enabled: boolean;
    lastSyncAt: string | null;
  }>;
}

export interface CampaignDTO {
  id: string;
  metaCampaignId: string;
  name: string;
  objective: string;
  status: string;
  effectiveStatus: string | null;
  budget: number;
  spend: number;
  results: number;
  cpa: number | null;
  roas: number | null;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
  phase: string | null;
  critical: boolean;
  learningLimited: boolean;
  windowStart: string;
  windowEnd: string;
  capturedAt: string;
  account: { id: string; metaAccountId: string; name: string; currency: string } | null;
}

export interface CampaignListParams {
  organizationId?: string;
  accountId?: string;
  status?: string;
  objective?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
}

export interface CampaignListResponse {
  ok: boolean;
  organizationId: string;
  count: number;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  campaigns: CampaignDTO[];
}

export interface CreateCampaignBody {
  accountId: string;
  name: string;
  objective: string;
  status?: "PAUSED" | "ACTIVE";
  dailyBudget?: number;
  specialAdCategories?: string[];
}

export interface CreateAdSetBody {
  accountId: string;
  campaignId: string;
  name: string;
  dailyBudget?: number;
  billingEvent?: string;
  optimizationGoal?: string;
  targeting?: Record<string, unknown>;
  status?: "PAUSED" | "ACTIVE";
}

export interface CreateAdBody {
  accountId: string;
  adsetId: string;
  name: string;
  creativeId?: string;
  status?: "PAUSED" | "ACTIVE";
}

export const api = {
  health: () => request<{ ok: boolean; service: string; version: string }>("/health"),

  meta: {
    config: () => request<MetaOAuthConfig>("/v1/meta/oauth/config"),
    startUrl: (params?: { organizationId?: string; redirectTo?: string }) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.redirectTo) q.set("redirectTo", params.redirectTo);
      return request<{ ok: boolean; url: string; state: string }>(`/v1/meta/oauth/start?${q.toString()}`);
    }
  },

  connections: {
    list: (organizationId?: string) => {
      const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
      return request<{ ok: boolean; organizationId: string; connections: MetaConnectionDTO[] }>(`/v1/connections${q}`);
    },
    revoke: (id: string) => request<{ ok: boolean }>(`/v1/connections/${id}`, { method: "DELETE" }),
    sync: (id: string, datePreset?: "last_7d" | "last_14d" | "last_30d" | "last_90d") =>
      request<{ ok: boolean; result: { campaigns: number; metrics: number } }>(`/v1/connections/${id}/sync`, {
        method: "POST",
        body: JSON.stringify(datePreset ? { datePreset } : {})
      })
  },

  campaigns: {
    list: (params?: CampaignListParams) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.status) q.set("status", params.status);
      if (params?.objective) q.set("objective", params.objective);
      if (params?.q) q.set("q", params.q);
      if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
      if (params?.dateTo) q.set("dateTo", params.dateTo);
      if (params?.page) q.set("page", String(params.page));
      if (params?.pageSize) q.set("pageSize", String(params.pageSize));
      if (params?.limit) q.set("limit", String(params.limit));
      return request<CampaignListResponse>(`/v1/campaigns${q.toString() ? `?${q.toString()}` : ""}`);
    },
    create: (body: CreateCampaignBody) =>
      request<{ ok: boolean; id: string }>("/v1/campaigns", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; dailyBudget?: number; status?: "PAUSED" | "ACTIVE" }) =>
      request<{ ok: boolean }>(`/v1/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    setStatus: (id: string, status: "PAUSED" | "ACTIVE") =>
      request<{ ok: boolean }>(`/v1/campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    createAdSet: (body: CreateAdSetBody) =>
      request<{ ok: boolean; id: string }>("/v1/ad-sets", { method: "POST", body: JSON.stringify(body) }),
    createAd: (body: CreateAdBody) =>
      request<{ ok: boolean; id: string }>("/v1/ads", { method: "POST", body: JSON.stringify(body) })
  },

  ai: {
    config: () => request<{ configured: boolean; model: string }>("/v1/ai/config")
  },

  insights: {
    trend: (days = 30) => request<{ ok: boolean; trend: TrendPoint[] }>(`/v1/insights/trend?days=${days}`)
  },

  entitlements: {
    get: () => request<EntitlementsDTO>("/v1/entitlements")
  },

  billing: {
    config: () => request<BillingConfigDTO>("/v1/billing/config"),
    status: () => request<BillingStatusDTO>("/v1/billing/status"),
    checkout: (tier: PlanTier) => request<{ ok: boolean; url: string }>("/v1/billing/checkout", { method: "POST", body: JSON.stringify({ tier }) }),
    mercadopagoCheckout: (tier: PlanTier) => request<{ ok: boolean; url: string; preferenceId: string }>("/v1/billing/mercadopago/checkout", { method: "POST", body: JSON.stringify({ tier }) }),
    portal: () => request<{ ok: boolean; url: string }>("/v1/billing/portal", { method: "POST", body: "{}" })
  },

  recommendations: {
    list: (params?: { organizationId?: string; status?: "OPEN" | "APPROVED" | "REJECTED" | "EXECUTED" | "EXPIRED"; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.status) q.set("status", params.status);
      if (params?.severity) q.set("severity", params.severity);
      if (params?.limit) q.set("limit", String(params.limit));
      return request<{ ok: boolean; count: number; recommendations: RecommendationDTO[] }>(
        `/v1/recommendations${q.toString() ? `?${q.toString()}` : ""}`
      );
    },
    approve: (id: string, opts: { execute?: boolean; notes?: string } = {}) =>
      request<{ ok: boolean; decisionId: string; executed: boolean }>(`/v1/recommendations/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(opts)
      }),
    reject: (id: string, opts: { notes?: string } = {}) =>
      request<{ ok: boolean; decisionId: string }>(`/v1/recommendations/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(opts)
      })
  },

  audit: {
    list: (params?: { organizationId?: string; type?: string; severity?: "INFO" | "WARN" | "ERROR" | "CRITICAL"; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.type) q.set("type", params.type);
      if (params?.severity) q.set("severity", params.severity);
      if (params?.limit) q.set("limit", String(params.limit));
      return request<{ ok: boolean; count: number; events: AuditEventDTO[] }>(
        `/v1/audit-events${q.toString() ? `?${q.toString()}` : ""}`
      );
    }
  },

  notifications: {
    config: () => request<{ onesignal: { configured: boolean; appId: string | null } }>("/v1/notifications/config"),
    list: (params?: { organizationId?: string; unreadOnly?: boolean; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.unreadOnly) q.set("unreadOnly", "true");
      if (params?.limit) q.set("limit", String(params.limit));
      return request<{ ok: boolean; count: number; notifications: NotificationDTO[] }>(
        `/v1/notifications${q.toString() ? `?${q.toString()}` : ""}`
      );
    },
    markRead: (id: string) => request<{ ok: boolean }>(`/v1/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request<{ ok: boolean; updated: number }>("/v1/notifications/read-all", { method: "POST", body: "{}" })
  },

  learning: {
    get: () => request<{ ok: boolean; weights: RuleWeightDTO[] }>("/v1/learning"),
    evaluate: () => request<{ ok: boolean; evaluated: number; windowDays: number; weights: RuleWeightDTO[] }>("/v1/learning/evaluate", { method: "POST", body: "{}" })
  },

  competitive: {
    search: (q: string, country?: string, limit?: number) => {
      const params = new URLSearchParams({ q });
      if (country) params.set("country", country);
      if (limit) params.set("limit", String(limit));
      return request<CompetitiveResultDTO>(`/v1/competitive/ads?${params.toString()}`);
    }
  },

  conversations: {
    list: () => request<{ ok: boolean; conversations: ConversationSummary[] }>("/v1/conversations"),
    create: (title?: string) => request<{ ok: boolean; conversation: ConversationSummary }>("/v1/conversations", { method: "POST", body: JSON.stringify({ title }) }),
    get: (id: string) => request<{ ok: boolean; conversation: ConversationSummary; messages: StoredChatMessage[] }>(`/v1/conversations/${id}`),
    rename: (id: string, title: string) => request<{ ok: boolean }>(`/v1/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    remove: (id: string) => request<{ ok: boolean }>(`/v1/conversations/${id}`, { method: "DELETE" })
  },

  me: {
    get: () => request<{ ok: boolean; user: MeUserDTO; organization: { id: string; slug: string; name: string }; preferences: Array<{ id: string; category: string; channels: string[] }> }>("/v1/me"),
    registerOneSignal: (externalUserId: string) =>
      request<{ ok: boolean; oneSignalExternalId: string }>(`/v1/me/onesignal`, {
        method: "POST",
        body: JSON.stringify({ externalUserId })
      }),
    setPreference: (category: "alert" | "recommendation" | "report" | "system", channels: Array<"IN_APP" | "PUSH" | "EMAIL" | "SMS">) =>
      request<{ ok: boolean }>(`/v1/me/preferences`, {
        method: "POST",
        body: JSON.stringify({ category, channels })
      })
  }
};

export interface MeUserDTO {
  id: string;
  email: string;
  name: string | null;
  oneSignalExternalId: string | null;
  isSuperadmin?: boolean;
}

export type PlanTier = "SOLO" | "AGENCY" | "SCALE";

export interface PlanCatalogEntry {
  tier: string;
  name: string;
  monthlyUsd: number;
  purchasable: boolean;
  limits: { maxAdAccounts: number; maxUsers: number; autopilot: boolean; whiteLabelReports: boolean; apiAccess: boolean };
}

export interface BillingConfigDTO {
  configured: boolean;
  providers: { stripe: boolean; mercadopago: boolean };
  plans: PlanCatalogEntry[];
}

export interface BillingStatusDTO {
  ok: boolean;
  plan: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  paymentProvider: string | null;
  hasCustomer: boolean;
  isSuperadmin: boolean;
  active: boolean;
}

export interface TrendPoint {
  date: string;
  spend: number;
  results: number;
  conversions: number;
  roas: number;
  cpa: number;
}

export interface EntitlementsDTO {
  ok: boolean;
  plan: { tier: string; name: string; monthlyUsd: number; limits: { maxAdAccounts: number; maxUsers: number; autopilot: boolean; whiteLabelReports: boolean; apiAccess: boolean } };
  usage: { adAccounts: number; users: number };
  can: { addAdAccount: boolean; addUser: boolean; useAutopilot: boolean; whiteLabelReports: boolean; apiAccess: boolean };
  superadmin?: boolean;
}

export interface RecommendationDTO {
  id: string;
  organizationId: string;
  campaignId: string | null;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rule: string;
  title: string;
  description: string;
  expectedImpact: string;
  budgetDeltaPercent: number | null;
  requiresApproval: boolean;
  status: "OPEN" | "APPROVED" | "REJECTED" | "EXECUTED" | "EXPIRED";
  createdAt: string;
  resolvedAt: string | null;
  decision: { id: string; outcome: string; decidedAt: string; notes: string | null } | null;
}

export interface AuditEventDTO {
  id: string;
  organizationId: string | null;
  userId: string | null;
  type: string;
  severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  message: string;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  organizationId: string;
  userId: string | null;
  channel: "IN_APP" | "EMAIL" | "SLACK" | "WHATSAPP";
  category: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  sentAt: string | null;
  createdAt: string;
}

// ---------- File downloads ----------

/** Fetches a binary report with auth and triggers a browser download. */
export async function downloadReport(path: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { ...(await authHeaders()) }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || response.statusText, response.status, text);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "pulse-report";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ReportFilters {
  accountIds?: string[];
  businessId?: string;
  campaignIds?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface ReportOptionsDTO {
  ok: boolean;
  portfolios: Array<{ businessId: string; accounts: number }>;
  accounts: Array<{ id: string; name: string; businessId: string | null }>;
  campaigns: Array<{ id: string; name: string; accountId: string }>;
}

function reportQuery(format: string, f?: ReportFilters): string {
  const p = new URLSearchParams({ format });
  if (f?.accountIds?.length) p.set("accountIds", f.accountIds.join(","));
  if (f?.businessId) p.set("businessId", f.businessId);
  if (f?.campaignIds?.length) p.set("campaignIds", f.campaignIds.join(","));
  if (f?.dateFrom) p.set("dateFrom", f.dateFrom);
  if (f?.dateTo) p.set("dateTo", f.dateTo);
  return p.toString();
}

export const reports = {
  options: () => request<ReportOptionsDTO>("/v1/reports/options"),
  executivePdf: (f?: ReportFilters) => downloadReport(`/v1/reports/executive?${reportQuery("pdf", f)}`),
  executiveXlsx: (f?: ReportFilters) => downloadReport(`/v1/reports/executive?${reportQuery("xlsx", f)}`),
  campaignsXlsx: (f?: ReportFilters) => downloadReport(`/v1/reports/campaigns?${reportQuery("xlsx", f)}`)
};

// ---------- Chat streaming ----------

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; toolUseId: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; name: string; ok: boolean; recommendationId?: string }
  | { type: "stop"; reason: string }
  | { type: "error"; message: string }
  | { type: "done"; text: string; toolCalls: Array<{ name: string; ok: boolean; recommendationId?: string }>; usage: { input: number; output: number; cacheRead: number; cacheCreation: number } };

export type ChatAttachment =
  | { kind: "image"; mediaType: string; data: string; name?: string }
  | { kind: "document"; mediaType: string; data: string; name?: string };

export interface ChatStreamInput {
  messages: Array<{ role: "user" | "assistant"; content: string; attachments?: ChatAttachment[] }>;
  mode: "read" | "assisted" | "autopilot";
  organizationId?: string;
  conversationId?: string;
}

export interface RuleWeightDTO {
  rule: string;
  weight: number;
  samples: number;
}

export interface CompetitorAdDTO {
  pageName: string;
  body: string;
  linkTitle: string | null;
  snapshotUrl: string | null;
  platforms: string[];
}

export interface CompetitiveResultDTO {
  ok: boolean;
  source: "live" | "demo";
  query: string;
  country: string;
  ads: CompetitorAdDTO[];
  insights: {
    totalAds: number;
    topAdvertisers: Array<{ pageName: string; ads: number }>;
    platforms: Array<{ platform: string; ads: number }>;
  };
  note?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface StoredAttachmentMeta {
  kind: "image" | "document";
  mediaType: string;
  name: string | null;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: StoredAttachmentMeta[];
  toolEvents: Array<{ name: string; ok: boolean; recommendationId?: string | null }>;
  createdAt: string;
}

export async function streamChat(input: ChatStreamInput, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await authHeaders()) },
    body: JSON.stringify({ ...input, stream: true }),
    signal
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || response.statusText, response.status, text);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        const data = JSON.parse(dataLines.join("\n"));
        if (eventName === "done") {
          onEvent({ type: "done", ...(data as { text: string; toolCalls: Array<{ name: string; ok: boolean; recommendationId?: string }>; usage: { input: number; output: number; cacheRead: number; cacheCreation: number } }) });
        } else {
          onEvent(data as AgentStreamEvent);
        }
      } catch {
        // ignore malformed frames
      }
    }
  }
}

export { BASE_URL as API_BASE_URL };
