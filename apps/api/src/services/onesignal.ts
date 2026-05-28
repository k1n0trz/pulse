// OneSignal REST API client.
//
// Docs: https://documentation.onesignal.com/reference/create-notification
// Auth: REST API Key in `Authorization: Basic <key>` header.
// Endpoint: https://onesignal.com/api/v1/notifications
//
// All calls are lazy — if ONESIGNAL_APP_ID / ONESIGNAL_API_KEY are not set,
// `sendOneSignalNotification` returns { skipped: true } and logs a debug line.
// This keeps notifications wired everywhere in Pulse without coupling to the
// presence of credentials.

import { fetchWithRetry } from "../lib/http.js";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const env = loadEnv();

const API_BASE = "https://onesignal.com/api/v1";

export type OneSignalChannel = "push" | "email" | "sms";

export interface OneSignalSendInput {
  /** Headline. ≤ 100 chars recommended. */
  title: string;
  /** Body. ≤ 200 chars recommended for push. */
  body: string;
  /** Optional click-through URL (web push). */
  url?: string;
  /** When set, target ONLY these external user IDs. Otherwise target by tags or all subscribers. */
  externalUserIds?: string[];
  /** When set, target by OneSignal tags (e.g. { organizationId: "..." }). */
  tagFilters?: Array<{ field: "tag"; key: string; relation: "="; value: string }>;
  /** Which channels to use. Default: ["push"]. Include "email" for email blast. */
  channels?: OneSignalChannel[];
  /** Custom data attached to the notification (read by client). */
  data?: Record<string, unknown>;
  /** Email subject (overrides title when channel is email). */
  emailSubject?: string;
  /** HTML body for email (otherwise we use the body field). */
  emailHtml?: string;
}

export interface OneSignalSendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  notificationId?: string;
  recipients?: number;
  errors?: unknown;
}

export function isOneSignalConfigured(): boolean {
  return Boolean(env.ONESIGNAL_APP_ID && env.ONESIGNAL_API_KEY);
}

interface OneSignalApiPayload {
  app_id: string;
  headings: { en: string };
  contents: { en: string };
  url?: string;
  web_url?: string;
  include_aliases?: { external_id: string[] };
  filters?: Array<Record<string, string>>;
  data?: Record<string, unknown>;
  email_subject?: string;
  email_body?: string;
  target_channel?: "push" | "email" | "sms";
  isAnyWeb?: boolean;
}

function buildPayloads(input: OneSignalSendInput): OneSignalApiPayload[] {
  const channels = input.channels ?? ["push"];
  const base: Omit<OneSignalApiPayload, "target_channel"> = {
    app_id: env.ONESIGNAL_APP_ID!,
    headings: { en: input.title },
    contents: { en: input.body },
    ...(input.url ? { url: input.url, web_url: input.url } : {}),
    ...(input.data ? { data: input.data } : {}),
    ...(input.externalUserIds && input.externalUserIds.length > 0
      ? { include_aliases: { external_id: input.externalUserIds } }
      : {}),
    ...(input.tagFilters && input.tagFilters.length > 0 ? { filters: input.tagFilters } : {})
  };

  const payloads: OneSignalApiPayload[] = [];

  if (channels.includes("push")) {
    payloads.push({ ...base, isAnyWeb: true });
  }
  if (channels.includes("email")) {
    payloads.push({
      ...base,
      target_channel: "email",
      email_subject: input.emailSubject ?? input.title,
      email_body: input.emailHtml ?? `<p>${escapeHtml(input.body)}</p>`
    });
  }
  if (channels.includes("sms")) {
    payloads.push({ ...base, target_channel: "sms" });
  }

  return payloads;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendOneSignalNotification(input: OneSignalSendInput): Promise<OneSignalSendResult> {
  if (!isOneSignalConfigured()) {
    logger.debug({ title: input.title }, "[onesignal] skipped — ONESIGNAL_APP_ID/API_KEY not configured");
    return { ok: true, skipped: true, reason: "not_configured" };
  }

  const payloads = buildPayloads(input);
  if (payloads.length === 0) {
    return { ok: false, reason: "no_channels" };
  }

  let firstId: string | undefined;
  let totalRecipients = 0;
  const errors: unknown[] = [];

  for (const payload of payloads) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Accept: "application/json",
          Authorization: `Basic ${env.ONESIGNAL_API_KEY}`
        },
        body: JSON.stringify(payload),
        timeoutMs: 15_000
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        recipients?: number;
        errors?: unknown;
      };
      if (!response.ok || body.errors) {
        logger.warn({ status: response.status, errors: body.errors, channel: payload.target_channel ?? "push" }, "[onesignal] send failed");
        errors.push(body.errors ?? `HTTP ${response.status}`);
        continue;
      }
      if (!firstId && body.id) firstId = body.id;
      if (typeof body.recipients === "number") totalRecipients += body.recipients;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "[onesignal] network error");
      errors.push((error as Error).message);
    }
  }

  if (errors.length === payloads.length) {
    return { ok: false, errors };
  }
  return { ok: true, notificationId: firstId, recipients: totalRecipients, ...(errors.length ? { errors } : {}) };
}
