/**
 * Daily pipeline — orchestrates the bot's daily run for a given date.
 *
 * Steps:
 *   1. Pick sample flyer for `date` (or fallback to latest)
 *   2. Copy to storage/YYYY-MM-DD/photos/YYYY-MM-DD.png
 *   3. VLM OCR the photo → raw text
 *   4. LLM typo fix → cleaned md
 *   5. Count locations (entries with N_ prefix)
 *   6. Save YYYY-MM-DD-raw.md, photos, meta.json
 *   7. Send Telegram report ("hari ini DD bulan ada N lokasi")
 *
 * Returns the day's metadata.
 */

import { ocrPhoto } from "./vlm.js";
import { fixTypos } from "./llm.js";
import { sendTelegramReport } from "./telegram.js";
import {
  ensureStorageDir,
  pickSampleFlyer,
  savePhoto,
  saveRawMd,
  writeMeta,
  readMeta,
  type DayMeta,
} from "./storage.js";
import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";

export interface PipelineResult {
  ok: boolean;
  meta: DayMeta | null;
  error?: string;
}

/** Count "entries" in the raw md (lines starting with N_). */
function countLocations(mdText: string): number {
  const matches = mdText.match(/^\s*\d+_/gm);
  return matches ? matches.length : 0;
}

export async function runDailyPipeline(date: string): Promise<PipelineResult> {
  await ensureStorageDir();
  console.log(`[pipeline] Running daily pipeline for ${date}`);

  // 1. Pick sample flyer
  const flyerPath = await pickSampleFlyer(date);
  if (!flyerPath) {
    const msg = `No sample flyer available for ${date}. Run \`bun run gen-flyers\` first.`;
    console.error(`[pipeline] ${msg}`);
    return { ok: false, meta: null, error: msg };
  }

  const isExact = basename(flyerPath).startsWith(date);
  const sourceLabel = isExact ? "sample-flyer" : "sample-flyer-fallback";

  // 2. Copy flyer photo to storage
  const photoExt = extname(flyerPath) || ".png";
  const photoName = `${date}${photoExt}`;
  const buffer = await readFile(flyerPath);
  await savePhoto(date, photoName, buffer);
  console.log(`[pipeline] Saved photo: ${photoName} (${buffer.length} bytes)`);

  // 3. VLM OCR
  console.log(`[pipeline] VLM OCR on ${flyerPath}...`);
  const ocr = await ocrPhoto(flyerPath);
  if (!ocr.ok || !ocr.text) {
    const errMsg = `VLM OCR failed: ${ocr.error || "empty result"}`;
    console.error(`[pipeline] ${errMsg}`);
    // Still create a placeholder raw md + meta so the user knows it ran
    const placeholder = `Info Lengger ${date}\n\n; kelengkapan: tidak_ada\n; catatan_gap: ${errMsg}\n`;
    await saveRawMd(date, placeholder);
    const meta: DayMeta = {
      date,
      runAt: new Date().toISOString(),
      photoCount: 1,
      locationCount: 0,
      telegramReport: `hari ini ${date} — OCR gagal (${errMsg.slice(0, 100)})`,
      hasFinal: false,
      source: sourceLabel,
      ocrRawText: "",
    };
    await writeMeta(date, meta);
    return { ok: false, meta, error: errMsg };
  }

  console.log(`[pipeline] VLM OCR OK (${ocr.text.length} chars)`);

  // 4. LLM typo fix
  console.log(`[pipeline] LLM typo fix...`);
  const fix = await fixTypos(ocr.text);
  const finalText = fix.ok ? fix.text : ocr.text;
  if (!fix.ok) {
    console.warn(`[pipeline] LLM fix failed (${fix.error}); using raw OCR text`);
  } else {
    console.log(`[pipeline] LLM fix OK (${finalText.length} chars)`);
  }

  // 5. Save raw md (the LLM-fixed version)
  await saveRawMd(date, finalText);

  // 6. Count locations
  const locationCount = countLocations(finalText);
  console.log(`[pipeline] ${locationCount} locations detected`);

  // 7. Send Telegram report
  const { reportText, result: tgResult } = await sendTelegramReport(
    date,
    locationCount,
    `(sumber: ${sourceLabel})`
  );
  if (!tgResult.delivered) {
    console.warn(`[pipeline] Telegram report not delivered: ${tgResult.error}`);
  }

  // 8. Update meta.json
  const existing = await readMeta(date);
  const meta: DayMeta = {
    date,
    runAt: new Date().toISOString(),
    photoCount: 1,
    locationCount,
    telegramReport: reportText,
    hasFinal: existing?.hasFinal ?? false,
    finalSavedAt: existing?.finalSavedAt,
    source: sourceLabel,
    ocrRawText: ocr.text,
  };
  await writeMeta(date, meta);

  console.log(`[pipeline] ✓ Done for ${date}: ${locationCount} locations`);
  return { ok: true, meta };
}
