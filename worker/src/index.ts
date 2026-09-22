/**
 * Lengger Bot Worker — main entry.
 *
 * Cloudflare Worker with two handlers:
 *   - fetch():     HTTP webhook route (/api/telegram-webhook, /health)
 *   - scheduled(): Cron trigger (v1.2 IG auto-scrape, disabled in v1)
 *
 * Deploy:
 *   cd worker && npm install
 *   wrangler login
 *   wrangler kv:namespace create BOT_KV  (paste ID into wrangler.toml)
 *   wrangler secret put TELEGRAM_BOT_TOKEN
 *   wrangler secret put TELEGRAM_WEBHOOK_SECRET
 *   wrangler secret put USER_CHAT_ID
 *   wrangler secret put GEMINI_API_KEY
 *   wrangler secret put GLM_API_KEY
 *   wrangler deploy
 *
 * Set Telegram webhook:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d "url=https://lengger-bot.<user>.workers.dev/api/telegram-webhook" \
 *     -d "secret_token=<SECRET>"
 *
 * See PLAN.md for full architecture.
 */
import type { Env } from "./types";
import { handleWebhook } from "./telegram/webhook";
import { handleScheduled } from "./cron/scheduler";

export default {
  /** HTTP fetch handler — routes webhook + health. */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint (for uptime monitoring)
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
          bot: "lengger-bot",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Telegram webhook
    if (url.pathname === "/api/telegram-webhook") {
      return handleWebhook(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },

  /** Cron trigger handler — v1.2 IG auto-scrape (disabled in v1). */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(env, ctx));
  },
};
