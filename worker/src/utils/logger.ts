/**
 * Logger — outputs to Cloudflare Workers log stream (visible via `wrangler tail`).
 *
 * Workers don't have filesystem logging. Use `console.log/error/warn` which
 * Cloudflare captures and streams. For permanent logs, write to KV.
 *
 * API keys are masked before logging to prevent accidental leakage.
 */
import type { Env } from "../types";
import { maskKey } from "../config";

type LogLevel = "info" | "warn" | "error";

function format(level: LogLevel, module: string, msg: string, extra?: unknown): string {
  const ts = new Date().toISOString();
  const extraStr = extra !== undefined ? ` ${JSON.stringify(extra)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${module}] ${msg}${extraStr}`;
}

export const logger = {
  info(env: Env | null, module: string, msg: string, extra?: unknown): void {
    console.log(format("info", module, msg, sanitizeExtra(env, extra)));
  },

  warn(env: Env | null, module: string, msg: string, extra?: unknown): void {
    console.warn(format("warn", module, msg, sanitizeExtra(env, extra)));
  },

  error(env: Env | null, module: string, msg: string, extra?: unknown): void {
    console.error(format("error", module, msg, sanitizeExtra(env, extra)));
  },
};

/** Remove secrets from extra context before logging. */
function sanitizeExtra(env: Env | null, extra?: unknown): unknown {
  if (!extra || typeof extra !== "object") return extra;
  const sanitized = { ...(extra as Record<string, unknown>) };
  // Mask common secret field names
  const secretFields = [
    "apiKey",
    "api_key",
    "token",
    "secret",
    "password",
    "authorization",
    "TELEGRAM_BOT_TOKEN",
    "GEMINI_API_KEY",
    "GLM_API_KEY",
    "IG_PASSWORD",
  ];
  for (const field of secretFields) {
    if (typeof sanitized[field] === "string") {
      sanitized[field] = maskKey(sanitized[field] as string);
    }
  }
  return sanitized;
}
