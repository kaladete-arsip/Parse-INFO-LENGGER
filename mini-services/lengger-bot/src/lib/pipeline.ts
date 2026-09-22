/**
 * Daily pipeline — orchestrates the bot's daily run for a given date.
 *
 * REAL TikTok downloader — no more fake flyers.
 *
 * Steps:
 *   1. Find the TikTok photo post for `date` (search @wonosobonyawijiingseni's
 *      recent posts for one titled "Info Lengger <Day>, <DD> <Month> <YYYY>")
 *      — OR use a specific post URL if provided (TIKTOK_POST_URL env or
 *      explicit argument).
 *   2. Download ALL photos from that post to storage/YYYY-MM-DD/photos/
 *      (full-resolution JPEGs, typically 1740x2176).
 *   3. VLM OCR each photo → raw text
 *   4. LLM typo fix → cleaned md
 *   5. Count locations (entries with N_ prefix)
 *   6. Save YYYY-MM-DD-raw.md + update meta.json
 *   7. Send Telegram report ("hari ini DD bulan ada N lokasi")
 *
 * Returns the day's metadata.
 */

import { ocrPhoto } from "./vlm.js";
import { fixTypos } from "./llm.js";
import { sendTelegramReport } from "./telegram.js";
import {
  ensureStorageDir,
  saveRawMd,
  writeMeta,
  readMeta,
  getPhotosDir,
  listPhotos,
  type DayMeta,
} from "./storage.js";
import {
  fetchPost,
  findPostByDate,
  downloadPostPhotos,
  type TiktokPost,
} from "./tiktok-source.js";
import { uploadPhoto, upsertRecord, isSupabaseConfigured } from "./supabase.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "wonosobonyawijiingseni";

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

/**
 * Strip empty field lines — e.g. "Sinden: " (no name), "Lengger: " (no name),
 * "Rombongan: " (no name), "Jam: " (no time).
 *
 * Why: non-sinden genres (WAROK, JARANAN & WAROK, TAYUB) genuinely don't have
 * a sinden — writing "Sinden: " empty is misleading. Better to omit the line
 * entirely so the parser + user knows that field is genuinely absent, not
 * "unreadable OCR".
 *
 * This is a safety net — the VLM + LLM prompts also instruct to omit empty
 * fields, but this guarantees it regardless of model behavior.
 */
function stripEmptyFieldLines(mdText: string): string {
  return mdText
    .split("\n")
    .filter((line) => {
      // Match lines like "Sinden: " or "Sinden:" with only whitespace after the colon
      const m = line.match(/^(Sinden|Rombongan|Lengger|Jam|Artise|Wiraswara):\s*$/i);
      return !m;
    })
    .join("\n");
}

/**
 * Run the daily pipeline for `date`.
 *
 * @param date ISO YYYY-MM-DD
 * @param specificPostUrl optional TikTok post URL (skip the search step)
 */
export async function runDailyPipeline(
  date: string,
  specificPostUrl?: string
): Promise<PipelineResult> {
  await ensureStorageDir();
  console.log(`[pipeline] Running daily pipeline for ${date}`);

  // 1. Find the TikTok post for this date
  let post: TiktokPost | null = null;
  try {
    if (specificPostUrl) {
      console.log(`[pipeline] Using specific post URL: ${specificPostUrl}`);
      post = await fetchPost(specificPostUrl);
    } else {
      post = await findPostByDate(TIKTOK_USERNAME, date);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] TikTok fetch failed: ${msg}`);
    return { ok: false, meta: null, error: `TikTok fetch failed: ${msg}` };
  }

  if (!post) {
    const msg = `No TikTok post found for ${date} (searched @${TIKTOK_USERNAME}'s recent posts for "Info Lengger" with that date).`;
    console.error(`[pipeline] ${msg}`);
    return { ok: false, meta: null, error: msg };
  }

  console.log(`[pipeline] Found post: "${post.title}" by ${post.authorName} (${post.imageUrls.length} photo(s))`);

  // 2. Download all photos from the post
  const savedPhotos = await downloadPostPhotos(date, post);
  if (savedPhotos.length === 0) {
    const msg = `No photos downloaded for ${date}.`;
    console.error(`[pipeline] ${msg}`);
    return { ok: false, meta: null, error: msg };
  }

  // 3. VLM OCR each photo
  const photosDir = getPhotosDir(date);
  const photoFiles = await listPhotos(date);
  let combinedOcr = "";
  for (const photoFile of photoFiles) {
    const photoPath = join(photosDir, photoFile);
    console.log(`[pipeline] VLM OCR on ${photoFile}...`);
    const ocr = await ocrPhoto(photoPath);
    if (!ocr.ok || !ocr.text) {
      console.warn(`[pipeline] OCR failed for ${photoFile}: ${ocr.error || "empty"} (skipping, will use what we have)`);
      continue;
    }
    console.log(`[pipeline] ✓ OCR OK on ${photoFile} (${ocr.text.length} chars)`);
    combinedOcr += (combinedOcr ? "\n\n" : "") + ocr.text;
  }

  if (!combinedOcr.trim()) {
    const errMsg = `VLM OCR returned empty for all photos of ${date}`;
    console.error(`[pipeline] ${errMsg}`);
    const placeholder = `Info Lengger ${date}\n\n; kelengkapan: tidak_ada\n; catatan_gap: ${errMsg}\n`;
    await saveRawMd(date, placeholder);
    const meta: DayMeta = {
      date,
      runAt: new Date().toISOString(),
      photoCount: savedPhotos.length,
      locationCount: 0,
      telegramReport: `hari ini ${date} — OCR gagal`,
      hasFinal: false,
      source: "tiktok-real",
      sourceUrl: post.postUrl,
      ocrRawText: "",
    };
    await writeMeta(date, meta);
    return { ok: false, meta, error: errMsg };
  }

  // 4. LLM typo fix
  console.log(`[pipeline] LLM typo fix on combined OCR (${combinedOcr.length} chars)...`);
  const fix = await fixTypos(combinedOcr);
  let finalText = fix.ok ? fix.text : combinedOcr;
  if (!fix.ok) {
    console.warn(`[pipeline] LLM fix failed (${fix.error}); using raw OCR text`);
  } else {
    console.log(`[pipeline] LLM fix OK (${finalText.length} chars)`);
  }

  // 4b. Safety net: strip empty field lines (e.g. "Sinden: " with no name)
  // Non-sinden genres (WAROK, JARANAN & WAROK, TAYUB) genuinely don't have a
  // sinden — don't write an empty Sinden line.
  finalText = stripEmptyFieldLines(finalText);

  // 5. Save raw md (the LLM-fixed + cleaned version)
  await saveRawMd(date, finalText);

  // 6. Count locations
  const locationCount = countLocations(finalText);
  console.log(`[pipeline] ${locationCount} locations detected`);

  // 7. Send Telegram report
  const { reportText, result: tgResult } = await sendTelegramReport(
    date,
    locationCount,
    `(sumber: TikTok @${TIKTOK_USERNAME})`
  );
  if (!tgResult.delivered) {
    console.warn(`[pipeline] Telegram report not delivered: ${tgResult.error}`);
  }

  // 8. Update meta.json (preserve hasFinal + finalSavedAt from any prior run)
  const existing = await readMeta(date);
  const meta: DayMeta = {
    date,
    runAt: new Date().toISOString(),
    photoCount: savedPhotos.length,
    locationCount,
    telegramReport: reportText,
    hasFinal: existing?.hasFinal ?? false,
    finalSavedAt: existing?.finalSavedAt,
    source: "tiktok-real",
    sourceUrl: post.postUrl,
    ocrRawText: combinedOcr,
  };
  await writeMeta(date, meta);

  // 9. OPTIONAL — sync to Supabase (if env vars configured)
  if (isSupabaseConfigured()) {
    console.log(`[pipeline] Syncing to Supabase...`);
    const photoPaths: string[] = [];
    for (const photoFile of savedPhotos) {
      const photoPath = join(getPhotosDir(date), photoFile);
      const buffer = await readFile(photoPath);
      const supaPath = await uploadPhoto(date, photoFile, buffer);
      if (supaPath) photoPaths.push(supaPath);
    }
    await upsertRecord({
      date,
      run_at: meta.runAt,
      photo_count: meta.photoCount,
      location_count: meta.locationCount,
      telegram_report: meta.telegramReport,
      source: meta.source,
      source_url: meta.sourceUrl ?? null,
      raw_md: finalText,
      photo_paths: photoPaths,
    });
  } else {
    console.log(`[pipeline] Supabase not configured (SUPABASE_URL/SUPABASE_SERVICE_KEY not set) — local storage only.`);
  }

  console.log(`[pipeline] ✓ Done for ${date}: ${locationCount} locations from real TikTok post`);
  return { ok: true, meta };
}
