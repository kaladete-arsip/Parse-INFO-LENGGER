/**
 * Telegram message send helpers.
 *
 * Uses Telegram Bot API directly via fetch() (no grammy Bot instance needed
 * for sending — grammy is used for webhook parsing in webhook.ts).
 *
 * Telegram limits:
 *   - Text message: max 4096 chars (we split long MD)
 *   - File document: max 50MB (our .md files are <50KB, fine)
 *   - Photo: max 10MB (our screenshots are <500KB, fine)
 */
import type { Env } from "../types";
import { CONFIG } from "../config";
import { getLastRun, getTodayQuota } from "../utils/kv";
import { logger } from "../utils/logger";

/**
 * Send MD text as a Telegram message (with header + preview).
 * If MD is longer than PREVIEW_LEN, truncates + tells user to see attached file.
 */
export async function sendMdAsText(
  env: Env,
  chatId: string,
  mdText: string
): Promise<void> {
  const preview = formatMdPreview(mdText);
  const chunks = chunkText(preview, CONFIG.MAX_MSG_LEN);

  for (const chunk of chunks) {
    await fetch(
      `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: "MarkdownV2",
        }),
      }
    );
  }
}

/**
 * Send MD as a .md file attachment.
 * Filename derived from content (date if detectable) or timestamp.
 */
export async function sendMdAsFile(
  env: Env,
  chatId: string,
  mdText: string,
  filename?: string
): Promise<void> {
  const name = filename ?? deriveFilename(mdText);
  const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", blob, name);

  logger.info(env, "send", `sending .md file: ${name} (${mdText.length} chars)`);

  await fetch(
    `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method: "POST", body: formData }
  );
}

/**
 * Send a .xlsx file as attachment (for /convert command).
 */
export async function sendXlsxFile(
  env: Env,
  chatId: string,
  xlsxBuffer: ArrayBuffer,
  filename: string
): Promise<void> {
  const blob = new Blob([xlsxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", blob, filename);

  logger.info(env, "send", `sending .xlsx file: ${filename}`);

  await fetch(
    `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method: "POST", body: formData }
  );
}

/**
 * Send bot health status to user.
 */
export async function sendStatus(env: Env, chatId: string): Promise<void> {
  const [lastRun, quota] = await Promise.all([
    getLastRun(env),
    getTodayQuota(env),
  ]);

  const lastRunStr = lastRun
    ? `${lastRun.status} (${new Date(lastRun.timestamp).toISOString()}): ${lastRun.detail}`
    : "(no runs yet)";

  const text =
    `🤖 *Lengger Bot Status*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Last run:* ${escapeMd(lastRunStr)}\n` +
    `*Today's quotas:*\n` +
    `  • Gemini VLM: ${quota.gemini} / 1500 RPD\n` +
    `  • GLM fix: ${quota.glm} / unlimited\n` +
    `  • Telegram: ${quota.telegram} / unlimited\n` +
    `*Runtime:* Cloudflare Workers (edge, no cold start)\n` +
    `*Models:* ${CONFIG.GEMINI_MODEL} (VLM), ${CONFIG.GLM_MODEL} (LLM)\n` +
    `*Source:* v1 manual upload (v1.2 IG auto-scrape = future)`;

  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    }),
  });
}

/**
 * Send help / command list.
 */
export async function sendHelp(env: Env, chatId: string): Promise<void> {
  const text =
    `📖 *Lengger Bot — Commands*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `*Usage:* screenshot IG/FB post → send photo to this chat → bot replies with .md\n\n` +
    `*Commands:*\n` +
    `• /ocr — reply to a photo: run Gemini VLM → reply .md (text + file)\n` +
    `• /convert — reply to a .md file: convert to .xlsx via parser\n` +
    `• /today — reminder: screenshot today's @${CONFIG.IG_TARGET} post\n` +
    `• /status — bot health, last run, API quotas\n` +
    `• /help — this message\n\n` +
    `*Pipeline:* photo → Gemini 3 Flash VLM (95% akurasi) → GLM-4.6-Flash fix typo → .md\n` +
    `*Cost:* $0/month (all free tiers)\n` +
    `*Source:* https://github.com/your-username/lengger-ledger-converter`;

  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    }),
  });
}

/**
 * Send a simple text error message.
 */
export async function sendError(
  env: Env,
  chatId: string,
  msg: string
): Promise<void> {
  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `❌ ${msg}`,
    }),
  });
}

// ─── Helpers ───────────────────────────────────────────────

/** Format MD as a preview message with header. */
function formatMdPreview(mdText: string): string {
  const preview =
    mdText.length > CONFIG.PREVIEW_LEN
      ? mdText.slice(0, CONFIG.PREVIEW_LEN) +
        "\n\n... (see attached .md file for full text)"
      : mdText;

  return (
    `📋 *Info Lengger OCR Result*\n\n` +
    `\`\`\`markdown\n${escapeMd(preview)}\n\`\`\``
  );
}

/** Split text into chunks ≤ maxLen (for Telegram 4096 char limit). */
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return chunks;
}

/** Derive filename from MD content (extract date if possible) or timestamp. */
function deriveFilename(mdText: string): string {
  // Try to extract date from "Info Lengger <Day>, DD Month YYYY" header
  const dateMatch = mdText.match(
    /Info Lengger \w+,\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i
  );
  if (dateMatch) {
    const months: Record<string, string> = {
      januari: "01", februari: "02", maret: "03", april: "04",
      mei: "05", juni: "06", juli: "07", agustus: "08",
      september: "09", oktober: "10", november: "11", desember: "12",
    };
    const day = dateMatch[1].padStart(2, "0");
    const month = months[dateMatch[2].toLowerCase()] ?? "01";
    const year = dateMatch[3];
    return `info-lengger-${year}-${month}-${day}.md`;
  }
  // Fallback: timestamp
  const ts = new Date().toISOString().slice(0, 10);
  return `info-lengger-${ts}.md`;
}

/** Escape special chars for Telegram MarkdownV2. */
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
