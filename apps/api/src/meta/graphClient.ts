import { fetchWithRetry } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();
const GRAPH_BASE = `https://graph.facebook.com/${env.META_API_VERSION}`;
const OAUTH_BASE = "https://www.facebook.com";

export class MetaApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;
  readonly raw: unknown;

  constructor(message: string, opts: { status: number; code?: number; subcode?: number; fbtraceId?: string; raw?: unknown }) {
    super(message);
    this.name = "MetaApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.subcode = opts.subcode;
    this.fbtraceId = opts.fbtraceId;
    this.raw = opts.raw;
  }

  /** True when Meta tells us we hit a rate / business-use-case limit. */
  get isRateLimited(): boolean {
    // 4 = throttling, 17 = user-level rate, 32 = page-level rate, 613 = call rate limit
    return this.status === 429 || this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613;
  }

  /** True when the access token is invalid/expired and needs refresh or re-auth. */
  get isAuthError(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 102;
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface GraphRequestInit {
  accessToken: string;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: Record<string, unknown>;
  method?: "GET" | "POST" | "DELETE";
  appsecretProofSecret?: string;
}

import { createHmac } from "node:crypto";

function appsecretProof(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function buildUrl(path: string, query: GraphRequestInit["query"], token: string, secret?: string): string {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
  }
  url.searchParams.set("access_token", token);
  if (secret) {
    url.searchParams.set("appsecret_proof", appsecretProof(token, secret));
  }
  return url.toString();
}

export async function graphRequest<T>(path: string, init: GraphRequestInit): Promise<T> {
  const { accessToken, query, body, method = "GET", appsecretProofSecret } = init;
  const url = buildUrl(path, query, accessToken, appsecretProofSecret);

  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: string | undefined;
  if (body && method !== "GET") {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const startedAt = Date.now();
  const response = await fetchWithRetry(url, { method, headers, body: payload });
  const elapsed = Date.now() - startedAt;
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const errBody = parsed as GraphErrorBody;
    const err = errBody?.error ?? {};
    const apiError = new MetaApiError(err.message ?? `Meta API ${response.status}`, {
      status: response.status,
      code: err.code,
      subcode: err.error_subcode,
      fbtraceId: err.fbtrace_id,
      raw: parsed
    });
    logger.warn(
      { path, status: response.status, code: err.code, subcode: err.error_subcode, fbtrace: err.fbtrace_id, elapsed },
      "Meta Graph API error"
    );
    throw apiError;
  }

  logger.debug({ path, elapsed }, "Meta Graph API ok");
  return parsed as T;
}

export interface PagedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
}

export async function graphPaginate<T>(
  path: string,
  init: GraphRequestInit,
  opts: { limit?: number; maxPages?: number } = {}
): Promise<T[]> {
  const limit = opts.limit ?? 200;
  const maxPages = opts.maxPages ?? 50;
  const out: T[] = [];

  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const query: Record<string, string | number> = { ...(init.query as Record<string, string | number>), limit };
    if (cursor) query.after = cursor;
    const response = await graphRequest<PagedResponse<T>>(path, { ...init, query });
    out.push(...response.data);
    cursor = response.paging?.cursors?.after;
    if (!cursor || !response.paging?.next) break;
  }
  return out;
}

// ---------- OAuth helpers ----------

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface DebugTokenResponse {
  data: {
    app_id: string;
    type: string;
    application: string;
    expires_at: number;
    is_valid: boolean;
    issued_at?: number;
    scopes: string[];
    user_id: string;
  };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
  configId?: string;
}): string {
  const url = new URL(`${OAUTH_BASE}/${env.META_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", opts.scopes.join(","));
  if (opts.configId) url.searchParams.set("config_id", opts.configId);
  return url.toString();
}

export async function exchangeCodeForToken(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuthTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("client_secret", opts.clientSecret);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code", opts.code);

  const response = await fetchWithRetry(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  const data = (await response.json()) as OAuthTokenResponse | GraphErrorBody;
  if (!response.ok || !("access_token" in data)) {
    const err = (data as GraphErrorBody).error ?? {};
    throw new MetaApiError(err.message ?? "Token exchange failed", {
      status: response.status,
      code: err.code,
      subcode: err.error_subcode,
      fbtraceId: err.fbtrace_id,
      raw: data
    });
  }
  return data;
}

export async function exchangeForLongLivedToken(opts: {
  shortLivedToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<OAuthTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("client_secret", opts.clientSecret);
  url.searchParams.set("fb_exchange_token", opts.shortLivedToken);

  const response = await fetchWithRetry(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  const data = (await response.json()) as OAuthTokenResponse | GraphErrorBody;
  if (!response.ok || !("access_token" in data)) {
    const err = (data as GraphErrorBody).error ?? {};
    throw new MetaApiError(err.message ?? "Long-lived token exchange failed", {
      status: response.status,
      code: err.code,
      subcode: err.error_subcode,
      fbtraceId: err.fbtrace_id,
      raw: data
    });
  }
  return data;
}

export async function debugToken(opts: { token: string; appAccessToken: string }): Promise<DebugTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", opts.token);
  url.searchParams.set("access_token", opts.appAccessToken);
  const response = await fetchWithRetry(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok) {
    throw new MetaApiError("debug_token failed", { status: response.status, raw: data });
  }
  return data as DebugTokenResponse;
}

export async function revokePermissions(opts: { userId: string; accessToken: string }): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/${opts.userId}/permissions`);
  url.searchParams.set("access_token", opts.accessToken);
  const response = await fetchWithRetry(url.toString(), { method: "DELETE", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as GraphErrorBody;
    const err = data.error ?? {};
    throw new MetaApiError(err.message ?? "Failed to revoke permissions", {
      status: response.status,
      code: err.code,
      raw: data
    });
  }
}
