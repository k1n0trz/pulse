import { loadEnv } from "../lib/env.js";
import { encryptString } from "../lib/crypto.js";
import { signState, verifyState, type OAuthStatePayload } from "../lib/signedState.js";
import { buildAuthorizeUrl, exchangeCodeForToken, exchangeForLongLivedToken, debugToken, revokePermissions } from "./graphClient.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import type { Prisma } from "@prisma/client";

export class MetaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaConfigError";
  }
}

function requireMetaConfig() {
  const env = loadEnv();
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_REDIRECT_URI) {
    throw new MetaConfigError(
      "Meta OAuth not configured. Set META_APP_ID, META_APP_SECRET and META_REDIRECT_URI in .env."
    );
  }
  return {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_REDIRECT_URI,
    scopes: env.META_DEFAULT_SCOPES
  };
}

export function buildStartUrl(opts: { organizationId?: string; redirectTo?: string }): { url: string; state: string } {
  const cfg = requireMetaConfig();
  const state = signState({ organizationId: opts.organizationId, redirectTo: opts.redirectTo });
  const url = buildAuthorizeUrl({
    clientId: cfg.appId,
    redirectUri: cfg.redirectUri,
    state,
    scopes: cfg.scopes
  });
  return { url, state };
}

export interface CompleteOAuthResult {
  connectionId: string;
  organizationId: string;
  scopes: string[];
  metaUserId: string;
  expiresAt: Date | null;
  redirectTo?: string;
}

async function appAccessToken(): Promise<string> {
  const cfg = requireMetaConfig();
  return `${cfg.appId}|${cfg.appSecret}`;
}

export async function completeOAuthCallback(input: { code: string; state: string }): Promise<CompleteOAuthResult> {
  const cfg = requireMetaConfig();
  let parsed: OAuthStatePayload;
  try {
    parsed = verifyState(input.state);
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "OAuth state verification failed");
    throw new Error("Invalid OAuth state");
  }

  const shortLived = await exchangeCodeForToken({
    code: input.code,
    clientId: cfg.appId,
    clientSecret: cfg.appSecret,
    redirectUri: cfg.redirectUri
  });

  const longLived = await exchangeForLongLivedToken({
    shortLivedToken: shortLived.access_token,
    clientId: cfg.appId,
    clientSecret: cfg.appSecret
  });

  const appToken = await appAccessToken();
  const debug = await debugToken({ token: longLived.access_token, appAccessToken: appToken });
  if (!debug.data.is_valid) {
    throw new Error("Issued token is not valid per debug_token");
  }

  const metaUserId = debug.data.user_id;
  const scopes = debug.data.scopes ?? [];
  const expiresAt = debug.data.expires_at ? new Date(debug.data.expires_at * 1000) : null;

  // Resolve organization — Phase 1 dev shortcut: if state didn't carry one, use the demo org.
  const organizationId = parsed.organizationId ?? (await resolveDefaultOrgId());

  const scopeTier = inferScopeTier(scopes);

  const connection = await prisma.metaConnection.upsert({
    where: { organizationId_metaUserId: { organizationId, metaUserId } },
    create: {
      organizationId,
      metaUserId,
      scopeTier,
      accessTokenEnc: encryptString(longLived.access_token),
      tokenExpiresAt: expiresAt,
      status: "ACTIVE"
    },
    update: {
      scopeTier,
      accessTokenEnc: encryptString(longLived.access_token),
      tokenExpiresAt: expiresAt,
      status: "ACTIVE"
    }
  });

  await prisma.auditEvent.create({
    data: {
      organizationId,
      type: "meta.connection.created",
      severity: "INFO",
      message: `Meta connection upserted for user ${metaUserId}`,
      metadata: { scopes, expiresAt: expiresAt?.toISOString() } as Prisma.InputJsonValue
    }
  });

  return {
    connectionId: connection.id,
    organizationId,
    metaUserId,
    scopes,
    expiresAt,
    redirectTo: parsed.redirectTo
  };
}

function inferScopeTier(scopes: string[]): "READ" | "READ_WRITE" | "READ_WRITE_FINANCE" {
  if (scopes.includes("ads_management") && (scopes.includes("ads_management_finance") || scopes.includes("read_insights_finance"))) {
    return "READ_WRITE_FINANCE";
  }
  if (scopes.includes("ads_management")) return "READ_WRITE";
  return "READ";
}

async function resolveDefaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) {
    const created = await prisma.organization.create({
      data: { slug: "demo", name: "Demo Organization", plan: "FREE" }
    });
    return created.id;
  }
  return org.id;
}

export async function revokeConnection(connectionId: string): Promise<void> {
  const { decryptString } = await import("../lib/crypto.js");
  const connection = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("Connection not found");
  const token = decryptString(connection.accessTokenEnc);
  try {
    await revokePermissions({ userId: connection.metaUserId, accessToken: token });
  } catch (error) {
    logger.warn({ err: (error as Error).message, connectionId }, "Meta permission revocation failed; marking REVOKED anyway");
  }
  await prisma.metaConnection.update({
    where: { id: connectionId },
    data: { status: "REVOKED", accessTokenEnc: encryptString("") }
  });
  await prisma.auditEvent.create({
    data: {
      organizationId: connection.organizationId,
      type: "meta.connection.revoked",
      severity: "WARN",
      message: `Meta connection ${connectionId} revoked`
    }
  });
}
