import { pathToFileURL } from "node:url";
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";
import { connectionRoutes } from "./routes/connections.js";
import { syncRoutes } from "./routes/sync.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { chatRoutes } from "./routes/chat.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { auditRoutes } from "./routes/auditEvents.js";
import { notificationRoutes } from "./routes/notifications.js";
import { meRoutes } from "./routes/me.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";
import { shutdownQueue } from "./jobs/queue.js";

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
    disableRequestLogging: false
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true
  });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute"
  });

  await app.register(healthRoutes, { prefix: "/" });
  await app.register(metaRoutes, { prefix: "/v1" });
  await app.register(connectionRoutes, { prefix: "/v1" });
  await app.register(syncRoutes, { prefix: "/v1" });
  await app.register(campaignRoutes, { prefix: "/v1" });
  await app.register(chatRoutes, { prefix: "/v1" });
  await app.register(recommendationRoutes, { prefix: "/v1" });
  await app.register(auditRoutes, { prefix: "/v1" });
  await app.register(notificationRoutes, { prefix: "/v1" });
  await app.register(meRoutes, { prefix: "/v1" });

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    app.log.error({ err: error }, "Unhandled error");
    const status = error.statusCode ?? 500;
    return reply.code(status).send({
      ok: false,
      error: status >= 500 ? "internal_error" : error.code ?? "request_failed",
      message: status >= 500 ? "Something went wrong." : error.message
    });
  });

  return app;
}

async function start() {
  const env = loadEnv();
  const app = await buildServer();
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`Pulse API listening on http://${env.HOST}:${env.PORT}`);
    startScheduler();
    const shutdown = async (signal: string) => {
      app.log.info({ signal }, "Shutting down");
      stopScheduler();
      await shutdownQueue();
      await app.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

const entry = process.argv[1];
const invokedDirectly = entry ? import.meta.url === pathToFileURL(entry).href : false;
if (invokedDirectly) {
  void start();
}
