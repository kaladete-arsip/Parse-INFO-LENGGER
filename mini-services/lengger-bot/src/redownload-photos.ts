/**
 * Re-download photos for existing storage days (no VLM re-run — no halu).
 * Reads sourceUrl from each day's meta.json, fetches the TikTok post,
 * downloads all photos to storage/<date>/photos/.
 *
 * Use when storage photos got deleted but raw.md + meta.json are intact.
 *
 * Usage: bun run src/redownload-photos.ts
 */

import { readMeta } from "./lib/storage.js";
import { fetchPost, downloadPostPhotos } from "./lib/tiktok-source.js";
import { readdir } from "node:fs/promises";

const STORAGE_DIR = new URL("../storage/", import.meta.url).pathname;

async function main() {
  const days = (await readdir(STORAGE_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  console.log(`Re-downloading photos for ${days.length} day(s)...`);
  let total = 0;
  for (const date of days) {
    const meta = await readMeta(date);
    if (!meta?.sourceUrl) {
      console.log(`${date}: no sourceUrl — skip`);
      continue;
    }
    console.log(`${date}: fetching ${meta.sourceUrl.slice(-25)}`);
    try {
      const post = await fetchPost(meta.sourceUrl);
      const saved = await downloadPostPhotos(date, post);
      total += saved.length;
      console.log(`  ✓ ${saved.length} photo(s): ${saved.join(", ")}`);
    } catch (err) {
      console.warn(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`---DONE: ${total} photos re-downloaded---`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
