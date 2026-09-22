/**
 * FB scraping format → MD-equivalent converter.
 *
 * Supports the EXTENDED FB scraping format with:
 *   - Metadata block (Author, Post Date, Captured, Source, Photos)
 *   - Optional `--- Event Info ---` block (Event Date, Event Date Raw, Event Location)
 *   - `--- RAW POST ---` marker followed by actual post content
 *
 * FB scraping output structure:
 *
 *   ============================================================
 *   POST #1
 *   Author: ...
 *   Post Date: YYYY-MM-DD              (optional)
 *   --- Event Info ---                 (optional block)
 *   Event Date: YYYY-MM-DD
 *   Event Date Raw: Info Lengger <Day>, DD Month YYYY
 *   Event Location: 1_<dusun>, <desa> Kec: X Kab: Y
 *   Captured: YYYY-MM-DD
 *   Source: https://www.facebook.com/...     ← THE SOURCE URL (per-post)
 *   Photos: N                               (optional)
 *     Photo_...: https://...                (optional, per-photo URLs)
 *   ============================================================
 *   --- RAW POST ---
 *   <actual post content — may have anti-scraping noise + Info Lengger text>
 *   ============================================================
 *   POST #2
 *   ...
 *
 * Strategy:
 *   1. Detect FB format: file contains both `POST #` and `--- RAW POST ---` markers
 *   2. Walk line-by-line, accumulating metadata lines between `POST #N` and `--- RAW POST ---`
 *   3. Parse metadata to extract: Source URL, Event Date Raw, Event Location
 *   4. Extract content after `--- RAW POST ---` until next `=====`
 *   5. Clean FB UI noise from raw content (existing cleanFbPost)
 *   6. Keep post if cleaned raw content has "Info Lengger" OR metadata has
 *      Event Date Raw with "Info Lengger"
 *   7. Construct MD-equivalent:
 *      - If raw content has Info Lengger: use cleaned raw content
 *      - Else (raw is noise): construct from Event Date Raw + Event Location
 *      - APPEND `Sumber : <source_url>` so parser assigns it to all entries in this post
 *   8. Concatenate valid posts with double newlines → MD-equivalent for parseMd
 *
 * The key fix vs. original: the `Source:` URL from metadata is now preserved as
 * a `Sumber :` line in the MD output, so the parser's existing sumber-detection
 * logic picks it up and assigns it to all rows in that post's section.
 */

/** Detect if a file is in FB scraping format. */
export function isFbFormat(text: string): boolean {
  return /POST\s*#\d+/.test(text) && /---\s*RAW\s*POST\s*---/.test(text);
}

interface FbPostMetadata {
  /** Source URL (from `Source:` line in metadata). */
  source: string | null;
  /** "Info Lengger <Day>, DD Month YYYY" (from `Event Date Raw:` line). */
  eventDateRaw: string | null;
  /** "1_<dusun>, <desa> Kec: X Kab: Y" (from `Event Location:` line). */
  eventLocation: string | null;
}

/**
 * Parse metadata lines (between `POST #N` and `--- RAW POST ---`) to extract
 * Source URL, Event Date Raw, and Event Location.
 */
function parseMetadata(metaLines: string[]): FbPostMetadata {
  let source: string | null = null;
  let eventDateRaw: string | null = null;
  let eventLocation: string | null = null;

  for (const ln of metaLines) {
    const trimmed = ln.trim();
    let m: RegExpMatchArray | null;
    if ((m = trimmed.match(/^Source:\s*(.+)$/i))) {
      source = m[1].trim();
    } else if ((m = trimmed.match(/^Event Date Raw:\s*(.+)$/i))) {
      eventDateRaw = m[1].trim();
    } else if ((m = trimmed.match(/^Event Location:\s*(.+)$/i))) {
      eventLocation = m[1].trim();
    }
  }

  return { source, eventDateRaw, eventLocation };
}

/**
 * Convert a Facebook PHOTO URL to a POST URL.
 *
 * The FB scraper captures `Source: https://www.facebook.com/photo/?fbid=PHOTO_ID&set=gm.POST_ID&idorvanity=GROUP_ID...`
 * which points to 1 specific photo. But the user wants the POST URL (which
 * contains all photos + caption text). We extract POST_ID and GROUP_ID from
 * the URL parameters and construct:
 *   https://www.facebook.com/groups/GROUP_ID/posts/POST_ID
 *
 * Handles:
 *   - `set=gm.XXX` (group media post) → strip "gm." prefix
 *   - `set=pcb.XXX` (photo custom board) → strip "pcb." prefix
 *   - `idorvanity=GROUP_ID` → group ID
 *   - URLs that are already group/post URLs → keep as-is
 *   - GROUP URLs (no fbid) → keep as-is (can't determine specific post)
 */
function photoUrlToPostUrl(sourceUrl: string): string {
  // Only transform photo URLs (contain /photo/?fbid=)
  if (!sourceUrl.includes("/photo/?fbid=") && !sourceUrl.includes("/photo.php?fbid=")) {
    return sourceUrl; // Already a group/post URL, keep as-is
  }

  // Extract POST_ID from set=gm.XXX or set=pcb.XXX or set=a.XXX
  const setMatch = sourceUrl.match(/set=(?:gm|pcb|a)\.(\d+)/);
  const postId = setMatch?.[1];
  if (!postId) {
    // Can't extract post ID — return original photo URL as fallback
    return sourceUrl;
  }

  // Extract GROUP_ID from idorvanity=GROUP_ID
  const groupMatch = sourceUrl.match(/idorvanity=(\d+)/);
  const groupId = groupMatch?.[1];

  // If we have both post ID and group ID → construct post URL
  if (groupId) {
    return `https://www.facebook.com/groups/${groupId}/posts/${postId}`;
  }

  // Fallback: use permalink format with just post ID
  return `https://www.facebook.com/permalink.php?story_fbid=${postId}`;
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

  // Metadata accumulator — lines between `POST #N` and `--- RAW POST ---`.
  // Reset whenever we see a new `POST #N` marker.
  let metaLines: string[] = [];

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Reset metadata accumulator at the start of each post.
    // `POST #N` marks the beginning of a new post's metadata block.
    if (/^POST\s*#\d+/.test(trimmed)) {
      metaLines = [];
      i++;
      continue;
    }

    // Detect `--- RAW POST ---` marker — time to process this post.
    if (/^-{3}\s*RAW\s*POST\s*-{3}\s*$/.test(trimmed)) {
      // Parse the accumulated metadata (Source, Event Date Raw, Event Location)
      const meta = parseMetadata(metaLines);

      i++;
      // Collect raw content until next `=====` separator (5+ equals) or end of file
      const content: string[] = [];
      while (i < lines.length && !/^={5,}\s*$/.test(lines[i].trim())) {
        content.push(lines[i]);
        i++;
      }
      const rawText = cleanFbPost(content.join("\n"));

      // Determine if this post is an Info Lengger post:
      //   - Cleaned raw content contains "Info Lengger" header, OR
      //   - Metadata has Event Date Raw containing "Info Lengger"
      // (The latter handles posts where the raw content is pure anti-scraping
      // noise like "Facebook" repeated 30 times, but the metadata has the
      // structured event info.)
      const hasInRaw = /info\s*lengger/i.test(rawText);
      const hasInMeta =
        meta.eventDateRaw != null && /info\s*lengger/i.test(meta.eventDateRaw);

      if (hasInRaw || hasInMeta) {
        let md: string;
        if (hasInRaw) {
          // Raw content has the full Info Lengger text (entries, Lengger:, Sinden:,
          // Romb, quote markers, etc.) — use it verbatim.
          md = rawText;
        } else {
          // Raw content is noise; construct MD skeleton from metadata.
          // This produces a minimal valid entry that the parser can process.
          md = meta.eventDateRaw ?? "";
          if (meta.eventLocation) {
            md = md ? `${md}\n${meta.eventLocation}` : meta.eventLocation;
          }
        }

        // ALWAYS append the Source URL as a "Sumber :" line so the parser's
        // existing sumber-detection logic picks it up and assigns it to all
        // entries in this post's section.
        //
        // IMPORTANT: Convert PHOTO URL → POST URL.
        // The FB scraper captures `Source: https://www.facebook.com/photo/?fbid=PHOTO_ID&set=gm.POST_ID...`
        // which points to 1 specific photo. But the user wants the POST URL
        // (which contains all photos + caption). We extract the POST_ID from
        // `set=gm.XXX` or `set=pcb.XXX` and construct:
        //   https://www.facebook.com/groups/GROUP_ID/posts/POST_ID
        const sumberUrl = meta.source ? photoUrlToPostUrl(meta.source) : null;
        if (sumberUrl) {
          md = `${md}\nSumber : ${sumberUrl}`;
        }

        if (md.trim()) {
          posts.push(md);
        }
      }

      // Reset metadata accumulator for the next post
      metaLines = [];
    } else {
      // Accumulate metadata lines (between POST #N and --- RAW POST ---).
      // Lines outside this range (e.g. ===== separators after raw content)
      // also get accumulated but are ignored — they're reset at next POST #N.
      metaLines.push(lines[i]);
    }
    i++;
  }

  return posts.join("\n\n");
}

/**
 * Clean FB post content: strip FB UI noise that leaked into the scrape.
 * Removes trailing lines like "MATUR NUWUN Tampilkan lebih sedikit",
 * author/profile info, "Kontributor all-star", "Suka Balas", repeated
 * "Facebook" anti-scraping noise, single letters, etc.
 */
function cleanFbPost(text: string): string {
  // Strip trailing FB UI noise lines
  const noisePatterns = [
    /^matur\s+nuwun\s+.*$/i,
    /^maturnuwun\s+.*$/i,
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

  // Strip a leading author name (the first non-empty line if it doesn't look
  // like Info Lengger). FB puts the author name at the start of the raw post —
  // we want to skip it. Repeat until we hit an Info Lengger header or empty.
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (
    lines.length > 0 &&
    lines[0].trim() &&
    !/^info\s*lengger/i.test(lines[0].trim()) &&
    !/^\d+_/.test(lines[0].trim())
  ) {
    // Skip leading non-Info-Lengger, non-entry-header line (author name, etc.)
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
  }

  // Trim trailing blank lines
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  return lines.join("\n").trim();
}
