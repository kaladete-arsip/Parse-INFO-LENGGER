/**
 * In-process daily cron — fires the pipeline at 15:00 WIB (UTC+7) every day.
 *
 * Strategy:
 *   - setInterval every 60s checks current time in WIB.
 *   - If hour=CRON_HOUR and minute=CRON_MINUTE and today's folder doesn't
 *     exist → run pipeline for today.
 *   - On startup, if today's folder doesn't exist AND current WIB time is
 *     past CRON_HOUR:CRON_MINUTE, run once (catch-up after restart).
 *
 * In production this would be a system cron / pm2 cron / Cloudflare Worker
 * cron trigger. Here we just simulate it in-process so the user can see
 * the daily file appearing automatically.
 */

import { runDailyPipeline } from "./pipeline.js";
import { existsSync } from "node:fs";
import { STORAGE_DIR } from "./storage.js";
import { join } from "node:path";

const CRON_HOUR = parseInt(process.env.CRON_HOUR || "15", 10);
const CRON_MINUTE = parseInt(process.env.CRON_MINUTE || "00", 10);

/** Current time in WIB (UTC+7) as a Date. */
function nowInWIB(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 7 * 60 * 60 * 1000);
}

/** Today's date in WIB as ISO YYYY-MM-DD. */
export function todayInWIB(): string {
  return nowInWIB().toISOString().slice(0, 10);
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastCheckedMinute: string = "";

async function maybeRun(): Promise<void> {
  const wib = nowInWIB();
  const hh = wib.getHours().toString().padStart(2, "0");
  const mm = wib.getMinutes().toString().padStart(2, "0");
  const key = `${wib.toISOString().slice(0, 10)}-${hh}:${mm}`;
  if (key === lastCheckedMinute) return; // already processed this minute
  lastCheckedMinute = key;

  const today = todayInWIB();
  const dayDir = join(STORAGE_DIR, today);
  const alreadyRanToday = existsSync(dayDir);

  const isCronTime =
    wib.getHours() === CRON_HOUR && wib.getMinutes() === CRON_MINUTE;

  if (isCronTime && !alreadyRanToday) {
    console.log(`[cron] ⏰ ${hh}:${mm} WIB — triggering daily pipeline for ${today}`);
    try {
      await runDailyPipeline(today);
    } catch (err) {
      console.error(`[cron] Pipeline crashed for ${today}:`, err);
    }
  }
}

/** On startup: catch-up if today's run was missed (current WIB time past cron time). */
async function catchUpIfMissed(): Promise<void> {
  const wib = nowInWIB();
  const today = todayInWIB();
  const dayDir = join(STORAGE_DIR, today);
  if (existsSync(dayDir)) return; // already ran today

  const minutesPastCron = (wib.getHours() - CRON_HOUR) * 60 + (wib.getMinutes() - CRON_MINUTE);
  if (minutesPastCron >= 0) {
    console.log(`[cron] Catch-up: today's pipeline not yet run; current WIB time ${wib.getHours()}:${wib.getMinutes().toString().padStart(2, "0")} is past ${CRON_HOUR}:${CRON_MINUTE.toString().padStart(2, "0")}. Running now.`);
    try {
      await runDailyPipeline(today);
    } catch (err) {
      console.error(`[cron] Catch-up pipeline crashed:`, err);
    }
  }
}

export function startCron(): void {
  console.log(`[cron] Daily cron armed: ${CRON_HOUR.toString().padStart(2, "0")}:${CRON_MINUTE.toString().padStart(2, "0")} WIB (UTC+7)`);
  // Run catch-up immediately (async, don't block server start)
  catchUpIfMissed().catch((err) => console.error("[cron] catch-up error:", err));
  // Check every minute
  timer = setInterval(() => {
    maybeRun().catch((err) => console.error("[cron] check error:", err));
  }, 60_000);
}

export function stopCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
