/**
 * Configuration constants + env validation for Lengger Bot Worker.
 */
import type { Env } from "./types";

/** Static config — safe to commit (no secrets). */
export const CONFIG = {
  // IG target account (future v1.2 auto-scrape)
  IG_TARGET: "wonosobonyawijiingseni",

  // AI models (Sep 2026 — see PLAN.md §6.2, §7.2 for model lifecycle)
  GEMINI_MODEL: "gemini-3-flash",
  GLM_MODEL: "glm-4.7-flash",
  GLM_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",

  // Telegram API
  TELEGRAM_API: "https://api.telegram.org",

  // Message limits
  MAX_MSG_LEN: 4096,
  PREVIEW_LEN: 500,

  // Retry config (exponential backoff)
  MAX_RETRIES: 3,
  RETRY_BASE_MS: 1000,

  // LLM fix config
  LLM_TEMPERATURE: 0.1,
  LLM_MAX_TOKENS: 2000,
} as const;

/** Validate that all required env vars are set. Throws on missing. */
export function validateEnv(env: Env): void {
  const required: (keyof Env)[] = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "USER_CHAT_ID",
    "GEMINI_API_KEY",
    "GLM_API_KEY",
    "BOT_KV",
  ];
  for (const key of required) {
    const val = env[key];
    if (typeof val !== "string" || val.length === 0) {
      throw new Error(`Missing env var: ${String(key)}`);
    }
  }
}

/** Mask API key for safe logging. Returns first 8 + last 4 chars. */
export function maskKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/** Today's date in YYYY-MM-DD (UTC) — used for KV quota keys. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
