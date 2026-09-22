/**
 * Migrate local storage → Supabase (one-time backfill).
 *
 * Run AFTER you've set up Supabase (created project, run schema SQL,
 * created `lengger-photos` bucket, set SUPABASE_URL + SUPABASE_SERVICE_KEY).
 *
 * For each day in local storage/:
 *   - Upload all photos to Supabase Storage bucket `lengger-photos`
 *   - Upsert the daily record (raw_md + meta + photo_paths) to `bot_daily_raw`
 *
 * Usage: bun run src/migrate-to-supabase.ts
 *
 * If Supabase not configured → prints instructions and exits.
 */

import { uploadPhoto, upsertRecord, isSupabaseConfigured, BUCKET_NAME, TABLE_NAME } from "./lib/supabase.js";
import {
  ensureStorageDir,
  STORAGE_DIR,
  listDays,
  listPhotos,
  readRawMd,
  readMeta,
  getPhotosDir,
  type DayMeta,
} from "./lib/storage.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

async function main() {
  console.log("=".repeat(60));
  console.log("Migrate local storage → Supabase");
  console.log("=".repeat(60));

  if (!isSupabaseConfigured()) {
    console.error("\n✗ Supabase NOT configured.");
    console.error("\nTo set up:");
    console.error("  1. Create a project at https://supabase.com");
    console.error("  2. Run SQL: supabase/schema.sql + supabase/schema-bot-daily.sql (SQL Editor)");
    console.error("  3. Create Storage bucket: 'lengger-photos' (Storage → New bucket)");
    console.error("  4. Get keys: Project Settings → API → copy Project URL + service_role key");
    console.error("  5. Set in .env:");
    console.error("     SUPABASE_URL=https://xxxxx.supabase.co");
    console.error("     SUPABASE_SERVICE_KEY=eyJhbGci...");
    console.error("  6. Re-run this script: bun run src/migrate-to-supabase.ts");
    process.exit(1);
  }

  console.log(`✓ Supabase configured`);
  console.log(`  URL: ${process.env.SUPABASE_URL}`);
  console.log(`  Bucket: ${BUCKET_NAME}`);
  console.log(`  Table: ${TABLE_NAME}`);
  console.log("");

  await ensureStorageDir();
  const days = await listDays();
  if (days.length === 0) {
    console.log("No local storage days to migrate. Run the pipeline first (bun run src/test-7-days.ts or POST /api/run).");
    process.exit(0);
  }

  console.log(`Found ${days.length} day(s) to migrate:\n`);
  let totalPhotos = 0;
  let totalRecords = 0;
  let failedDays = 0;

  for (const day of days) {
    console.log(`--- ${day.date} ---`);
    const meta = await readMeta(day.date);
    if (!meta) {
      console.warn(`  ✗ No meta.json — skipping`);
      failedDays++;
      continue;
    }

    // Upload photos
    const photos = await listPhotos(day.date);
    const photoPaths: string[] = [];
    for (const photoFile of photos) {
      const photoPath = join(getPhotosDir(day.date), photoFile);
      if (!existsSync(photoPath)) continue;
      const buffer = await readFile(photoPath);
      const supaPath = await uploadPhoto(day.date, photoFile, buffer);
      if (supaPath) {
        photoPaths.push(supaPath);
        totalPhotos++;
      }
    }
    console.log(`  Photos: ${photoPaths.length}/${photos.length} uploaded`);

    // Read raw md
    const rawMd = await readRawMd(day.date);
    if (!rawMd) {
      console.warn(`  ✗ No raw.md — skipping record upsert`);
      failedDays++;
      continue;
    }

    // Upsert record
    const ok = await upsertRecord({
      date: day.date,
      run_at: meta.runAt,
      photo_count: meta.photoCount,
      location_count: meta.locationCount,
      telegram_report: meta.telegramReport,
      source: meta.source,
      source_url: meta.sourceUrl ?? null,
      raw_md: rawMd,
      photo_paths: photoPaths,
    });
    if (ok) {
      totalRecords++;
      console.log(`  Record: ✓ upserted (${meta.locationCount} locations)`);
    } else {
      console.warn(`  ✗ Record upsert failed`);
      failedDays++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`MIGRATION COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Days migrated: ${days.length - failedDays}/${days.length}`);
  console.log(`  Photos uploaded: ${totalPhotos}`);
  console.log(`  Records upserted: ${totalRecords}`);
  console.log(`\nCheck your Supabase dashboard:`);
  console.log(`  Table Editor → ${TABLE_NAME} → ${totalRecords} rows`);
  console.log(`  Storage → ${BUCKET_NAME} → ${totalPhotos} files in date folders`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
