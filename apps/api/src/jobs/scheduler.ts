import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { syncAllForConnection, syncCampaigns } from "../meta/sync.js";

const env = loadEnv();

let started = false;
const tasks: cron.ScheduledTask[] = [];

export function startScheduler() {
  if (started) return;
  if (!env.ENABLE_SYNC_SCHEDULER) {
    logger.info("Sync scheduler disabled (ENABLE_SYNC_SCHEDULER=false)");
    return;
  }

  tasks.push(
    cron.schedule(env.SYNC_NIGHTLY_CRON, async () => {
      logger.info("[scheduler] Running nightly full sync");
      const connections = await prisma.metaConnection.findMany({ where: { status: "ACTIVE" } });
      for (const c of connections) {
        try {
          await syncAllForConnection(c.id, { datePreset: "last_30d" });
        } catch (error) {
          logger.error({ err: error, connectionId: c.id }, "Nightly sync failed for connection");
        }
      }
    })
  );

  tasks.push(
    cron.schedule(env.SYNC_HOURLY_CRON, async () => {
      logger.info("[scheduler] Running hourly metrics refresh");
      const accounts = await prisma.metaAdAccount.findMany({
        where: { enabled: true, connection: { status: "ACTIVE" } }
      });
      for (const account of accounts) {
        try {
          await syncCampaigns(account.id, { datePreset: "last_7d" });
        } catch (error) {
          logger.error({ err: error, accountId: account.id }, "Hourly sync failed for account");
        }
      }
    })
  );

  started = true;
  logger.info({ nightly: env.SYNC_NIGHTLY_CRON, hourly: env.SYNC_HOURLY_CRON }, "Sync scheduler started");
}

export function stopScheduler() {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  started = false;
}
