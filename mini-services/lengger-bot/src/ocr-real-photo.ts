/**
 * One-off script: VLM OCR a real photo + LLM fix + save to storage.
 * Usage: bun run src/ocr-real-photo.ts <date>
 *
 * Reads storage/<date>/photos/<date>.jpeg (or .png) → VLM OCR → LLM fix
 * → saves storage/<date>/<date>-raw.md + updates meta.json.
 */

import { ocrPhoto } from "./lib/vlm.js";
import { fixTypos } from "./lib/llm.js";
import { listPhotos, saveRawMd, readMeta, writeMeta, getPhotosDir, type DayMeta } from "./lib/storage.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sendTelegramReport } from "./lib/telegram.js";

const date = process.argv[2] || "2026-09-22";

async function main() {
  const photosDir = getPhotosDir(date);
  if (!existsSync(photosDir)) {
    console.error(`No photos dir for ${date}. Run download first.`);
    process.exit(1);
  }
  const photos = await listPhotos(date);
  if (photos.length === 0) {
    console.error(`No photos in ${photosDir}`);
    process.exit(1);
  }

  console.log(`[ocr-real] Found ${photos.length} photo(s) for ${date}:`);
  for (const p of photos) console.log(`  - ${p}`);

  // OCR each photo (usually 1 for single post, more for carousel)
  let combinedText = "";
  for (let i = 0; i < photos.length; i++) {
    const photoPath = join(photosDir, photos[i]);
    console.log(`\n[ocr-real] VLM OCR on ${photos[i]}...`);
    const ocr = await ocrPhoto(photoPath);
    if (!ocr.ok) {
      console.error(`[ocr-real] OCR failed for ${photos[i]}: ${ocr.error}`);
      continue;
    }
    console.log(`[ocr-real] ✓ OCR OK (${ocr.text.length} chars)`);
    console.log("--- RAW OCR OUTPUT (first 500 chars) ---");
    console.log(ocr.text.slice(0, 500));
    console.log("--- END RAW OCR ---");
    combinedText += (i > 0 ? "\n\n" : "") + ocr.text;
  }

  if (!combinedText.trim()) {
    console.error("[ocr-real] All OCRs failed");
    process.exit(1);
  }

  // LLM typo fix
  console.log(`\n[ocr-real] LLM typo fix...`);
  const fix = await fixTypos(combinedText);
  const finalText = fix.ok ? fix.text : combinedText;
  console.log(`[ocr-real] LLM fix ${fix.ok ? "OK" : "FAILED (kept raw)"} (${finalText.length} chars)`);

  // Save raw md (overwrite the fake one)
  await saveRawMd(date, finalText);
  console.log(`[ocr-real] ✓ Saved ${date}-raw.md`);

  // Count locations (lines starting with N_)
  const locationCount = (finalText.match(/^\s*\d+_/gm) || []).length;

  // Telegram report
  const { reportText, result: tgResult } = await sendTelegramReport(date, locationCount, "(sumber: TikTok real)");
  console.log(`[ocr-real] Telegram: ${reportText.replace(/\n/g, " | ")} (delivered: ${tgResult.delivered})`);

  // Update meta.json
  const existing = await readMeta(date);
  const meta: DayMeta = {
    date,
    runAt: new Date().toISOString(),
    photoCount: photos.length,
    locationCount,
    telegramReport: reportText,
    hasFinal: existing?.hasFinal ?? false,
    finalSavedAt: existing?.finalSavedAt,
    source: "tiktok-real",
    sourceUrl: "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7688234635414752530",
    ocrRawText: combinedText,
  };
  await writeMeta(date, meta);
  console.log(`[ocr-real] ✓ Updated meta.json`);
  console.log(`[ocr-real] ✓ DONE: ${locationCount} locations detected from real TikTok photo`);
}

main().catch((err) => {
  console.error("[ocr-real] FATAL:", err);
  process.exit(1);
});
