// Notification service — orchestrates persistence + multi-channel delivery via OneSignal.
//
// Layers:
//   1. Persist row in `Notification` (always — in-app feed is the canonical record).
//   2. Resolve which channels the recipient wants based on NotificationPreference.
//   3. If OneSignal is configured, fan out to push/email channels per channel list.
//   4. Stamp the resulting `oneSignalId` + `dispatchedChannels` back on the row.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { isOneSignalConfigured, sendOneSignalNotification, type OneSignalChannel } from "./onesignal.js";

export type NotificationCategory = "alert" | "recommendation" | "report" | "system";

export interface DispatchInput {
  organizationId: string;
  userId?: string | undefined;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string | undefined;
  metadata?: Prisma.InputJsonValue;
  /** Default severity affects whether email is forced regardless of preferences. */
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

const DEFAULT_CHANNELS_BY_SEVERITY: Record<NonNullable<DispatchInput["severity"]>, OneSignalChannel[]> = {
  LOW: ["push"],
  MEDIUM: ["push"],
  HIGH: ["push", "email"],
  CRITICAL: ["push", "email"]
};

async function resolveExternalUserIds(input: { organizationId: string; userId?: string }): Promise<string[]> {
  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { oneSignalExternalId: true }
    });
    return user?.oneSignalExternalId ? [user.oneSignalExternalId] : [];
  }
  // Org-wide: target everyone in the org who has a registered OneSignal identity.
  const members = await prisma.membership.findMany({
    where: { organizationId: input.organizationId },
    include: { user: { select: { oneSignalExternalId: true } } }
  });
  return members
    .map((m) => m.user.oneSignalExternalId)
    .filter((id): id is string => Boolean(id));
}

async function resolvePreferredChannels(userId: string | undefined, category: NotificationCategory, severity?: DispatchInput["severity"]): Promise<OneSignalChannel[]> {
  if (!userId) {
    return DEFAULT_CHANNELS_BY_SEVERITY[severity ?? "MEDIUM"];
  }
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_category: { userId, category } }
  });
  const channels = pref?.channels ?? ["PUSH"];
  const mapped = channels
    .map((c) => c.toLowerCase())
    .filter((c): c is OneSignalChannel => c === "push" || c === "email" || c === "sms");
  if (mapped.length === 0) return DEFAULT_CHANNELS_BY_SEVERITY[severity ?? "MEDIUM"];
  return mapped;
}

export async function dispatchNotification(input: DispatchInput) {
  // 1. Persist canonical in-app record
  const notification = await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      channel: "IN_APP",
      category: input.category,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      sentAt: new Date()
    }
  });

  // 2. Fan out to OneSignal if configured
  if (!isOneSignalConfigured()) {
    logger.debug({ notificationId: notification.id }, "[notifications] in-app only (OneSignal not configured)");
    return notification;
  }

  const externalUserIds = await resolveExternalUserIds({ organizationId: input.organizationId, userId: input.userId });
  if (externalUserIds.length === 0) {
    logger.debug({ notificationId: notification.id, userId: input.userId }, "[notifications] no OneSignal subscribers");
    return notification;
  }

  const channels = await resolvePreferredChannels(input.userId, input.category, input.severity);
  const result = await sendOneSignalNotification({
    title: input.title,
    body: input.body,
    url: input.href ?? undefined,
    externalUserIds,
    channels,
    data: { notificationId: notification.id, category: input.category, ...((input.metadata as Record<string, unknown>) ?? {}) }
  });

  if (result.ok && !result.skipped) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        oneSignalId: result.notificationId ?? null,
        dispatchedChannels: channels.map((c) => c.toUpperCase())
      }
    });
  } else if (!result.ok) {
    logger.warn({ notificationId: notification.id, errors: result.errors }, "[notifications] OneSignal dispatch failed");
  }

  return notification;
}

export async function notifyRecommendationCreated(opts: {
  organizationId: string;
  recommendationId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  expectedImpact: string;
}) {
  return dispatchNotification({
    organizationId: opts.organizationId,
    category: "recommendation",
    severity: opts.severity,
    title: `Nueva recomendación: ${opts.title}`,
    body: opts.expectedImpact,
    href: `/recommendations/${opts.recommendationId}`,
    metadata: { severity: opts.severity, recommendationId: opts.recommendationId } as Prisma.InputJsonValue
  });
}

export async function notifyRecommendationDecision(opts: {
  organizationId: string;
  userId?: string | undefined;
  recommendationId: string;
  outcome: "APPROVED" | "REJECTED" | "AUTO_EXECUTED" | "DEFERRED";
  title: string;
}) {
  const label =
    opts.outcome === "APPROVED" ? "aprobada" :
    opts.outcome === "REJECTED" ? "rechazada" :
    opts.outcome === "AUTO_EXECUTED" ? "ejecutada (autopilot)" : "diferida";
  return dispatchNotification({
    organizationId: opts.organizationId,
    userId: opts.userId,
    category: "recommendation",
    title: `Recomendación ${label}`,
    body: opts.title,
    href: `/recommendations/${opts.recommendationId}`,
    metadata: { outcome: opts.outcome, recommendationId: opts.recommendationId } as Prisma.InputJsonValue
  });
}

export async function notifySyncCompleted(opts: { organizationId: string; campaigns: number; metrics: number }) {
  return dispatchNotification({
    organizationId: opts.organizationId,
    category: "system",
    title: "Sincronización completa",
    body: `${opts.campaigns} campañas y ${opts.metrics} métricas actualizadas`,
    metadata: opts as Prisma.InputJsonValue
  });
}
