// Ad entity writes (Fase 4) — create/update campaigns, ad sets and ads through
// the Marketing API connector. Requires an ACTIVE Meta connection; otherwise a
// typed 409 is thrown so the UI can prompt the user to connect an ad account.
//
// Every write is recorded as an AuditEvent. Campaign creates also upsert a local
// CampaignSnapshot so the campaigns list reflects the new entity immediately
// (the nightly sync reconciles the rest).

import type { Prisma } from "@prisma/client";
import { META_TOOLS, type MetaToolName } from "@pulse/shared";
import { prisma } from "../db/prisma.js";
import { decryptString } from "../lib/crypto.js";
import { loadEnv } from "../lib/env.js";
import { MarketingApiConnector } from "./connectors/marketingApi.js";

const env = loadEnv();

export class MetaNotConnectedError extends Error {
  statusCode = 409;
  code = "meta_not_connected";
  constructor() {
    super("Conecta una cuenta de Meta para crear o gestionar campañas.");
    this.name = "MetaNotConnectedError";
  }
}

async function connectorForOrg(organizationId: string): Promise<MarketingApiConnector> {
  const connection = await prisma.metaConnection.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" }
  });
  if (!connection) throw new MetaNotConnectedError();
  return new MarketingApiConnector({
    accessToken: decryptString(connection.accessTokenEnc),
    appSecret: env.META_APP_SECRET
  });
}

/** Resolves our internal ad-account row to its Meta act_… id. */
async function resolveAccount(organizationId: string, accountDbId: string) {
  const account = await prisma.metaAdAccount.findFirst({ where: { id: accountDbId, organizationId } });
  if (!account) throw new Error("Cuenta publicitaria no encontrada.");
  return account;
}

async function invoke<T = unknown>(
  organizationId: string,
  tool: MetaToolName,
  args: Record<string, unknown>
): Promise<T> {
  const connector = await connectorForOrg(organizationId);
  const result = await connector.invoke<T>({ tool, args });
  if (!result.ok) throw new Error(result.message);
  return result.data as T;
}

async function audit(organizationId: string, userId: string | undefined, type: string, message: string, metadata: Record<string, unknown>) {
  await prisma.auditEvent.create({
    data: { organizationId, userId: userId ?? null, type, severity: "INFO", message, metadata: metadata as Prisma.InputJsonValue }
  });
}

export interface CreateCampaignInput {
  organizationId: string;
  userId?: string;
  accountDbId: string;
  name: string;
  objective: string;
  status?: "PAUSED" | "ACTIVE";
  /** Daily budget in the account currency's MAJOR units (e.g. dollars); converted to cents for Meta. */
  dailyBudget?: number;
  specialAdCategories?: string[];
}

export async function createCampaign(input: CreateCampaignInput): Promise<{ id: string }> {
  const account = await resolveAccount(input.organizationId, input.accountDbId);
  const dailyBudgetCents = input.dailyBudget != null ? Math.round(input.dailyBudget * 100) : undefined;

  const created = await invoke<{ id: string }>(input.organizationId, META_TOOLS.CREATE_CAMPAIGN, {
    accountId: account.metaAccountId,
    name: input.name,
    objective: input.objective,
    status: input.status ?? "PAUSED",
    specialAdCategories: input.specialAdCategories ?? [],
    ...(dailyBudgetCents != null ? { dailyBudget: dailyBudgetCents } : {})
  });

  const now = new Date();
  await prisma.campaignSnapshot.upsert({
    where: { accountId_metaCampaignId_windowStart_windowEnd: { accountId: account.id, metaCampaignId: created.id, windowStart: now, windowEnd: now } },
    create: {
      organizationId: input.organizationId,
      accountId: account.id,
      metaCampaignId: created.id,
      name: input.name,
      objective: input.objective,
      status: input.status ?? "PAUSED",
      effectiveStatus: input.status ?? "PAUSED",
      dailyBudget: input.dailyBudget ?? null,
      windowStart: now,
      windowEnd: now
    },
    update: { name: input.name, status: input.status ?? "PAUSED" }
  });

  await audit(input.organizationId, input.userId, "meta.campaign.created", `Campaña creada: ${input.name}`, { metaCampaignId: created.id, accountId: account.metaAccountId });
  return created;
}

export interface UpdateCampaignInput {
  organizationId: string;
  userId?: string;
  campaignDbId: string;
  name?: string;
  dailyBudget?: number; // major units
  status?: "PAUSED" | "ACTIVE";
}

export async function updateCampaign(input: UpdateCampaignInput): Promise<{ ok: true }> {
  const snapshot = await prisma.campaignSnapshot.findFirst({
    where: { id: input.campaignDbId, organizationId: input.organizationId }
  });
  if (!snapshot) throw new Error("Campaña no encontrada.");

  const fields: Record<string, unknown> = {};
  if (input.name != null) fields.name = input.name;
  if (input.status != null) fields.status = input.status;
  if (input.dailyBudget != null) fields.daily_budget = Math.round(input.dailyBudget * 100);

  if (Object.keys(fields).length > 0) {
    await invoke(input.organizationId, META_TOOLS.UPDATE_ENTITY, { id: snapshot.metaCampaignId, fields });
  }

  await prisma.campaignSnapshot.update({
    where: { id: snapshot.id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.status != null ? { status: input.status, effectiveStatus: input.status } : {}),
      ...(input.dailyBudget != null ? { dailyBudget: input.dailyBudget } : {})
    }
  });

  await audit(input.organizationId, input.userId, "meta.campaign.updated", `Campaña actualizada: ${snapshot.name}`, { metaCampaignId: snapshot.metaCampaignId, fields });
  return { ok: true };
}

export interface CreateAdSetInput {
  organizationId: string;
  userId?: string;
  accountDbId: string;
  campaignId: string; // meta campaign id
  name: string;
  dailyBudget?: number; // major units
  billingEvent?: string;
  optimizationGoal?: string;
  targeting?: Record<string, unknown>;
  status?: "PAUSED" | "ACTIVE";
}

export async function createAdSet(input: CreateAdSetInput): Promise<{ id: string }> {
  const account = await resolveAccount(input.organizationId, input.accountDbId);
  const created = await invoke<{ id: string }>(input.organizationId, META_TOOLS.CREATE_AD_SET, {
    accountId: account.metaAccountId,
    campaignId: input.campaignId,
    name: input.name,
    status: input.status ?? "PAUSED",
    ...(input.dailyBudget != null ? { dailyBudget: Math.round(input.dailyBudget * 100) } : {}),
    ...(input.billingEvent ? { billingEvent: input.billingEvent } : {}),
    ...(input.optimizationGoal ? { optimizationGoal: input.optimizationGoal } : {}),
    ...(input.targeting ? { targeting: input.targeting } : {})
  });
  await audit(input.organizationId, input.userId, "meta.adset.created", `Conjunto creado: ${input.name}`, { metaAdSetId: created.id, campaignId: input.campaignId });
  return created;
}

export interface CreateAdInput {
  organizationId: string;
  userId?: string;
  accountDbId: string;
  adsetId: string;
  name: string;
  creativeId?: string;
  status?: "PAUSED" | "ACTIVE";
}

export async function createAd(input: CreateAdInput): Promise<{ id: string }> {
  const account = await resolveAccount(input.organizationId, input.accountDbId);
  const created = await invoke<{ id: string }>(input.organizationId, META_TOOLS.CREATE_AD, {
    accountId: account.metaAccountId,
    adsetId: input.adsetId,
    name: input.name,
    status: input.status ?? "PAUSED",
    ...(input.creativeId ? { creativeId: input.creativeId } : {})
  });
  await audit(input.organizationId, input.userId, "meta.ad.created", `Anuncio creado: ${input.name}`, { metaAdId: created.id, adsetId: input.adsetId });
  return created;
}
