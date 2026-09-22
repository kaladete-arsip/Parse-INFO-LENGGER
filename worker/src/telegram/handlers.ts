/**
 * Telegram command handlers.
 *
 * Commands:
 *   /help    — show command list
 *   /status  — bot health, last run, API quotas
 *   /ocr     — reply to a photo: run Gemini VLM → reply .md (text + file)
 *   /convert — reply to a .md file: convert to .xlsx via parser
 *   /today   — reminder to screenshot today's IG post
 *
 * Auth: only USER_CHAT_ID can use the bot. Other chats silently dropped.
 *
 * Pipeline per photo:
 *   1. Download photo via Telegram getFile API (fetch)
 *   2. Base64 encode (for Gemini inlineData)
 *   3. Gemini 3 Flash VLM → MD text
 *   4. (Optional) GLM-4.6-Flash fix typos
 *   5. Send MD as text preview + .md file attachment
 *   6. On VLM failure: send raw photo back + manual mode notice
 */
import type { Env, TelegramUpdate, TelegramGetFileResponse } from "../types";
import { CONFIG } from "../config";
import { runVlmOcr } from "../ai/vlm-ocr";
import { runLlmFix } from "../ai/llm-fix";
import { handleVlmFailure } from "../ai/fallback";
import { looksLikeInfoLengger, convertMdToXlsx } from "../utils/budaya-bridge";
import {
  sendHelp,
  sendStatus,
  sendMdAsText,
  sendMdAsFile,
  sendXlsxFile,
  sendError,
} from "./send";
import { incrementQuota, logRun } from "../utils/kv";
import { logger } from "../utils/logger";

/** Main command dispatcher. */
export async function handleCommand(
  update: TelegramUpdate,
  env: Env
): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id.toString();
  const fromId = msg.from?.id?.toString();

  // Auth gate — only USER_CHAT_ID can use bot
  if (fromId !== env.USER_CHAT_ID) {
    logger.warn(env, "handlers", `unauthorized access from chat_id=${fromId}`);
    return; // silently drop
  }

  // Route based on text command OR reply-to-photo/document context
  const text = msg.text ?? "";
  const hasPhoto = !!msg.photo?.length;
  const hasDocument = !!msg.document;
  const replyPhoto = !!msg.reply_to_message?.photo?.length;
  const replyDoc = !!msg.reply_to_message?.document;

  try {
    if (text.startsWith("/help") || text.startsWith("/start")) {
      await sendHelp(env, chatId);
    } else if (text.startsWith("/init")) {
      await handleInit(env, chatId);
    } else if (text.startsWith("/status")) {
      await sendStatus(env, chatId);
    } else if (text.startsWith("/today")) {
      await handleToday(env, chatId);
    } else if (text.startsWith("/ocr") || hasPhoto) {
      // /ocr command OR direct photo upload (no command needed)
      const photoId = hasPhoto
        ? msg.photo![msg.photo!.length - 1].file_id // largest size
        : replyPhoto
        ? msg.reply_to_message!.photo![0].file_id
        : null;
      if (!photoId) {
        await sendError(env, chatId, "Reply ke foto atau kirim foto langsung untuk /ocr");
        return;
      }
      await handleOcr(env, chatId, photoId);
    } else if (text.startsWith("/convert") || (hasDocument && isMdFile(msg.document))) {
      // /convert command OR direct .md file upload
      const docId = hasDocument
        ? msg.document!.file_id
        : replyDoc
        ? msg.reply_to_message!.document!.file_id
        : null;
      const docName = hasDocument
        ? msg.document!.file_name ?? "input.md"
        : replyDoc
        ? msg.reply_to_message!.document!.file_name ?? "input.md"
        : "input.md";
      if (!docId) {
        await sendError(env, chatId, "Reply ke file .md atau kirim .md untuk /convert");
        return;
      }
      await handleConvert(env, chatId, docId, docName);
    } else {
      await sendError(
        env,
        chatId,
        "Unknown command. Send /help untuk lihat daftar perintah."
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(env, "handlers", `unhandled error: ${msg}`);
    await sendError(env, chatId, `Internal error: ${msg}`);
  }
}

// ─── /ocr: photo → VLM → LLM → .md ─────────────────────────────

async function handleOcr(env: Env, chatId: string, photoFileId: string): Promise<void> {
  logger.info(env, "handlers", "/ocr — downloading photo from Telegram");

  // Step 1: Get file path from Telegram
  const fileMeta = (await fetch(
    `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${photoFileId}`
  ).then((r) => r.json())) as TelegramGetFileResponse;
  const filePath = fileMeta?.result?.file_path;
  if (!filePath) {
    await sendError(env, chatId, "Gagal ambil file dari Telegram (getFile API)");
    return;
  }

  // Step 2: Download photo bytes
  const photoResp = await fetch(
    `${CONFIG.TELEGRAM_API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );
  if (!photoResp.ok) {
    await sendError(env, chatId, `Gagal download foto: ${photoResp.status}`);
    return;
  }
  const photoBuf = await photoResp.arrayBuffer();
  const photoBase64 = arrayBufferToBase64(photoBuf);
  const mimeType = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  await incrementQuota(env, "telegram");

  // Step 3: Gemini VLM OCR
  let mdText: string;
  let vlmModel: string;
  let vlmConfidence: number;
  try {
    const vlmResult = await runVlmOcr(env, photoBase64, mimeType);
    mdText = vlmResult.text;
    vlmModel = vlmResult.model;
    vlmConfidence = vlmResult.confidence;
    await incrementQuota(env, "gemini");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await handleVlmFailure(env, chatId, photoBase64, mimeType, msg);
    await logRun(env, "failure", `/ocr VLM failed: ${msg}`);
    return;
  }

  // Step 4: LLM fix (only if text looks like Info Lengger)
  let llmApplied = false;
  if (looksLikeInfoLengger(mdText)) {
    const llmResult = await runLlmFix(env, mdText);
    mdText = llmResult.text;
    llmApplied = llmResult.applied;
    await incrementQuota(env, "glm");
  }

  // Step 5: Send result
  if (!mdText.trim()) {
    await sendError(env, chatId, "OCR hasil kosong. Coba foto lain atau /help.");
    await logRun(env, "failure", "/ocr empty result");
    return;
  }

  await sendMdAsText(env, chatId, mdText);
  await sendMdAsFile(env, chatId, mdText);

  await logRun(
    env,
    "success",
    `/ocr: VLM=${vlmModel} (${vlmConfidence}%) LLM=${llmApplied ? "applied" : "skipped"}`
  );
  logger.info(env, "handlers", "/ocr pipeline complete", {
    mdLen: mdText.length,
    llmApplied,
  });
}

// ─── /convert: .md file → .xlsx ────────────────────────────────

async function handleConvert(
  env: Env,
  chatId: string,
  docFileId: string,
  docName: string
): Promise<void> {
  logger.info(env, "handlers", `/convert — downloading .md: ${docName}`);

  // Download .md file
  const fileMeta = (await fetch(
    `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${docFileId}`
  ).then((r) => r.json())) as TelegramGetFileResponse;
  const filePath = fileMeta?.result?.file_path;
  if (!filePath) {
    await sendError(env, chatId, "Gagal ambil file .md dari Telegram");
    return;
  }

  const mdResp = await fetch(
    `${CONFIG.TELEGRAM_API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );
  if (!mdResp.ok) {
    await sendError(env, chatId, `Gagal download .md: ${mdResp.status}`);
    return;
  }
  const mdText = await mdResp.text();
  await incrementQuota(env, "telegram");

  // Convert via existing parser
  try {
    const { buffer, rows, warnings } = await convertMdToXlsx(mdText, docName);
    const xlsxName = docName.replace(/\.(md|csv)$/i, "") + ".xlsx";
    await sendXlsxFile(env, chatId, buffer, xlsxName);
    await logRun(
      env,
      "success",
      `/convert: ${rows} rows${warnings.length > 0 ? ` (${warnings.length} warnings)` : ""}`
    );
    logger.info(env, "handlers", "/convert complete", { rows, xlsxName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sendError(env, chatId, `Konversi gagal: ${msg}`);
    await logRun(env, "failure", `/convert: ${msg}`);
  }
}

// ─── /init: set bot commands menu (one-time setup) ─────────────

/** Call Telegram setMyCommands to populate the "/" command menu. */
async function handleInit(env: Env, chatId: string): Promise<void> {
  const commands = [
    { command: "ocr", description: "Reply to a photo: run Gemini VLM → reply .md" },
    { command: "convert", description: "Reply to a .md file: convert to .xlsx" },
    { command: "today", description: "Reminder: screenshot today's IG post" },
    { command: "status", description: "Show bot health and API quotas" },
    { command: "help", description: "Show all commands" },
    { command: "init", description: "Setup bot command menu (run once after deploy)" },
  ];

  const resp = await fetch(
    `${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    }
  );
  const result = (await resp.json()) as { ok: boolean; description?: string; result?: unknown };

  if (result.ok) {
    await sendMdAsText(
      env,
      chatId,
      `✅ *Bot menu initialized!*\n\nKetik \`/\` di chat untuk lihat command autocomplete:\n${commands
        .map((c) => `  • /${c.command} — ${c.description}`)
        .join("\n")}`
    );
    await logRun(env, "success", "/init: setMyCommands OK");
  } else {
    await sendError(env, chatId, `setMyCommands failed: ${JSON.stringify(result)}`);
    await logRun(env, "failure", `/init: setMyCommands failed: ${JSON.stringify(result)}`);
  }
}

// ─── /today: reminder (v1 — manual; v1.2 will auto-scrape) ────

async function handleToday(env: Env, chatId: string): Promise<void> {
  const text =
    `📸 *Reminder: screenshot today's Info Lengger*\n\n` +
    `1. Buka Instagram @${CONFIG.IG_TARGET}\n` +
    `2. Cari post yang di-pin (paling atas, ada icon pin)\n` +
    `3. Screenshot foto-nya\n` +
    `4. Kirim foto ke chat ini\n` +
    `5. Bot balas dengan .md (VLM OCR + typo fix)\n\n` +
    `*Future v1.2:* auto-scrape ke IG tiap 15:00 WIB — tinggal tunggu .md masuk.`;

  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    }),
  });

  await logRun(env, "success", "/today reminder sent");
}

// ─── Helpers ───────────────────────────────────────────────────

/** Convert ArrayBuffer to base64 string. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Check if a Telegram document is a .md file. */
function isMdFile(doc: NonNullable<TelegramUpdate["message"]>["document"]): boolean {
  if (!doc) return false;
  const name = (doc.file_name ?? "").toLowerCase();
  const mime = (doc.mime_type ?? "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown") || mime === "text/markdown";
}
