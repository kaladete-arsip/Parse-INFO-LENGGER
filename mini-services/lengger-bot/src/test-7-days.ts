/**
 * Test 7 hari terakhir — download real TikTok photos + VLM OCR (strict prompt).
 *
 * For each URL:
 *   1. fetchPost(url) → get title + image URLs
 *   2. Parse date from title ("Info Lengger <Day>, <DD> <Month> <YYYY>")
 *   3. runDailyPipeline(date, url) → download photos + VLM OCR + LLM fix + save
 *
 * Sequential (VLM calls might rate-limit if parallel).
 */

import { fetchPost } from "./lib/tiktok-source.js";
import { runDailyPipeline } from "./lib/pipeline.js";

const URLS = [
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7686008575163911432",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7686381330560470280",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7686761778151197960",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7687121825578437906",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7687497584214052103",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7687862363978059016",
  "https://www.tiktok.com/@wonosobonyawijiingseni/photo/7688234635414752530",
];

const MONTHS: Record<string, string> = {
  Januari: "01", Februari: "02", Maret: "03", April: "04",
  Mei: "05", Juni: "06", Juli: "07", Agustus: "08",
  September: "09", Oktober: "10", November: "11", Desember: "12",
};

function parseDateFromTitle(title: string): string | null {
  // Title format: "Info Lengger Selasa, 22 September 2026"
  const m = title.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const monthName = m[2];
  const yyyy = m[3];
  const mm = MONTHS[monthName];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const summary: { url: string; date: string; title: string; locations: number; ok: boolean; error?: string }[] = [];

  for (let i = 0; i < URLS.length; i++) {
    const url = URLS[i];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[${i + 1}/${URLS.length}] ${url}`);
    console.log(`${"=".repeat(70)}`);

    // Step 1: Fetch post metadata to get the title (which contains the date)
    let date: string;
    let title: string;
    try {
      const post = await fetchPost(url);
      title = post.title;
      console.log(`Title: ${title}`);
      console.log(`Author: ${post.authorName}`);
      console.log(`Photos: ${post.imageUrls.length}`);
      const parsed = parseDateFromTitle(post.title);
      if (!parsed) {
        throw new Error(`Could not parse date from title: "${title}"`);
      }
      date = parsed;
      console.log(`Parsed date: ${date}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Failed to fetch post: ${msg}`);
      summary.push({ url, date: "?", title: "?", locations: 0, ok: false, error: msg });
      continue;
    }

    // Step 2: Run the full pipeline (download + VLM + LLM fix + save)
    const result = await runDailyPipeline(date, url);
    if (result.ok) {
      console.log(`✓ SUCCESS: ${date} — ${result.meta?.locationCount} locations`);
      summary.push({ url, date, title, locations: result.meta?.locationCount ?? 0, ok: true });
    } else {
      console.error(`✗ FAILED: ${date} — ${result.error}`);
      summary.push({ url, date, title, locations: 0, ok: false, error: result.error });
    }
  }

  // Print summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY — 7 days test");
  console.log(`${"=".repeat(70)}`);
  for (const s of summary) {
    const status = s.ok ? "✓" : "✗";
    const locs = s.ok ? `${s.locations} lokasi` : `ERROR: ${s.error?.slice(0, 60)}`;
    console.log(`${status} ${s.date} | ${s.title.slice(0, 50)} | ${locs}`);
  }
  const okCount = summary.filter((s) => s.ok).length;
  console.log(`\nTotal: ${okCount}/${summary.length} days processed successfully`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
