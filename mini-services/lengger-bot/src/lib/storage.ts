/**
 * Storage helpers — read/write daily YYYY-MM-DD folders.
 *
 * Layout:
 *   storage/
 *     2026-09-22/
 *       2026-09-22-raw.md       (auto-generated: VLM OCR + LLM typo fix)
 *       2026-09-22-final.md     (user-edited with narrative; created on save)
 *       meta.json               (run time, photo count, location count, telegram report)
 *       photos/
 *         2026-09-22.png        (original photo, copied from sample-flyers/)
 *         (more if multi-slide carousel)
 */

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
export const STORAGE_DIR = join(ROOT, "storage");
export const SAMPLE_FLYERS_DIR = join(ROOT, "sample-flyers");

export interface DayMeta {
  date: string; // ISO YYYY-MM-DD
  runAt: string; // ISO timestamp
  photoCount: number;
  locationCount: number;
  telegramReport: string;
  hasFinal: boolean;
  finalSavedAt?: string;
  source: string; // "sample-flyer" | "tiktok" | "manual"
  sourceUrl?: string;
  ocrRawText?: string; // raw VLM output before LLM fix (for diff/debug)
}

export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.mkdir(SAMPLE_FLYERS_DIR, { recursive: true });
}

export function getDayDir(date: string): string {
  return join(STORAGE_DIR, date);
}

export function getPhotosDir(date: string): string {
  return join(getDayDir(date), "photos");
}

export function getRawMdPath(date: string): string {
  return join(getDayDir(date), `${date}-raw.md`);
}

export function getFinalMdPath(date: string): string {
  return join(getDayDir(date), `${date}-final.md`);
}

export function getMetaPath(date: string): string {
  return join(getDayDir(date), "meta.json");
}

export async function listDays(): Promise<DayMeta[]> {
  await ensureStorageDir();
  const entries = await fs.readdir(STORAGE_DIR, { withFileTypes: true });
  const days: DayMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const meta = await readMeta(entry.name);
    if (meta) days.push(meta);
  }
  days.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  return days;
}

export async function readMeta(date: string): Promise<DayMeta | null> {
  const path = getMetaPath(date);
  if (!existsSync(path)) return null;
  try {
    const text = await fs.readFile(path, "utf-8");
    return JSON.parse(text) as DayMeta;
  } catch {
    return null;
  }
}

export async function writeMeta(date: string, meta: DayMeta): Promise<void> {
  await fs.mkdir(getDayDir(date), { recursive: true });
  await fs.writeFile(getMetaPath(date), JSON.stringify(meta, null, 2), "utf-8");
}

export async function saveRawMd(date: string, content: string): Promise<void> {
  await fs.mkdir(getDayDir(date), { recursive: true });
  await fs.writeFile(getRawMdPath(date), content, "utf-8");
}

export async function saveFinalMd(date: string, content: string): Promise<void> {
  await fs.mkdir(getDayDir(date), { recursive: true });
  await fs.writeFile(getFinalMdPath(date), content, "utf-8");
}

export async function readRawMd(date: string): Promise<string | null> {
  const path = getRawMdPath(date);
  if (!existsSync(path)) return null;
  return await fs.readFile(path, "utf-8");
}

export async function readFinalMd(date: string): Promise<string | null> {
  const path = getFinalMdPath(date);
  if (!existsSync(path)) return null;
  return await fs.readFile(path, "utf-8");
}

export async function listPhotos(date: string): Promise<string[]> {
  const dir = getPhotosDir(date);
  if (!existsSync(dir)) return [];
  const files = await fs.readdir(dir);
  return files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).sort();
}

export async function savePhoto(
  date: string,
  filename: string,
  buffer: Buffer
): Promise<void> {
  await fs.mkdir(getPhotosDir(date), { recursive: true });
  await fs.writeFile(join(getPhotosDir(date), filename), buffer);
}

export function getPhotoPath(date: string, filename: string): string {
  return join(getPhotosDir(date), filename);
}

/** Pick the sample flyer PNG matching `date`, else fall back to the latest one. */
export async function pickSampleFlyer(date: string): Promise<string | null> {
  await ensureStorageDir();
  if (!existsSync(SAMPLE_FLYERS_DIR)) return null;
  const files = await fs.readdir(SAMPLE_FLYERS_DIR);
  const pngs = files.filter((f) => /\.png$/i.test(f)).sort();
  if (pngs.length === 0) return null;

  // Exact match
  const exact = pngs.find((f) => f.startsWith(date));
  if (exact) return join(SAMPLE_FLYERS_DIR, exact);

  // Fallback: latest available (with note in meta)
  return join(SAMPLE_FLYERS_DIR, pngs[pngs.length - 1]);
}
