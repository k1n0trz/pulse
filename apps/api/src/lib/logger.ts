import { pino } from "pino";
import { loadEnv } from "./env.js";

const env = loadEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname"
          }
        }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      "*.password",
      "*.token",
      "*.secret",
      "*.access_token",
      "*.refresh_token"
    ],
    censor: "[REDACTED]"
  }
});
