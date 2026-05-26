import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { META_TOOLS, metaConnectorPrinciples } from "@pulse/shared";
import { buildStartUrl, completeOAuthCallback, MetaConfigError } from "../meta/oauth.js";
import { loadEnv } from "../lib/env.js";

const StartQuery = z.object({
  organizationId: z.string().optional(),
  redirectTo: z.string().url().optional(),
  format: z.enum(["json", "redirect"]).default("json")
});

const CallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_reason: z.string().optional(),
  error_description: z.string().optional()
});

export const metaRoutes: FastifyPluginAsync = async (app) => {
  const env = loadEnv();

  app.get("/meta/tools", async () => ({
    provider: "meta-ads-connectors",
    tools: Object.values(META_TOOLS),
    principles: metaConnectorPrinciples
  }));

  app.get("/meta/oauth/config", async () => ({
    configured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_REDIRECT_URI),
    apiVersion: env.META_API_VERSION,
    redirectUri: env.META_REDIRECT_URI ?? null,
    defaultScopes: env.META_DEFAULT_SCOPES
  }));

  app.get("/meta/oauth/start", async (req, reply) => {
    const parsed = StartQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_query", issues: parsed.error.issues });
    }
    try {
      const { url, state } = buildStartUrl(parsed.data);
      if (parsed.data.format === "redirect") {
        return reply.redirect(url);
      }
      return { ok: true, url, state };
    } catch (error) {
      if (error instanceof MetaConfigError) {
        return reply.code(503).send({ ok: false, error: "meta_not_configured", message: error.message });
      }
      throw error;
    }
  });

  app.get("/meta/oauth/callback", async (req, reply) => {
    const parsed = CallbackQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "invalid_query" });
    }
    if (parsed.data.error) {
      app.log.warn({ error: parsed.data.error, reason: parsed.data.error_reason }, "OAuth callback denied by user");
      const redirectTo = `${env.WEB_APP_URL}/connections/error?reason=${encodeURIComponent(parsed.data.error_reason ?? parsed.data.error)}`;
      return reply.redirect(redirectTo);
    }
    if (!parsed.data.code || !parsed.data.state) {
      return reply.code(400).send({ ok: false, error: "missing_code_or_state" });
    }

    try {
      const result = await completeOAuthCallback({ code: parsed.data.code, state: parsed.data.state });
      const redirectBase = result.redirectTo && result.redirectTo.startsWith(env.WEB_APP_URL) ? result.redirectTo : `${env.WEB_APP_URL}/connections`;
      const url = new URL(redirectBase);
      url.searchParams.set("connection", result.connectionId);
      url.searchParams.set("meta_user", result.metaUserId);
      return reply.redirect(url.toString());
    } catch (error) {
      app.log.error({ err: error }, "OAuth callback failed");
      return reply.code(400).send({ ok: false, error: "oauth_callback_failed", message: (error as Error).message });
    }
  });
};
