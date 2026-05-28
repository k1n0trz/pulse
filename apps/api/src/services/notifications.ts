// Notification service — currently persists rows in the Notification table.
// When RESEND_API_KEY is configured (Fase 3 slice 2), the same calls also
// trigger emails via Resend. Until then, the in-app feed is the only channel.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

export type NotificationCategory = "alert" | "recommendation" | "report" | "system";

export interface DispatchInput {
  organizationId: string;
  userId?: string | undefined;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string | undefined;
  metadata?: Prisma.InputJsonValue;
}

export async function dispatchNotification(input: DispatchInput) {
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

  if (env.RESEND_API_KEY) {
    // Hook for Resend — slice 2 wires the real HTTP call.
    logger.info({ notificationId: notification.id }, "[notifications] Resend dispatch queued (placeholder)");
  } else {
    logger.debug({ notificationId: notification.id, title: input.title }, "[notifications] in-app only (no Resend key)");
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
