import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// override:true so a .env value wins over an empty/stale shell variable
// (this matters when running inside shells that pre-set ANTHROPIC_API_KEY="" etc.)
loadDotenv({ override: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Database
  DATABASE_URL: z.string().url(),

  // Crypto — 64 hex chars = 32 bytes for AES-256-GCM
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
    .default("0".repeat(64)),

  // Auth (Fase 3)
  JWT_SECRET: z.string().min(32).default("dev-secret-change-me-dev-secret-change-me"),
  // Clerk (Fase 3c). When unset, the API runs in single-tenant demo mode.
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // Meta integration (Fase 1)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_API_VERSION: z.string().default("v23.0"),
  META_DEFAULT_SCOPES: z
    .string()
    .default("ads_read,ads_management,business_management,pages_show_list")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  // Frontend (used to redirect users back after OAuth)
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),

  // Sync scheduler
  ENABLE_SYNC_SCHEDULER: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  SYNC_NIGHTLY_CRON: z.string().default("0 3 * * *"),
  SYNC_HOURLY_CRON: z.string().default("15 * * * *"),

  // Anthropic (Fase 2)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Notifications & queues (Fase 3)
  ONESIGNAL_APP_ID: z.string().optional(),
  ONESIGNAL_API_KEY: z.string().optional(),
  ONESIGNAL_FROM_EMAIL: z.string().default("Pulse <notifications@pulse.local>"),
  REDIS_URL: z.string().optional(),
  ENABLE_BULLMQ: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
