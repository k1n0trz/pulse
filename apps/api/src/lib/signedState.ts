import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadEnv } from "./env.js";

// Signs OAuth `state` so the callback cannot be tampered with.
// Payload is JSON, signed with HMAC-SHA256 keyed by JWT_SECRET.
// Format: base64url(payload).base64url(sig)

export interface OAuthStatePayload {
  nonce: string;
  organizationId?: string;
  redirectTo?: string;
  iat: number; // unix seconds
  exp: number; // unix seconds
}

function key(): Buffer {
  return Buffer.from(loadEnv().JWT_SECRET, "utf8");
}

export function signState(payload: Omit<OAuthStatePayload, "nonce" | "iat" | "exp">, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(16).toString("base64url"),
    iat: now,
    exp: now + ttlSeconds
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed state");
  }
  const [body, sig] = parts;
  const expected = createHmac("sha256", key()).update(body!).digest("base64url");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const payload = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("State expired");
  }
  return payload;
}
