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
  account: { metaAccountId: string; name: string; currency: string } | null;
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
    list: (params?: { organizationId?: string; accountId?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.organizationId) q.set("organizationId", params.organizationId);
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.limit) q.set("limit", String(params.limit));
      return request<{ ok: boolean; organizationId: string; count: number; campaigns: CampaignDTO[] }>(
        `/v1/campaigns${q.toString() ? `?${q.toString()}` : ""}`
      );
    }
  },

  ai: {
    config: () => request<{ configured: boolean; model: string }>("/v1/ai/config")
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

export const reports = {
  executivePdf: () => downloadReport("/v1/reports/executive?format=pdf"),
  executiveXlsx: () => downloadReport("/v1/reports/executive?format=xlsx"),
  campaignsCsv: () => downloadReport("/v1/reports/campaigns?format=csv"),
  campaignsXlsx: () => downloadReport("/v1/reports/campaigns?format=xlsx")
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

export interface ChatStreamInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode: "read" | "assisted" | "autopilot";
  organizationId?: string;
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
