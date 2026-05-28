import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

let cached: Anthropic | null = null;

export function isAnthropicConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Anthropic is not configured. Set ANTHROPIC_API_KEY in .env to enable the AI brain (Fase 2)."
    );
  }
  if (!cached) {
    cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return cached;
}

// Default models per skill guidance: Opus 4.7 for reasoning, Haiku 4.5 for classification.
export const MODELS = {
  brain: "claude-opus-4-7" as const,
  light: "claude-haiku-4-5" as const
};
