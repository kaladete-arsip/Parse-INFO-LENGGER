/**
 * HTTP server — Bun.serve on port 3031.
 *
 * Routes:
 *   GET  /                              — health check (JSON)
 *   GET  /api/days                      — list all generated days
 *   GET  /api/day/:date                 — get a day's full data (meta + rawMd + finalMd + photos)
 *   GET  /api/photo/:date/:filename     — serve a photo file
 *   POST /api/run                       — manually trigger today's pipeline
 *   POST /api/run/:date                 — manually trigger pipeline for a specific date
 *   POST /api/day/:date/final           — save user-edited final md (with narrative)
 *   POST /api/day/:date/convert-xlsx    — parse md → generate xlsx → return base64
 *   GET  /flyer-templates/:file         — serve HTML flyer (for agent-browser screenshots)
 *
 * All API responses are JSON. Photo responses are image/* with proper Content-Type.
 *
 * Cross-origin: Caddy gateway proxies /api/*?XTransformPort=3031 → this server.
 * We also add permissive CORS headers so the dev Next.js (port 3000) can call directly.
 */

import { runDailyPipeline } from "./lib/pipeline.js";
import { startCron, todayInWIB, stopCron } from "./lib/cron.js";
import {
  ensureStorageDir,
  listDays,
  readMeta,
  readRawMd,
  readFinalMd,
  saveFinalMd,
  writeMeta,
  listPhotos,
  getPhotoPath,
  type DayMeta,
} from "./lib/storage.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = parseInt(process.env.BOT_PORT || "3031", 10);

// ─── Response helpers ────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function jsonError(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

// ─── Route handlers ───────────────────────────────────────────

async function healthCheck(): Promise<Response> {
  return json({
    ok: true,
    service: "lengger-bot",
    port: PORT,
    today: todayInWIB(),
    cron: `${process.env.CRON_HOUR || "15"}:${(process.env.CRON_MINUTE || "00").padStart(2, "0")} WIB`,
    storage: ROOT + "/storage",
  });
}

async function getDays(): Promise<Response> {
  const days = await listDays();
  return json({ ok: true, days, count: days.length });
}

async function getDay(date: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Invalid date format. Use YYYY-MM-DD.", 400);
  }
  const meta = await readMeta(date);
  if (!meta) {
    return jsonError(`No data for ${date}. Run the pipeline first.`, 404);
  }
  const rawMd = await readRawMd(date);
  const finalMd = await readFinalMd(date);
  const photos = await listPhotos(date);
  return json({
    ok: true,
    meta,
    rawMd,
    finalMd,
    photos,
  });
}

async function getPhoto(date: string, filename: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Invalid date format.", 400);
  }
  // sanitize filename
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const path = getPhotoPath(date, safe);
  if (!existsSync(path)) {
    return jsonError(`Photo not found: ${date}/${safe}`, 404);
  }
  const buffer = await readFile(path);
  const ext = safe.toLowerCase().split(".").pop();
  const mime =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    ext === "gif" ? "image/gif" :
    "image/jpeg";
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders(),
    },
  });
}

async function runPipeline(date: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Invalid date format. Use YYYY-MM-DD.", 400);
  }
  console.log(`[http] Manual run for ${date}`);
  const result = await runDailyPipeline(date);
  if (!result.ok) {
    return json({ ok: false, error: result.error, meta: result.meta }, 500);
  }
  return json({ ok: true, meta: result.meta });
}

async function saveFinal(date: string, body: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Invalid date format.", 400);
  }
  await saveFinalMd(date, body);
  // Update meta
  const existing = await readMeta(date);
  if (existing) {
    const updated: DayMeta = {
      ...existing,
      hasFinal: true,
      finalSavedAt: new Date().toISOString(),
    };
    await writeMeta(date, updated);
  }
  return json({ ok: true, savedAt: new Date().toISOString() });
}

async function convertToXlsx(date: string, body: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError("Invalid date format.", 400);
  }
  // body can be either raw md or final md — caller decides
  // If empty body, try to read final md, then raw md from storage
  let mdText = body?.trim();
  if (!mdText) {
    mdText = (await readFinalMd(date)) ?? (await readRawMd(date)) ?? "";
  }
  if (!mdText) {
    return jsonError(`No md content for ${date}.`, 404);
  }

  try {
    // Dynamically import the budaya parser + xlsx generator from main project
    // via path alias @budaya/*
    const { parseMd } = await import("@budaya/md-parser");
    const { generateXlsx } = await import("@budaya/xlsx-generator");

    const filename = `${date}-raw.md`;
    const result = parseMd(mdText, filename);
    if (result.rows.length === 0) {
      return jsonError(`No rows parsed from md for ${date}.`, 422);
    }
    const arrayBuffer = await generateXlsx(result.rows);
    // Return as base64 so client can decode + download
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return json({
      ok: true,
      filename: `${date}.xlsx`,
      base64,
      rowsCount: result.rows.length,
      warnings: result.warnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[http] convert-xlsx failed for ${date}:`, msg);
    return jsonError(`Xlsx generation failed: ${msg}`, 500);
  }
}

async function serveFlyerTemplate(file: string): Promise<Response> {
  // Only allow .html files in flyer-templates/
  const safe = file.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe.endsWith(".html")) {
    return jsonError("Only .html files allowed.", 400);
  }
  const path = join(ROOT, "flyer-templates", safe);
  if (!existsSync(path)) {
    return jsonError(`Flyer template not found: ${safe}`, 404);
  }
  const text = await readFile(path, "utf-8");
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── Bun.serve ────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (path === "/" && method === "GET") {
      return await healthCheck();
    }

    // API routes
    if (path === "/api/days" && method === "GET") {
      return await getDays();
    }

    let m: RegExpMatchArray | null;

    // /api/day/:date
    m = path.match(/^\/api\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (m && method === "GET") return await getDay(m[1]);

    // /api/day/:date/final
    m = path.match(/^\/api\/day\/(\d{4}-\d{2}-\d{2})\/final$/);
    if (m && method === "POST") {
      const body = await req.text();
      return await saveFinal(m[1], body);
    }

    // /api/day/:date/convert-xlsx
    m = path.match(/^\/api\/day\/(\d{4}-\d{2}-\d{2})\/convert-xlsx$/);
    if (m && method === "POST") {
      const body = await req.text().catch(() => "");
      return await convertToXlsx(m[1], body);
    }

    // /api/photo/:date/:filename
    m = path.match(/^\/api\/photo\/(\d{4}-\d{2}-\d{2})\/([a-zA-Z0-9._-]+)$/);
    if (m && method === "GET") return await getPhoto(m[1], m[2]);

    // /api/run (today)
    if (path === "/api/run" && method === "POST") {
      return await runPipeline(todayInWIB());
    }

    // /api/run/:date
    m = path.match(/^\/api\/run\/(\d{4}-\d{2}-\d{2})$/);
    if (m && method === "POST") return await runPipeline(m[1]);

    // /flyer-templates/:file.html
    m = path.match(/^\/flyer-templates\/([a-zA-Z0-9._-]+\.html)$/);
    if (m && method === "GET") return await serveFlyerTemplate(m[1]);

    return jsonError(`Not found: ${method} ${path}`, 404);
  },
  error(err: Error): Response {
    console.error("[http] server error:", err);
    return json({ ok: false, error: err.message }, 500);
  },
});

console.log(`╔══════════════════════════════════════════════╗`);
console.log(`║  lengger-bot listening on http://localhost:${PORT}  ║`);
console.log(`╚══════════════════════════════════════════════╝`);

await ensureStorageDir();
startCron();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[bot] SIGINT received, shutting down...");
  stopCron();
  server.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n[bot] SIGTERM received, shutting down...");
  stopCron();
  server.stop();
  process.exit(0);
});
