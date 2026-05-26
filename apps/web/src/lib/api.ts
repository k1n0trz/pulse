// Minimal typed API client for the Pulse backend.
// All endpoints live under /v1; the backend handles CORS for the Vite dev origins.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
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
  }
};

export { BASE_URL as API_BASE_URL };
