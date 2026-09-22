/**
 * Cron scheduler — future v1.2 IG auto-scrape.
 *
 * Cloudflare Cron Triggers call the `scheduled()` handler on a crontab schedule.
 * Configured in wrangler.toml: crons = ["0 8 * * *"] (08:00 UTC = 15:00 WIB).
 *
 * v1: Disabled (commented out in wrangler.toml). Manual upload only.
 * v1.2: Enable + implement IG mobile web API scrape.
 *
 * IG mobile web API approach (research needed):
 *   1. Login via POST /accounts/login/ajax/ (mobile UA) → session cookies
 *   2. Store cookies in KV (encrypted)
 *   3. Fetch profile: GET /api/v1/feed/user/<user_id>/?count=12
 *   4. Filter for is_pinned = true (today's Info Lengger)
 *   5. Download photo via images[0].url
 *   6. Run VLM + LLM pipeline (reuse handleOcr logic)
 *   7. Send .md to user
 *
 * Fallback: if IG API fails, send "manual mode" reminder to user.
 */
import type { Env } from "../types";
import { validateEnv } from "../config";
import { logRun } from "../utils/kv";
import { sendMdAsText } from "../telegram/send";
import { logger } from "../utils/logger";

/** Cron trigger handler — called by Cloudflare on schedule. */
export async function handleScheduled(
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  try {
    validateEnv(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(env, "cron", `env validation failed: ${msg}`);
    return;
  }

  logger.info(env, "cron", "scheduled trigger fired");

  // v1.2 TODO: implement IG mobile web API scrape here
  // For now: send reminder to user (manual mode)
  await sendScheduledReminder(env);

  await logRun(env, "success", "cron: reminder sent (v1 manual mode)");
}

/** Send a cron-triggered reminder (v1 behavior). */
async function sendScheduledReminder(env: Env): Promise<void> {
  const reminder =
    `⏰ *15:00 WIB reminder*\n\n` +
    `Saatnya screenshot today's Info Lengger dari @${env.IG_USERNAME ?? "wonosobonyawijiingseni"}:\n` +
    `1. Buka IG, cari pinned post\n` +
    `2. Screenshot foto\n` +
    `3. Kirim foto ke chat ini\n` +
    `4. Bot balas dengan .md\n\n` +
    `_(Future v1.2: auto-scrape — tinggal tunggu .md masuk)_`;

  await sendMdAsText(env, env.USER_CHAT_ID, reminder);
}
