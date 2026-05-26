import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

declare global {
  var __pulsePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__pulsePrisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { level: "warn", emit: "stdout" },
            { level: "error", emit: "stdout" }
          ]
        : [{ level: "error", emit: "stdout" }]
  });

if (env.NODE_ENV !== "production") {
  globalThis.__pulsePrisma = prisma;
}
