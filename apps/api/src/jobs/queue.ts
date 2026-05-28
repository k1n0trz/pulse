// Queue infrastructure for Pulse.
//
// Phase 3 slice 1 keeps node-cron working but introduces an abstraction layer
// so that swapping to BullMQ in slice 2 is a config flag, not a refactor.
// When REDIS_URL + ENABLE_BULLMQ=true are set, the actual queue uses BullMQ.
// Otherwise enqueueing a job runs it inline (sync), which is fine for low
// volume.

import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const env = loadEnv();

export type JobName = "sync.account" | "sync.connection" | "autopilot.run" | "report.daily" | "notification.send";

export interface JobPayload {
  "sync.account": { accountId: string; datePreset?: "last_7d" | "last_30d" };
  "sync.connection": { connectionId: string; datePreset?: "last_7d" | "last_30d" };
  "autopilot.run": { organizationId: string };
  "report.daily": { organizationId: string };
  "notification.send": { notificationId: string };
}

type Handler<N extends JobName> = (payload: JobPayload[N]) => Promise<void>;

const handlers = new Map<JobName, Handler<JobName>>();

export function registerJobHandler<N extends JobName>(name: N, handler: Handler<N>) {
  handlers.set(name, handler as Handler<JobName>);
}

let bullQueue: import("bullmq").Queue | null = null;
let bullWorker: import("bullmq").Worker | null = null;

async function maybeLoadBullMQ() {
  if (!env.ENABLE_BULLMQ || !env.REDIS_URL) return false;
  if (bullQueue) return true;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = { url: env.REDIS_URL };
    bullQueue = new Queue("pulse", { connection });
    bullWorker = new Worker(
      "pulse",
      async (job) => {
        const handler = handlers.get(job.name as JobName);
        if (!handler) throw new Error(`No handler registered for ${job.name}`);
        await handler(job.data);
      },
      { connection }
    );
    bullWorker.on("failed", (job, err) => {
      logger.error({ err, job: job?.name }, "[queue] job failed");
    });
    logger.info("[queue] BullMQ initialized");
    return true;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "[queue] BullMQ requested but failed to initialize; falling back to inline");
    return false;
  }
}

export async function enqueueJob<N extends JobName>(name: N, payload: JobPayload[N], opts?: { delayMs?: number }) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for ${name}`);
  const queueReady = await maybeLoadBullMQ();
  if (queueReady && bullQueue) {
    await bullQueue.add(name, payload, opts?.delayMs ? { delay: opts.delayMs } : undefined);
    return { mode: "queued" as const };
  }
  // Inline fallback — run immediately. Good enough for Fase 3 slice 1.
  try {
    await handler(payload);
    return { mode: "inline" as const };
  } catch (error) {
    logger.error({ err: error, job: name }, "[queue] inline job failed");
    throw error;
  }
}

export async function shutdownQueue() {
  if (bullWorker) await bullWorker.close();
  if (bullQueue) await bullQueue.close();
  bullQueue = null;
  bullWorker = null;
}
