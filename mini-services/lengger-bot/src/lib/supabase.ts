/**
 * Supabase integration — OPTIONAL.
 *
 * If SUPABASE_URL + SUPABASE_SERVICE_KEY are set:
 *   - Upload photos to Supabase Storage bucket `lengger-photos`
 *   - Insert daily raw md + meta into Supabase Database table `bot_daily_raw`
 *
 * If not set: skip (local storage only, as before).
 *
 * Setup: see README.md "Connect Supabase" section.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const BUCKET_NAME = "lengger-photos";
export const TABLE_NAME = "bot_daily_raw";

export interface SupabaseRecord {
  date: string;
  run_at: string;
  photo_count: number;
  location_count: number;
  telegram_report: string;
  source: string;
  source_url: string | null;
  raw_md: string;
  photo_paths: string[]; // paths in the Supabase Storage bucket
}

/**
 * Upload a single photo to Supabase Storage.
 * Returns the storage path (e.g. "2026-09-22/2026-09-22.jpeg") or null on failure.
 */
export async function uploadPhoto(
  date: string,
  filename: string,
  buffer: Buffer
): Promise<string | null> {
  const supa = getClient();
  if (!supa) return null;
  const path = `${date}/${filename}`;
  const { error } = await supa.storage
    .from(BUCKET_NAME)
    .upload(path, buffer, {
      contentType: filename.endsWith(".png") ? "image/png" : "image/jpeg",
      upsert: true,
    });
  if (error) {
    console.warn(`[supabase] photo upload failed for ${path}: ${error.message}`);
    return null;
  }
  console.log(`[supabase] ✓ Photo uploaded: ${path}`);
  return path;
}

/**
 * Insert (or upsert) the daily record into the `bot_daily_raw` table.
 */
export async function upsertRecord(rec: SupabaseRecord): Promise<boolean> {
  const supa = getClient();
  if (!supa) return false;
  const { error } = await supa.from(TABLE_NAME).upsert(rec, { onConflict: "date" });
  if (error) {
    console.warn(`[supabase] record upsert failed for ${rec.date}: ${error.message}`);
    return false;
  }
  console.log(`[supabase] ✓ Record upserted: ${rec.date}`);
  return true;
}

/** Check if Supabase is configured (env vars set). */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}
