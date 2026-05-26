import { logger } from "./logger.js";

export interface FetchWithRetryOptions extends Omit<RequestInit, "signal"> {
  /** Max retries on transient errors. Default: 4 */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default: 250 */
  baseDelayMs?: number;
  /** Cap on backoff delay. Default: 8000 */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms. Default: 20000 */
  timeoutMs?: number;
  /** Override which status codes are considered retryable. Default: 408, 425, 429, 500, 502, 503, 504 */
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function jitter(ms: number): number {
  return Math.round(ms * (0.5 + Math.random()));
}

function backoff(attempt: number, base: number, max: number): number {
  return Math.min(max, jitter(base * 2 ** attempt));
}

// Honor Retry-After header (seconds or HTTP date) when present.
function retryAfterMs(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function fetchWithRetry(url: string, init: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries = 4, baseDelayMs = 250, maxDelayMs = 8000, timeoutMs = 20_000, retryableStatuses, ...rest } = init;
  const retryable = retryableStatuses ? new Set(retryableStatuses) : DEFAULT_RETRYABLE;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...rest, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok || !retryable.has(response.status)) {
        return response;
      }

      if (attempt === retries) return response;

      const wait = retryAfterMs(response.headers) ?? backoff(attempt, baseDelayMs, maxDelayMs);
      logger.warn({ url, attempt, status: response.status, wait }, "Retrying HTTP request");
      await sleep(wait);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt === retries) break;
      const wait = backoff(attempt, baseDelayMs, maxDelayMs);
      logger.warn({ url, attempt, err: (error as Error).message, wait }, "Network error, retrying");
      await sleep(wait);
    }
  }

  throw lastError ?? new Error(`fetchWithRetry exhausted retries for ${url}`);
}
