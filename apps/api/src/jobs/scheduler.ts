import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { syncAllForConnection, syncCampaigns } from "../meta/sync.js";
import { enqueueJob, registerJobHandler } from "./queue.js";

const env = loadEnv();

let started = false;
const tasks: cron.ScheduledTask[] = [];

// Register the actual work as queue handlers. enqueueJob routes them through
// BullMQ when REDIS_URL + ENABLE_BULLMQ are set (retries, concurrency), or runs
// them inline otherwise. node-cron remains the trigger either way.
function registerHandlers() {
  registerJobHandler("sync.connection", async ({ connectionId, datePreset }) => {
    await syncAllForConnection(connectionId, { datePreset: datePreset ?? "last_30d" });
  });
  registerJobHandler("sync.account", async ({ accountId, datePreset }) => {
    await syncCampaigns(accountId, { datePreset: datePreset ?? "last_7d" });
  });
}

export function startScheduler() {
  if (started) return;
  registerHandlers();

  if (!env.ENABLE_SYNC_SCHEDULER) {
    logger.info("Sync scheduler disabled (ENABLE_SYNC_SCHEDULER=false)");
    started = true;
    return;
  }

  tasks.push(
    cron.schedule(env.SYNC_NIGHTLY_CRON, async () => {
      logger.info("[scheduler] Enqueuing nightly full sync");
      const connections = await prisma.metaConnection.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      for (const c of connections) {
        await enqueueJob("sync.connection", { connectionId: c.id, datePreset: "last_30d" }).catch((err) =>
          logger.error({ err, connectionId: c.id }, "Failed to enqueue nightly sync")
        );
      }
    })
  );

  tasks.push(
    cron.schedule(env.SYNC_HOURLY_CRON, async () => {
      logger.info("[scheduler] Enqueuing hourly metrics refresh");
      const accounts = await prisma.metaAdAccount.findMany({
        where: { enabled: true, connection: { status: "ACTIVE" } },
        select: { id: true }
      });
      for (const account of accounts) {
        await enqueueJob("sync.account", { accountId: account.id, datePreset: "last_7d" }).catch((err) =>
          logger.error({ err, accountId: account.id }, "Failed to enqueue hourly sync")
        );
      }
    })
  );

  started = true;
  logger.info(
    { nightly: env.SYNC_NIGHTLY_CRON, hourly: env.SYNC_HOURLY_CRON, queue: env.ENABLE_BULLMQ ? "bullmq" : "inline" },
    "Sync scheduler started"
  );
}

export function stopScheduler() {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  started = false;
}
