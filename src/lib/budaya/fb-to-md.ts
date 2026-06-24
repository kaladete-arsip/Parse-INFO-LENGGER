/**
 * FB scraping format → MD-equivalent converter.
 *
 * FB scraping output looks like:
 *
 *   ============================================================
 *   POST #1
 *   Author: ...
 *   Post Date: 2026-06-14
 *   Captured: 2026-06-22
 *   Source: https://...
 *   ============================================================
 *   --- RAW POST ---
 *   <actual post content — may or may not be Info Lengger>
 *   ============================================================
 *   POST #2
 *   ...
 *
 * Strategy:
 *   1. Detect FB format: file contains both `POST #` and `--- RAW POST ---` markers
 *   2. Split into post blocks
 *   3. For each post, extract the content after `--- RAW POST ---` until the next `=====` separator
 *   4. Keep only posts whose content contains `Info Lengger` (case-insensitive)
 *   5. Strip trailing FB UI noise (e.g., "MATUR NUWUN Tampilkan lebih sedikit", "Kontributor all-star", author names)
 *   6. Concatenate valid post contents with double newlines
 *   7. The result is MD-equivalent and can be parsed by parseMd (multi-day supported)
 */

/** Detect if a file is in FB scraping format. */
export function isFbFormat(text: string): boolean {
  return /POST\s*#\d+/.test(text) && /---\s*RAW\s*POST\s*---/.test(text);
}

/**
 * Convert FB scraping text to MD-equivalent.
 * Returns the original text if not FB format (so callers can fall back to plain MD parsing).
 */
export function fbToMd(text: string): string {
  if (!isFbFormat(text)) return text;

  const lines = text.split(/\r?\n/);
  const posts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Find next `--- RAW POST ---` marker
    if (/^-{3}\s*RAW\s*POST\s*-{3}\s*$/.test(lines[i].trim())) {
      i++;
      // Collect content until next `=====` separator or end of file
      const content: string[] = [];
      while (i < lines.length && !/^={5,}\s*$/.test(lines[i].trim())) {
        content.push(lines[i]);
        i++;
      }
      const postText = cleanFbPost(content.join("\n"));
      // Keep only posts that contain "Info Lengger" header
      if (postText && /info\s*lengger/i.test(postText)) {
        posts.push(postText);
      }
    } else {
      i++;
    }
  }

  return posts.join("\n\n");
}

/**
 * Clean FB post content: strip FB UI noise that leaked into the scrape.
 * Removes trailing lines like "MATUR NUWUN Tampilkan lebih sedikit",
 * author/profile info, "Kontributor all-star", "Suka Balas", etc.
 */
function cleanFbPost(text: string): string {
  // Strip trailing FB UI noise lines
  const noisePatterns = [
    /^matur\s+nuwun\s+.*$/i,
    /^tampilkan\s+lebih\s+sedi?kit\s*$/i,
    /^kontributor\s+\w+.*$/i,
    /^suka\s+balas\s*$/i,
    /^balas\s*$/i,
    /^suwun\s+wa\s*$/i,
    /^\d+\s*(hari|menit|jam)?\s*$/i, // "1hari", "1"
    /^facebook\s*$/i,
    /^·\s*$/,
    /^n\s*$/, // single letters that leaked from anti-scraping
    /^o\s*$/,
    /^p\s*$/,
    /^s\s*$/,
    /^e\s*$/,
    /^t\s*$/,
    /^r\s*$/,
    /^d\s*$/,
    /^f\s*$/,
  ];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, "")) // strip trailing whitespace
    .filter((l) => {
      const t = l.trim();
      if (!t) return true; // keep blank lines (they're separators in MD)
      return !noisePatterns.some((p) => p.test(t));
    });

  // Also strip a leading author name (the first non-empty line if it doesn't look like Info Lengger)
  // FB puts the author name at the start of the raw post — we want to skip it
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  if (lines.length > 0 && !/^info\s*lengger/i.test(lines[0].trim())) {
    // Skip leading non-Info-Lengger line (likely author name)
    lines.shift();
    // Skip any blank lines after
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }

  // Trim trailing blank lines
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  return lines.join("\n").trim();
}
