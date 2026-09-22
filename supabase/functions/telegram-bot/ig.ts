/**
 * IG Downloader — fetch post page, extract full res image (1080px, no crop).
 *
 * Trick: IG post HTML has ~28 scontent URLs. og:image = 640x640 CROPPED.
 * But there's another URL with same photo ID but WITHOUT c216 crop = full res.
 *
 * Tested: 1080x1350 WebP, 178KB, VLM OCR 6/6 entries 100% accurate.
 */

/** Extract shortcode from Instagram URL. */
export function extractShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Fetch IG post page HTML (no login needed). */
async function fetchPostPage(shortcode: string): Promise<string> {
  const url = `https://www.instagram.com/p/${shortcode}/`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`IG fetch failed: ${resp.status}`);
  return await resp.text();
}

/** Find full resolution image URL (without c216 crop). */
function extractFullResUrl(html: string): string | null {
  // Find ALL scontent URLs
  const allUrls = html.match(/https:\/\/scontent[^"'\s]+/g) || [];
  const seen = new Set<string>();

  for (const u of allUrls) {
    const clean = u.replace(/&amp;/g, "&");
    // Skip: cropped (c216), small (s640x640, s150x150), non-photo
    if (clean.includes("c216") || clean.includes("s640x640") || clean.includes("s150x150")) {
      continue;
    }
    // Skip: avatars, icons (not from t51.82787-15 = photo)
    if (!clean.includes("82787-15") && !clean.includes("82787-19")) {
      continue;
    }
    if (seen.has(clean)) continue;
    seen.add(clean);

    // This URL should be full resolution (no crop, no small resize)
    // The efg parameter will say something like "1080.sdr" or "FEED.xpids"
    if (clean.includes("_nc_cat=") && clean.includes("_nc_sid=")) {
      return clean;
    }
  }

  // Fallback: try og:image (cropped, but better than nothing)
  const og = html.match(/og:image[^>]*content="([^"]+)"/);
  if (og) return og[1].replace(/&amp;/g, "&");

  return null;
}

/** Download image from URL, return ArrayBuffer. */
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Image download failed: ${resp.status}`);
  return await resp.arrayBuffer();
}

/**
 * Full pipeline: IG post URL → download full res image.
 * Returns { buffer, mimeType, shortcode }.
 */
export async function downloadIGPost(
  postUrl: string
): Promise<{ buffer: ArrayBuffer; mimeType: string; shortcode: string }> {
  const shortcode = extractShortcode(postUrl);
  if (!shortcode) throw new Error("Invalid IG URL — no shortcode found");

  const html = await fetchPostPage(shortcode);
  const fullResUrl = extractFullResUrl(html);
  if (!fullResUrl) throw new Error("Could not find full res image URL in IG post page");

  const buffer = await downloadImage(fullResUrl);
  const mimeType = fullResUrl.includes(".webp") ? "image/webp" : "image/jpeg";

  return { buffer, mimeType, shortcode };
}
