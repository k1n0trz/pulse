import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";

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

  app.setErrorHandler((error, _req, reply) => {
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
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (invokedDirectly) {
  void start();
}
