/**
 * Cloudflare KV helpers — session, quota tracking, last-run log.
 *
 * KV limits (free tier): 100K reads/day, 1K writes/day.
 * Our usage: ~5-10 reads + ~5 writes/day — well within limits.
 */
import type { Env, LastRun, QuotaEntry } from "../types";
import { todayKey } from "../config";

/** Read a string value from KV. */
export async function kvGet(env: Env, key: string): Promise<string | null> {
  return await env.BOT_KV.get(key);
}

/** Write a string value to KV. */
export async function kvSet(env: Env, key: string, value: string): Promise<void> {
  await env.BOT_KV.put(key, value);
}

/** Read + parse JSON from KV. Returns null if missing or invalid. */
export async function kvGetJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.BOT_KV.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Increment a service's daily quota counter. */
export async function incrementQuota(
  env: Env,
  service: "gemini" | "glm" | "telegram"
): Promise<void> {
  const date = todayKey();
  const key = `quota:${date}`;
  const quota = (await kvGetJson<QuotaEntry>(env, key)) ?? {
    gemini: 0,
    glm: 0,
    telegram: 0,
    date,
  };
  quota[service] = (quota[service] ?? 0) + 1;
  await kvSet(env, key, JSON.stringify(quota));
}

/** Get today's quota counts. */
export async function getTodayQuota(env: Env): Promise<QuotaEntry> {
  const key = `quota:${todayKey()}`;
  return (await kvGetJson<QuotaEntry>(env, key)) ?? {
    gemini: 0,
    glm: 0,
    telegram: 0,
    date: todayKey(),
  };
}

/** Log the last run (success or failure). */
export async function logRun(
  env: Env,
  status: "success" | "failure",
  detail: string
): Promise<void> {
  const entry: LastRun = {
    status,
    detail,
    timestamp: Date.now(),
  };
  await kvSet(env, "last_run", JSON.stringify(entry));
}

/** Get the last run log. */
export async function getLastRun(env: Env): Promise<LastRun | null> {
  return await kvGetJson<LastRun>(env, "last_run");
}
