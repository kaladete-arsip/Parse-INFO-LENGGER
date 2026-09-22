/**
 * TikTok source — download REAL high-resolution photos from a TikTok photo post.
 *
 * Uses the public tikwm.com API (a TikTok content resolver that fetches from
 * non-blocked servers). The sandbox's IP is geo-detected as Hong Kong (where
 * TikTok is shut down), so direct tiktok.com fetches fail. tikwm.com acts as
 * a proxy and returns the direct CDN URLs to the original photos.
 *
 * API docs: https://www.tikwm.com/api/?url=<tiktok_url>
 * Returns: { code, msg, data: { id, title, images: [...urls], author: {...} } }
 *
 * The images[] array contains full-resolution JPEG URLs (typically 1740x2176
 * for Info Lengger flyer photos).
 *
 * In production (non-HK server), you could replace this with direct
 * tiktok.com fetches (og:image in static HTML). But tikwm.com works from
 * anywhere and is simpler.
 */

import { savePhoto, ensureStorageDir } from "./storage.js";

const TIKWM_API = "https://www.tikwm.com/api/";

export interface TiktokPost {
  id: string;
  title: string;
  authorName: string;
  imageUrls: string[];
  postUrl: string;
}

/** Fetch one specific TikTok photo post by its full URL. */
export async function fetchPost(postUrl: string): Promise<TiktokPost> {
  const apiUrl = `${TIKWM_API}?url=${encodeURIComponent(postUrl)}`;
  console.log(`[tiktok] Fetching ${postUrl}`);
  console.log(`[tiktok] → ${apiUrl.slice(0, 120)}...`);

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lengger-bot/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`tikwm.com HTTP ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
  }
  const json: any = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(`tikwm.com error: ${json.msg || JSON.stringify(json).slice(0, 200)}`);
  }

  const data = json.data;
  const images: string[] = Array.isArray(data.images) ? data.images : [];
  if (images.length === 0) {
    throw new Error(`No images in post ${postUrl} (maybe it's a video, not a photo post?)`);
  }

  return {
    id: String(data.id || ""),
    title: String(data.title || ""),
    authorName: data.author?.nickname || data.author?.unique_id || "",
    imageUrls: images,
    postUrl,
  };
}

/** Fetch the user's recent posts and find the one matching `targetDate` (ISO YYYY-MM-DD). */
export async function findPostByDate(username: string, targetDate: string): Promise<TiktokPost | null> {
  // tikwm.com user posts API
  const apiUrl = `${TIKWM_API}user/posts?username=${encodeURIComponent(username)}&cursor=0`;
  console.log(`[tiktok] Searching @${username} posts for ${targetDate}`);
  console.log(`[tiktok] → ${apiUrl.slice(0, 120)}...`);

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lengger-bot/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`tikwm.com user/posts HTTP ${res.status}`);
  }
  const json: any = await res.json();
  if (json.code !== 0 || !Array.isArray(json.data?.videos)) {
    throw new Error(`tikwm.com user/posts error: ${json.msg || "no videos array"}`);
  }

  // Build the target title pattern: "Info Lengger <Day>, <DD> <Month> <YYYY>"
  // The TikTok title format from @wonosobonyawijiingseni is exactly:
  //   "Info Lengger Selasa, 22 September 2026"
  // We'll match on the date substring (more lenient than full day-name match).
  const [yyyy, mm, dd] = targetDate.split("-");
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthName = months[parseInt(mm, 10) - 1] || "";
  const dateNeedle = `${parseInt(dd, 10)} ${monthName} ${yyyy}`;

  console.log(`[tiktok] Looking for title containing: "${dateNeedle}"`);

  const videos: any[] = json.data.videos;
  for (const v of videos) {
    const title = String(v.title || "");
    if (title.includes(dateNeedle)) {
      console.log(`[tiktok] ✓ Matched: "${title}" (video_id: ${v.video_id})`);
      const postUrl = `https://www.tiktok.com/@${username}/photo/${v.video_id}`;
      return await fetchPost(postUrl);
    }
  }
  console.log(`[tiktok] ✗ No post matching ${targetDate} in the latest ${videos.length} posts`);
  return null;
}

/** Download all photos from a TikTok post to storage/<date>/photos/. Returns the saved filenames. */
export async function downloadPostPhotos(date: string, post: TiktokPost): Promise<string[]> {
  await ensureStorageDir();
  const saved: string[] = [];
  for (let i = 0; i < post.imageUrls.length; i++) {
    const url = post.imageUrls[i];
    const ext = url.toLowerCase().includes(".webp") ? "webp" : "jpeg";
    const filename = post.imageUrls.length === 1
      ? `${date}.${ext}`
      : `${date}-slide${i + 1}.${ext}`;
    console.log(`[tiktok] Downloading photo ${i + 1}/${post.imageUrls.length}: ${filename}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; lengger-bot/1.0)" },
    });
    if (!res.ok) {
      console.warn(`[tiktok] ✗ Failed to download photo ${i + 1}: HTTP ${res.status}`);
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await savePhoto(date, filename, buffer);
    saved.push(filename);
    console.log(`[tiktok] ✓ Saved ${filename} (${buffer.length} bytes)`);
  }
  return saved;
}
