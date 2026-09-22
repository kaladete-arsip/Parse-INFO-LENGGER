/**
 * Telegram webhook handler — verify secret + parse update + dispatch.
 *
 * Telegram sends POST to /api/telegram-webhook with:
 *   - Header: X-Telegram-Bot-Api-Secret-Token (must match TELEGRAM_WEBHOOK_SECRET)
 *   - Body: TelegramUpdate JSON
 *
 * Worker responds 200 immediately (Telegram 60s timeout), processes async
 * via ctx.waitUntil() so the pipeline doesn't block the response.
 */
import type { Env, TelegramUpdate } from "../types";
import { validateEnv } from "../config";
import { handleCommand } from "./handlers";
import { logger } from "../utils/logger";

export async function handleWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    validateEnv(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(env, "webhook", `env validation failed: ${msg}`);
    return new Response("Server misconfigured", { status: 500 });
  }

  // Verify webhook secret
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn(env, "webhook", "unauthorized — secret mismatch");
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse update
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    logger.error(env, "webhook", "invalid JSON body");
    return new Response("Bad Request", { status: 400 });
  }

  if (!update.message) {
    logger.info(env, "webhook", "non-message update received, ignoring");
    return new Response("OK", { status: 200 });
  }

  // Respond immediately; process async (Telegram 60s timeout safety)
  ctx.waitUntil(handleCommand(update, env));

  return new Response("OK", { status: 200 });
}
