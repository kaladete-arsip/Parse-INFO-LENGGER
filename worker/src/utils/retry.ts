/**
 * Exponential backoff retry helper for fetch calls.
 *
 * Cloudflare Workers have a 30s wall-clock limit (Telegram webhook timeout).
 * Retry config: MAX_RETRIES=3, base delay 1s → 2s → 4s (total ~7s of waits).
 */
import { CONFIG } from "../config";

/** Run an async function with retry + exponential backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = CONFIG.MAX_RETRIES,
  baseMs = CONFIG.RETRY_BASE_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const delay = baseMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Check if an error is retryable (network error or 5xx / 429). */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    );
  }
  return false;
}
