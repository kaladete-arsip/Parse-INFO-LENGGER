/**
 * Telegram Bot — Supabase Edge Function (Deno)
 *
 * Workflow:
 * 1. User sends IG post URL to Telegram bot
 * 2. Bot fetches IG post page → extracts full res 1080px image
 * 3. Bot sends to Gemini 3 Flash VLM → text
 * 4. Bot replies with .md file + preview + summary
 *
 * No login needed. No manual screenshot. Just: copy URL → paste to bot.
 *
 * Setup:
 *   supabase functions deploy telegram-bot
 *   supabase secrets set TELEGRAM_BOT_TOKEN=xxx
 *   supabase secrets set GEMINI_API_KEY=xxx
 *   supabase secrets set OPENROUTER_API_KEY=xxx  (optional fallback)
 *   supabase secrets set USER_CHAT_ID=xxx
 *
 * Set webhook:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT>.supabase.co/functions/v1/telegram-bot"
 *
 * Commands:
 *   /help     — show help
 *   /status   — bot health
 *   <IG URL>  — download + OCR + reply .md
 */

import { downloadIGPost, extractShortcode } from "./ig.ts";
import { runVlmOcr, runVlmOcrOpenRouter } from "./ocr.ts";
import { sendText, sendDocument, sendPhoto } from "./telegram.ts";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Health check
  if (url.pathname === "/health" || req.method === "GET" && !req.headers.get("content-type")?.includes("json")) {
    return new Response(JSON.stringify({ status: "ok", bot: "lengger-telegram", timestamp: new Date().toISOString() }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Telegram webhook
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const USER_CHAT_ID = Deno.env.get("USER_CHAT_ID");

  if (!BOT_TOKEN || !USER_CHAT_ID) {
    return new Response("Missing env vars", { status: 500 });
  }

  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg || !msg.text) return new Response("OK", { status: 200 });

    const chatId = msg.chat.id.toString();
    const fromId = msg.from?.id?.toString();

    // Auth gate
    if (fromId !== USER_CHAT_ID) {
      return new Response("OK", { status: 200 });
    }

    const text = msg.text;

    // Commands
    if (text.startsWith("/help") || text.startsWith("/start")) {
      await sendText(BOT_TOKEN, chatId,
        "🤖 <b>Lengger Bot — Commands</b>\n\n" +
        "Kirim URL IG post (https://www.instagram.com/p/XXX/) → bot download foto full res → VLM OCR → reply .md\n\n" +
        "Commands:\n" +
        "• /help — bantuan\n" +
        "• /status — bot health\n" +
        "• <IG URL> — download + OCR + reply .md"
      );
      return new Response("OK", { status: 200 });
    }

    if (text.startsWith("/status")) {
      await sendText(BOT_TOKEN, chatId,
        "🟢 Bot online\n" +
        `Gemini: ${GEMINI_KEY ? "✅" : "❌"}\n` +
        `OpenRouter: ${OPENROUTER_KEY ? "✅" : "❌"}\n` +
        `Time: ${new Date().toISOString()}`
      );
      return new Response("OK", { status: 200 });
    }

    // Check for IG URL
    const shortcode = extractShortcode(text);
    if (!shortcode) {
      await sendText(BOT_TOKEN, chatId,
        "❌ Kirim URL Instagram post yang valid.\n" +
        "Contoh: https://www.instagram.com/p/DdlDfVvxg4E/"
      );
      return new Response("OK", { status: 200 });
    }

    // === MAIN PIPELINE ===
    await sendText(BOT_TOKEN, chatId, "⏳ Download foto dari IG...");

    // 1. Download IG post image (full res, no crop)
    const { buffer, mimeType, shortcode: sc } = await downloadIGPost(text);
    await sendText(BOT_TOKEN, chatId, `✅ Foto terdownload (${(buffer.byteLength / 1024).toFixed(0)}KB, ${mimeType})`);

    // 2. VLM OCR
    await sendText(BOT_TOKEN, chatId, "🔍 VLM OCR sedang membaca foto...");

    let ocrText = "";
    let ocrModel = "";

    // Try Gemini first
    if (GEMINI_KEY) {
      try {
        const result = await runVlmOcr(buffer, mimeType, GEMINI_KEY);
        ocrText = result.text;
        ocrModel = result.model;
      } catch (err) {
        await sendText(BOT_TOKEN, chatId, `⚠️ Gemini gagal, coba OpenRouter...`);
      }
    }

    // Fallback: OpenRouter
    if (!ocrText && OPENROUTER_KEY) {
      try {
        const result = await runVlmOcrOpenRouter(buffer, mimeType, OPENROUTER_KEY);
        ocrText = result.text;
        ocrModel = result.model;
      } catch (err) {
        await sendText(BOT_TOKEN, chatId, `❌ VLM gagal: ${err.message}`);
        return new Response("OK", { status: 200 });
      }
    }

    if (!ocrText) {
      await sendText(BOT_TOKEN, chatId, "❌ VLM gagal (Gemini + OpenRouter both failed). Coba lagi nanti.");
      return new Response("OK", { status: 200 });
    }

    // 3. Send results
    const preview = ocrText.slice(0, 500) + (ocrText.length > 500 ? "\n\n... (lihat file .md lengkap di bawah)" : "");

    await sendText(BOT_TOKEN, chatId,
      `✅ OCR selesai (${ocrModel})\n` +
      `📊 ${ocrText.length} karakter\n\n` +
      `<pre>${escapeHtml(preview)}</pre>`
    );

    // Send .md file
    const date = new Date().toISOString().slice(0, 10);
    await sendDocument(BOT_TOKEN, chatId, ocrText, `${date}-ig-ocr.md`);

    // Send original photo back (for reference)
    await sendPhoto(BOT_TOKEN, chatId, buffer, `📸 Foto asli dari IG post ${sc}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Bot error:", msg);
    // Try to send error to user
    try {
      const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
      const USER_CHAT_ID = Deno.env.get("USER_CHAT_ID")!;
      await sendText(BOT_TOKEN, USER_CHAT_ID, `❌ Error: ${msg}`);
    } catch {}
  }

  return new Response("OK", { status: 200 });
});

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
