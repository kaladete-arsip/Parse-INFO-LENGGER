/**
 * Fallback handler — when VLM (Gemini) fails, send raw photo back to user.
 *
 * Tesseract.js is NOT viable in Cloudflare Workers (10ms CPU limit + WASM
 * worker incompatibility with edge runtime). So fallback is:
 *   1. Send error notice text
 *   2. Send raw photo back (so user can transcribe manually
 *      or upload to web UI's browser-side Tesseract OCR)
 *
 * See PLAN.md §10 Fallback Hierarchy.
 */
import type { Env } from "../types";
import { CONFIG } from "../config";
import { sendMdAsText } from "../telegram/send";
import { logger } from "../utils/logger";

/**
 * Handle VLM failure — send raw photo + manual mode notice to user.
 *
 * @param env          Worker env
 * @param chatId       Target Telegram chat ID
 * @param imageBase64  Base64 image (to send back)
 * @param mimeType     Image MIME type
 * @param error        Error message from VLM failure
 */
export async function handleVlmFailure(
  env: Env,
  chatId: string,
  imageBase64: string,
  mimeType: string,
  error: string
): Promise<void> {
  logger.warn(env, "fallback", `VLM failed, sending raw photo. Error: ${error}`);

  const notice =
    `⚠️ *VLM gagal:* ${escapeMarkdown(error)}\n\n` +
    `Bot mengirim foto balik ke Anda. Anda bisa:\n` +
    `1. Transkripsi manual di HP/laptop\n` +
    `2. Upload ke web UI (tab "Foto → OCR") untuk Tesseract OCR client-side\n` +
    `3. Coba lagi dalam 1 jam dengan /ocr (kalau Gemini cuma rate-limited)`;

  await sendMdAsText(env, chatId, notice);

  // Send raw photo back via Telegram sendPhoto (base64 → upload as form data)
  // Telegram doesn't support base64 photo directly — must send as multipart/form-data
  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", "📷 Raw photo (VLM failed — manual mode)");

    // Convert base64 to Blob
    const byteChars = atob(imageBase64);
    const byteArrays: number[] = [];
    for (let i = 0; i < byteChars.length; i++) {
      byteArrays.push(byteChars.charCodeAt(i));
    }
    const blob = new Blob([new Uint8Array(byteArrays)], { type: mimeType });

    formData.append("photo", blob, "raw-photo.jpg");

    await fetch(
      `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: "POST", body: formData }
    );
  } catch (sendErr) {
    const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    logger.error(env, "fallback", `Failed to send raw photo: ${msg}`);
  }
}

/** Escape special chars for Telegram MarkdownV2 parse mode. */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
