# Comprehensive Implementation Plan v1.1 — Cloudflare Workers Telegram Bot

**Task ID:** PLAN-1.1 (supersedes PLAN-1)
**Date:** 2026-09-19
**Status:** DRAFT — awaiting user approval before build phase (PLAN-2)
**Scope:** End-to-end automation pipeline: Telegram photo upload → VLM OCR → LLM fix → .md reply. Deployed on Cloudflare Workers (free tier). **Out of scope** (next phase): DB standardization, IG auto-scrape, Mini PC migration.

---

## 1. Executive Summary

We are building a **$0/month, serverless Telegram bot** on **Cloudflare Workers** (free tier, no hardware, no cold start) that:

1. Receives a photo (screenshot of IG/FB post) from the user via **Telegram webhook**.
2. Downloads the photo via Telegram `getFile` API.
3. Sends the photo to **Gemini 3 Flash** (Google AI Studio free tier, vision model — 1,500 RPD, we use 1-5/day) to extract the Info Lengger markdown faithfully.
4. Optionally runs the markdown through **GLM-4.6-Flash** (Z.ai / open.bigmodel.cn, always-free, OpenAI-compatible endpoint) to fix obvious OCR typos.
5. If Gemini VLM fails (rate limit / down), falls back to raw photo reply with "manual mode" notice (Tesseract.js server-side OCR is NOT viable in Workers due to 10ms CPU limit — see §10 Fallback).
6. Pushes the resulting `.md` to the user via Telegram — **both as inline text (preview) and as a `.md` file attachment**.
7. Also supports: `/today` (manual re-trigger reminder), `/ocr` (reply to any photo), `/convert` (reply to `.md` → get `.xlsx` via existing parser), `/status`, `/help`.

The bot **reuses the existing `src/lib/budaya/*` pipeline** verbatim (`parseMd`, `normalizeInput`, `generateXlsx`, `template`, `looksLikeInfoLengger`) — no parser logic is duplicated. The bot code lives in a sibling `worker/` folder as a Cloudflare Worker (TypeScript + Wrangler).

**Future enhancement (not blocking v1):** IG mobile web API auto-scrape — daily cron fetches pinned post from `@wonosobonyawijiingseni` automatically. Requires reverse-engineering IG mobile web endpoints (no `instagram-private-api` since that library uses Node.js APIs not available in Workers edge runtime).

**Future migration path (deferred):** Mini PC at home for full IG auto-scrape + heavier processing. Cloudflare Worker remains as the Telegram-facing layer; Mini PC runs as IG scraper helper that pushes photos to the Worker.

**Total ongoing cost: $0/month.** No hardware, no electricity, no cloud subscriptions. All free tiers: Cloudflare Workers (100K req/day), Telegram Bot API (unlimited), Gemini 3 Flash (1,500 RPD), GLM-4.6-Flash (always free), GitHub (unlimited repo).

---

## 2. Architecture Overview

### 2.1 High-Level Diagram

```
              ┌────────────────────────────────────────────────────────┐
              │           Cloudflare Workers (free tier)               │
              │           Edge runtime, no cold start                   │
              │                                                        │
              │   ┌────────────────────────────────────────────────┐   │
              │   │   Worker: lengger-bot.worker.ts                 │   │
              │   │                                                │   │
              │   │   Routes:                                      │   │
              │   │   - POST /api/telegram-webhook                 │   │
              │   │     (receive Telegram updates)                 │   │
              │   │   - GET  /health                                │   │
              │   │     (uptime monitor)                           │   │
              │   │   - scheduled() — Cron Trigger 15:00 WIB        │   │
              │   │     (future: IG auto-scrape, v1.2)             │   │
              │   │                                                │   │
              │   │   Pipeline (per photo):                        │   │
              │   │   1. Download photo via Telegram getFile (fetch)│   │
              │   │   2. Base64 encode (~30-50KB, <10ms CPU)       │   │
              │   │   3. Gemini 3 Flash VLM (fetch, ~5-15s)        │   │
              │   │   4. (Optional) GLM-4.6-Flash fix (fetch, ~3s) │   │
              │   │   5. Reply .md to Telegram (sendMessage +      │   │
              │   │      sendDocument, 2 fetches)                  │   │
              │   │                                                │   │
              │   │   State: Cloudflare KV (session, quota, logs)  │   │
              │   └────────────────────────────────────────────────┘   │
              └──────┬──────────────────────┬──────────────┬───────────┘
                     │ (all fetch, outbound)│              │
            +--------+---------+   +--------+--------+   +--+-----------+
            |                  |   |                  |   |              |
            v                  v   v                  v   v              v
   ┌────────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐
   │ Telegram Bot    │ │ Gemini   │ │ GLM API  │ │ Cloudflare KV       │
   │ API             │ │ 3 Flash  │ │ (Z.ai)   │ │ (session + quota)   │
   │ (sendMessage +  │ │ aistudio │ │ bigmodel │ │ - 100K reads/day    │
   │  sendDocument + │ │ .google  │ │ .cn      │ │ - 1K writes/day     │
   │  getFile)       │ │          │ │          │ │ - free               │
   └────────────────┘ └──────────┘ └──────────┘ └────────────────────┘

User flow (v1 — manual upload):
   ┌──────┐  screenshot IG post   ┌──────────────┐
   │ User │ ──── send photo ────> │ Telegram bot │
   │  (HP)│                       │   (CF Worker)│
   │      │ <── .md text + file ─ │              │
   │      │                       │              │
   │      │ (optional)            │              │
   │      │ reply /convert to .md │              │
   │      │ ────────────────────> │              │
   │      │ <────── .xlsx file ── │              │
   └──────┘                       └──────────────┘
```

### 2.2 Data Flow

```
Telegram update (photo message)
  └─> Worker webhook handler (POST /api/telegram-webhook)
       ├─ 1. Verify auth (secret_token query param matches BOT_WEBHOOK_SECRET)
       ├─ 2. Extract photo (largest size from message.photo[])
       ├─ 3. fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=...`)
       │     → returns file_path
       ├─ 4. fetch(`https://api.telegram.org/file/bot${TOKEN}/${file_path}`)
       │     → returns image ArrayBuffer
       ├─ 5. base64 encode ArrayBuffer (for Gemini inlineData)
       ├─ 6. Gemini call: @google/genai generateContent([inlineData, prompt])
       │     → returns MD text (~5-15s, network-bound, not CPU)
       ├─ 7. (Optional) GLM call: OpenAI-compatible chat.completions
       │     → returns cleaned MD (~3s)
       ├─ 8. fetch sendMessage(chatId, preview text)
       └─ 9. fetch sendDocument(chatId, .md file Blob)
             → user receives .md in Telegram
```

### 2.3 Component Inventory

| Component | Library / Service | Version (Sep 2026) | Free? | Limit |
|---|---|---|---|---|
| Runtime | **Cloudflare Workers** | edge runtime | ✅ | 100K req/day, 10ms CPU/req, 128MB RAM |
| Telegram bot framework | **grammY** | `^1.30.x` | ✅ | unlimited |
| VLM OCR | **Gemini 3 Flash** via `@google/genai` | SDK `^2.23.0`, model `gemini-3-flash` | ✅ | 1,500 RPD |
| LLM typo fix | **GLM-4.6-Flash** via `openai` npm (custom baseURL) | `openai ^4.x`, model `glm-4.6-flash` | ✅ | always free |
| Excel generator | **exceljs** (existing, reused) | `^4.4.0` | ✅ | — |
| State storage | **Cloudflare KV** | native binding | ✅ | 100K reads/day, 1K writes/day |
| Cron | **Cloudflare Cron Triggers** | native | ✅ | 3 crons/worker |
| Deploy | **Wrangler CLI** + GitHub Actions | `^3.x` | ✅ | unlimited deploys |
| Source | **GitHub repo** | — | ✅ | unlimited |

---

## 3. Cloudflare Workers Setup

### 3.1 Account & CLI

1. **Cloudflare account**: free signup at https://dash.cloudflare.com/sign-up (no credit card needed for Workers free tier).
2. **Wrangler CLI** (local dev + deploy):
   ```bash
   npm install -g wrangler
   wrangler login  # opens browser, authorize
   ```
3. **Verify**:
   ```bash
   wrangler whoami  # should show your account
   ```

### 3.2 Worker Project Structure

The Worker lives in a sibling `worker/` folder (separate from the Next.js `src/` app — both share `src/lib/budaya/` via tsconfig path alias):

```
/home/z/my-project/
├── src/                      # Next.js web UI (existing, unchanged)
│   ├── app/                  # page.tsx, layout.tsx, globals.css
│   ├── components/ui/        # shadcn/ui components
│   ├── hooks/                # use-mobile, use-toast
│   └── lib/budaya/           # ← REUSED by worker/ via path alias
│       ├── md-parser.ts
│       ├── fb-to-md.ts
│       ├── csv-to-md.ts
│       ├── normalize-input.ts
│       ├── xlsx-generator.ts
│       ├── ocr.ts            # browser-only (Tesseract CDN), NOT used by worker
│       └── template.ts
├── worker/                   # ← NEW: Cloudflare Worker
│   ├── wrangler.toml         # Cloudflare config (bindings, KV, cron)
│   ├── package.json          # worker-specific deps
│   ├── tsconfig.json         # path alias to ../src/lib/budaya/*
│   ├── src/
│   │   ├── index.ts          # main entry: fetch() + scheduled() handlers
│   │   ├── config.ts         # env vars (secrets via wrangler secret)
│   │   ├── telegram/
│   │   │   ├── handlers.ts    # /today /ocr /convert /status /help
│   │   │   ├── send.ts       # sendMdAsText, sendMdAsFile, sendStatus
│   │   │   └── webhook.ts    # verify signature, parse update
│   │   ├── ai/
│   │   │   ├── vlm-ocr.ts    # Gemini 3 Flash vision call
│   │   │   ├── llm-fix.ts    # GLM-4.6-Flash typo fix
│   │   │   ├── prompts.ts    # system prompts (Info Lengger format)
│   │   │   └── fallback.ts   # raw photo reply on VLM failure
│   │   ├── cron/
│   │   │   └── scheduler.ts  # scheduled() handler (future IG auto-scrape)
│   │   ├── utils/
│   │   │   ├── kv.ts         # KV get/set helpers (session, quota, logs)
│   │   │   ├── retry.ts       # exponential backoff for fetch
│   │   │   ├── logger.ts     # console.log (visible in wrangler tail)
│   │   │   └── budaya-bridge.ts  # import parseMd/generateXlsx
│   │   └── types.ts          # shared types
│   ├── .dev.vars.example     # local dev env template
│   └── README.md             # deploy instructions
├── public/                   # static assets (existing)
├── samples/                  # Info Lengger test .md files (existing)
├── package.json              # Next.js app (existing)
└── PLAN.md                   # THIS FILE
```

### 3.3 `worker/wrangler.toml`

```toml
name = "lengger-bot"
main = "src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]  # for exceljs, openai SDK

# Telegram webhook route
[[routes]]
pattern = "/api/telegram-webhook"
custom_domain = false  # use workers.dev subdomain

# Health check route
[[routes]]
pattern = "/health"
custom_domain = false

# Cloudflare KV namespace (session + quota + logs)
[[kv_namespaces]]
binding = "BOT_KV"
id = "your-kv-namespace-id-here"  # create via `wrangler kv:namespace create BOT_KV`

# Cron Trigger (future: v1.2 IG auto-scrape at 15:00 WIB)
# [triggers]
# crons = ["0 8 * * *"]  # 08:00 UTC = 15:00 WIB (WIB = UTC+7)

# Secrets (set via `wrangler secret put <NAME>`):
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_WEBHOOK_SECRET  (random string for webhook auth)
# - USER_CHAT_ID             (restrict bot to your personal chat)
# - GEMINI_API_KEY
# - GLM_API_KEY
# - IG_USERNAME              (future v1.2)
# - IG_PASSWORD              (future v1.2)
```

### 3.4 Worker limits (verify free tier adequacy)

| Limit | Free Tier | Our Usage | OK? |
|---|---|---|---|
| Requests/day | 100,000 | ~5-10/day (1 photo + manual commands) | ✅ 0.01% |
| CPU per invocation | 10ms | ~2-5ms (base64 + JSON parse, no heavy compute) | ✅ |
| Wall-clock time | 30s (Telegram webhook timeout) | ~20-25s (Gemini ~15s + GLM ~3s + fetch overhead) | ✅ |
| Memory | 128MB | ~30-50MB (single image in memory) | ✅ |
| Subrequests (fetch) | 50 per invocation | 5 (getFile + download + Gemini + GLM + 2 Telegram sends) | ✅ |
| KV reads | 100K/day | ~5-10/day | ✅ |
| KV writes | 1K/day | ~5/day (quota update, log) | ✅ |
| Cron Triggers | 3 per worker | 1 (future v1.2) | ✅ |
| Cold start | **NONE** (edge, always warm) | — | ✅ PERFECT |

**Key insight**: All external API calls use `fetch()` which is **network I/O, not CPU**. The 10ms CPU limit only counts actual computation (base64 encoding, JSON parsing, regex). Our compute is minimal — the heavy lifting (OCR, typo fix) happens on Gemini/GLM servers.

---

## 4. Code Architecture — `worker/` folder (file-by-file)

### 4.1 `worker/package.json`

```json
{
  "name": "lengger-bot-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail",
    "kv:create": "wrangler kv:namespace create BOT_KV",
    "secret:put": "wrangler secret put",
    "types": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^2.23.0",
    "grammy": "^1.30.0",
    "openai": "^4.80.0",
    "exceljs": "^4.4.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250901.0",
    "typescript": "^5.6.0",
    "wrangler": "^3.90.0"
  }
}
```

### 4.2 `worker/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@budaya/*": ["../src/lib/budaya/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "../src/lib/budaya/**/*.ts"]
}
```

The `paths` alias lets the Worker import the existing parser:
```typescript
import { parseMd } from "@budaya/md-parser";
import { generateXlsx } from "@budaya/xlsx-generator";
import { normalizeInput } from "@budaya/normalize-input";
```

### 4.3 `worker/src/index.ts` — Main Entry

```typescript
import { handleWebhook } from "./telegram/webhook";
import { handleScheduled } from "./cron/scheduler";
import { handleHealth } from "./utils/health";

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  USER_CHAT_ID: string;
  GEMINI_API_KEY: string;
  GLM_API_KEY: string;
  // Future v1.2:
  IG_USERNAME?: string;
  IG_PASSWORD?: string;
  // Bindings:
  BOT_KV: KVNamespace;
}

export default {
  // HTTP fetch handler — routes /api/telegram-webhook and /health
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return handleHealth(env);
    if (url.pathname === "/api/telegram-webhook") return handleWebhook(request, env, ctx);
    return new Response("Not Found", { status: 404 });
  },

  // Cron trigger handler — future v1.2 IG auto-scrape
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleScheduled(env, ctx);
  },
};
```

### 4.4 `worker/src/config.ts` — Env Validation

```typescript
import type { Env } from "./index";

export function validateEnv(env: Env): void {
  const required = ["TELEGRAM_BOT_TOKEN", "USER_CHAT_ID", "GEMINI_API_KEY"];
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing env: ${key}`);
  }
}

export const CONFIG = {
  IG_TARGET: "wonosobonyawijiingseni",
  GEMINI_MODEL: "gemini-3-flash",
  GLM_MODEL: "glm-4.6-flash",
  GLM_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  TELEGRAM_API: "https://api.telegram.org",
  // Telegram message limits
  MAX_MSG_LEN: 4096,
  PREVIEW_LEN: 500,
  // Retry config
  MAX_RETRIES: 3,
  RETRY_BASE_MS: 1000,
};
```

### 4.5 `worker/src/telegram/webhook.ts`

```typescript
import type { Env } from "../index";
import { validateEnv } from "../config";
import { handleCommand } from "./handlers";

export async function handleWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  validateEnv(env);

  // Verify webhook secret (X-Telegram-Bot-Api-Secret-Token header)
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json();
  
  // Respond immediately (Telegram 60s timeout); process async via waitUntil
  ctx.waitUntil(handleCommand(update, env));
  
  return new Response("OK", { status: 200 });
}
```

### 4.6 `worker/src/telegram/handlers.ts`

Commands:
- `/help` — list all commands
- `/status` — bot health: last run, KV state, API quotas
- `/ocr` (reply to photo) — run Gemini VLM, reply .md (primary use case)
- `/convert` (reply to .md file) — run existing `parseMd` + `generateXlsx`, reply .xlsx
- `/today` — reminder prompt to screenshot today's IG post (future v1.2: auto-scrape)
- `/link <ig_url>` — future v1.2: scrape specific IG post via mobile web API

Each handler:
1. Verifies `update.message.from.id === env.USER_CHAT_ID` (auth gate)
2. Extracts relevant content (photo, document, text)
3. Calls the appropriate pipeline module
4. Sends reply via `send.ts` helpers

### 4.7 `worker/src/telegram/send.ts`

```typescript
import { CONFIG } from "../config";
import type { Env } from "../index";

export async function sendMdAsText(env: Env, chatId: string, md: string): Promise<void> {
  // Telegram message limit 4096 chars — split if longer
  const preview = md.slice(0, CONFIG.PREVIEW_LEN) + (md.length > CONFIG.PREVIEW_LEN ? "\n\n... (see attached .md file for full text)" : "");
  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `📋 *Info Lengger OCR Result*\n\n\`\`\`markdown\n${preview}\n\`\`\``,
      parse_mode: "MarkdownV2",
    }),
  });
}

export async function sendMdAsFile(env: Env, chatId: string, md: string, filename: string): Promise<void> {
  const blob = new Blob([md], { type: "text/markdown" });
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", blob, filename);
  await fetch(`${CONFIG.TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: formData,
  });
}

export async function sendPhotoReply(env: Env, chatId: string, photoBase64: string, caption: string): Promise<void> {
  // Fallback: send raw photo back with "manual mode" notice
  // (used when VLM fails — see §10 Fallback)
  // [implementation: fetch sendPhoto with base64 photo]
}

export async function sendStatus(env: Env, chatId: string): Promise<void> {
  // Read from KV: last_run, quota_today, error_count
  // [implementation: format status message]
}
```

### 4.8 `worker/src/ai/vlm-ocr.ts` — Gemini 3 Flash

```typescript
import { GoogleGenAI } from "@google/genai";
import type { Env } from "../index";
import { CONFIG } from "../config";
import { VLM_SYSTEM_PROMPT } from "./prompts";

export async function runVlmOcr(env: Env, imageBase64: string, mimeType: string): Promise<{ text: string; confidence: number }> {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  
  const response = await ai.models.generateContent({
    model: CONFIG.GEMINI_MODEL,
    contents: [
      { inlineData: { data: imageBase64, mimeType } },
      { text: VLM_SYSTEM_PROMPT },
    ],
  });
  
  const text = response.text ?? "";
  // Estimate confidence based on response structure (Gemini doesn't return explicit confidence)
  const confidence = text.length > 100 && /info\s*lengger/i.test(text) ? 90 : 60;
  
  return { text, confidence };
}
```

### 4.9 `worker/src/ai/prompts.ts` — System Prompts

```typescript
export const VLM_SYSTEM_PROMPT = `You are an OCR assistant specialized in extracting "Info Lengger" text from photos of Instagram/Facebook posts about the Lengger dance tradition in Wonosobo, Central Java, Indonesia.

Your task: extract ALL text from the image faithfully and output it as Markdown, preserving the exact format below.

FORMAT RULES (CRITICAL — do not deviate):

1. Date header line (top of each day's section):
   "Info Lengger <Day>, DD Month YYYY"
   - Day in Indonesian: Sabtu, Minggu, Senin, Selasa, Rabu, Kamis, Jumat
   - Month in Indonesian: Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember
   - Example: "Info Lengger Sabtu, 20 Juni 2026"

2. Entry headers (one per pentas location):
   "<n>_<dusun>, <desa> Kec: <kecamatan> Kab: <kabupaten>"
   - <n> is a number (1, 2, 3, ...)
   - Use UNDERSCORE after the number, NOT a dot or space
   - Example: "1_Trenggiling, Sariyoso Kec: Kertek Kab: Wonosobo"
   - If only one place name: "8_Mungkung Kec: Kalikajar Kab: Wonosobo"

3. Rombongan (performer group) line in parentheses:
   "(Romb <group name>)"
   - Keep the group name verbatim (may contain "&" for multiple groups, or commas for homebase info)
   - Example: "(Romb Sri Muda Rahayu & Wahyu Margi Utomo)"

4. Individual performer lines:
   "Lengger: <name1>, <name2> & <name3>"
   "Sinden: <name1>"
   "Artise: <name1>" (alternate spelling of Lengger)
   - Split names by "," and "&"
   - Keep "(Temanggung)" or similar homebase notes in parentheses

5. Quote markers (for special activities):
   "TAYUB", "WAROK", "JARANAN & WAROK", "TOPENG IRENG & WAROK", "LENGGERAN, JARANAN & WAROK", "MBENGI TOK", "MBENGI THOK"
   - These appear as quoted lines in the image — keep them quoted in output
   - Example: "MBENGI THOK" (with quotes)

6. Source line (if visible):
   "Sumber : <url or text>"

DO NOT:
- Add commentary, explanations, or notes
- Add markdown headers (#, ##)
- Translate to English
- Add or remove entries — transcribe exactly what's in the image
- Fix typos you think you see — transcribe faithfully (a downstream LLM will fix typos)

OUTPUT: Only the Info Lengger Markdown text, nothing else.`;

export const LLM_FIX_SYSTEM_PROMPT = `You are a typo-correction assistant for "Info Lengger" Markdown documents. Your task is to fix obvious OCR errors while preserving the format and data exactly.

COMMON OCR ERRORS TO FIX:
- "1." or "1 " → "1_" (entry header should use underscore)
- "KeciKab" or "Kec/Kab" missing → "Kec/Kab: <value>" or "Kec: <x> Kab: <y>"
- "Lengger." → "Lengger:" (colon, not dot)
- "Sinde:" → "Sinden:" (missing N)
- "WAROI" → "WAROK"
- "Watuma ang" → "Watumumpang" (common OCR garble)
- "Dewia" → "Dewi"
- "Rom " → "Romb " (missing B in rombongan)
- Missing closing quote: "JARANAN & WAROK' → "JARANAN & WAROK"
- "Sabtu 20" → "Sabtu, 20" (missing comma in date header)
- "2028" or "2027" → "2026" (only if clearly a typo in current year context)

RULES:
- Do NOT add or remove entries
- Do NOT translate or rephrase
- Do NOT add markdown headers
- Preserve all names, places, dates as they are (only fix obvious OCR errors)
- If unsure whether something is a typo, leave it as-is

OUTPUT: Only the corrected Info Lengger Markdown, nothing else.`;
```

### 4.10 `worker/src/ai/llm-fix.ts` — GLM-4.6-Flash

```typescript
import OpenAI from "openai";
import type { Env } from "../index";
import { CONFIG } from "../config";
import { LLM_FIX_SYSTEM_PROMPT } from "./prompts";

export async function runLlmFix(env: Env, mdText: string): Promise<string> {
  const client = new OpenAI({
    apiKey: env.GLM_API_KEY,
    baseURL: CONFIG.GLM_BASE_URL,
  });
  
  const response = await client.chat.completions.create({
    model: CONFIG.GLM_MODEL,
    messages: [
      { role: "system", content: LLM_FIX_SYSTEM_PROMPT },
      { role: "user", content: mdText },
    ],
    temperature: 0.1,  // low temperature for deterministic typo fix
    max_tokens: 2000,
  });
  
  return response.choices[0]?.message?.content ?? mdText;
}
```

### 4.11 `worker/src/ai/fallback.ts`

```typescript
import type { Env } from "../index";
import { sendPhotoReply, sendMdAsText } from "../telegram/send";

export async function handleVlmFailure(env: Env, chatId: string, imageBase64: string, mimeType: string, error: string): Promise<void> {
  // Tesseract.js is NOT viable in Workers (10ms CPU limit, WASM worker incompatible with edge runtime).
  // Fallback: send raw photo back to user with "manual mode" notice.
  
  const notice = `⚠️ Gemini VLM gagal: ${error}\n\n` +
    `Bot mengirim foto balik ke Anda. Anda bisa:\n` +
    `1. Transkripsi manual di HP/laptop\n` +
    `2. Upload ke web UI (tab "Foto → OCR") untuk Tesseract OCR client-side\n` +
    `3. Coba lagi dalam 1 jam dengan /ocr (kalau Gemini cuma rate-limited)`;
  
  await sendMdAsText(env, chatId, notice);
  await sendPhotoReply(env, chatId, imageBase64, "Raw photo (VLM failed)");
}
```

### 4.12 `worker/src/utils/budaya-bridge.ts` — Reuse Existing Parser

```typescript
// This module bridges the Worker to the existing src/lib/budaya/ parser.
// It imports via tsconfig path alias @budaya/* → ../src/lib/budaya/*

import { parseMd } from "@budaya/md-parser";
import { generateXlsx } from "@budaya/xlsx-generator";
import { normalizeInput } from "@budaya/normalize-input";

export async function convertMdToXlsx(mdText: string, filename: string): Promise<ArrayBuffer> {
  const { mdText: normalized } = normalizeInput(mdText, filename);
  const { rows } = parseMd(normalized, filename);
  
  if (rows.length === 0) {
    throw new Error("Tidak ada entri terdeteksi. Cek format input.");
  }
  
  return await generateXlsx(rows);
}

export function parseMdToRows(mdText: string, filename: string) {
  const { mdText: normalized } = normalizeInput(mdText, filename);
  return parseMd(normalized, filename);
}
```

### 4.13 `worker/src/utils/kv.ts` — Cloudflare KV Helpers

```typescript
import type { Env } from "../index";

export async function kvGet(env: Env, key: string): Promise<string | null> {
  return await env.BOT_KV.get(key);
}

export async function kvSet(env: Env, key: string, value: string): Promise<void> {
  await env.BOT_KV.put(key, value);
}

// Quota tracking (reset daily at 00:00 UTC)
export async function incrementQuota(env: Env, service: "gemini" | "glm" | "ig"): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const key = `quota:${service}:${today}`;
  const current = parseInt(await kvGet(env, key) ?? "0", 10);
  await kvSet(env, key, String(current + 1));
}

// Last run log
export async function logRun(env: Env, status: "success" | "failure", detail: string): Promise<void> {
  const key = `last_run`;
  const value = JSON.stringify({ status, detail, ts: Date.now() });
  await kvSet(env, key, value);
}
```

---

## 5. Telegram Bot Setup

### 5.1 Create Bot via @BotFather

1. Open Telegram, search `@BotFather`, send `/newbot`
2. Choose a name (e.g., "Lengger OCR Bot")
3. Choose a username (e.g., `lengger_ocr_bot`)
4. Save the **bot token** (format: `123456789:ABCdefGhI...`)
5. Set commands via `/setcommands`:
   ```
   today - Reminder to screenshot today's IG post
   ocr - Reply to a photo with OCR → .md
   convert - Reply to a .md file with → .xlsx
   status - Show bot health and API quotas
   help - Show all commands
   ```

### 5.2 Get Your Chat ID

1. Send any message to your new bot
2. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in browser
3. Find `"chat":{"id":123456789,...}` — that's your `USER_CHAT_ID`

### 5.3 Set Webhook

After deploying the Worker (§16), set the webhook:

```bash
# Replace <WORKER_URL> with your workers.dev URL (e.g., https://lengger-bot.your-username.workers.dev)
# Replace <SECRET> with a random string (same as TELEGRAM_WEBHOOK_SECRET in wrangler secrets)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://lengger-bot.your-username.workers.dev/api/telegram-webhook" \
  -d "secret_token=<SECRET>"
```

Verify: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

### 5.4 Webhook Mode (NOT Long Polling)

Cloudflare Workers are **request-response** (no long polling). Telegram webhooks fit naturally:
- Telegram sends POST to `/api/telegram-webhook` when user messages bot
- Worker responds 200 immediately, processes async via `ctx.waitUntil()`
- No port forwarding, no DDNS (all outbound from Cloudflare edge)

---

## 6. VLM Integration — Gemini 3 Flash

### 6.1 Get API Key

1. Go to https://aistudio.google.com/apikey
2. Click "Create API key"
3. Save the key (format: `AIzaSy...`) — set as `GEMINI_API_KEY` via `wrangler secret put GEMINI_API_KEY`

### 6.2 Model Choice

| Model | Status (Sep 2026) | Vision? | Free Tier |
|---|---|---|---|
| `gemini-3-flash` | ✅ Current | ✅ Yes | 1,500 RPD, 10 RPM |
| `gemini-flash-latest` | ✅ Auto-updates | ✅ Yes | Same |
| `gemini-2.0-flash` | ❌ Dead (2026-06-01) | — | — |
| `gemini-2.5-flash` | ⚠ Deprecating (Oct 2026) | ✅ Yes | — |

**Decision**: Use `gemini-3-flash` (pinned for stability). Update to `gemini-flash-latest` if you prefer auto-updates (risk: silent regression if Google ships a bad version).

### 6.3 SDK: `@google/genai` (NOT deprecated `@google/generative-ai`)

```bash
npm install @google/genai
```

```typescript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-3-flash",
  contents: [
    { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
    { text: VLM_SYSTEM_PROMPT },
  ],
});
```

### 6.4 Cost Estimate

| Resource | Free Tier | Our Usage | Cost |
|---|---|---|---|
| Gemini 3 Flash requests | 1,500/day | 1-5/day | $0 |
| Tokens per minute | 250K TPM | ~2K/request | $0 |
| Image size | up to 7MB | ~30-100KB (IG screenshot) | $0 |

---

## 7. LLM Fix — GLM-4.6-Flash

### 7.1 Get API Key

1. Go to https://open.bigmodel.cn (Z.ai / Zhipu AI)
2. Sign up (free, no credit card)
3. Create API key
4. Save as `GLM_API_KEY` via `wrangler secret put GLM_API_KEY`

### 7.2 API Call (OpenAI-compatible)

```typescript
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: env.GLM_API_KEY,
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
});
const response = await client.chat.completions.create({
  model: "glm-4.6-flash",
  messages: [...],
  temperature: 0.1,
});
```

### 7.3 When to Skip LLM Fix

- If VLM output looks clean (passes `looksLikeInfoLengger()` check from existing `ocr.ts`)
- If VLM output is empty / too short
- If GLM API is down (fallback: use raw VLM output)

---

## 8. Cron Scheduling — Cloudflare Cron Triggers

### 8.1 v1 (Current): NO Cron

v1 is **manual upload** — user screenshots IG post and sends to bot. No cron needed.

### 8.2 v1.2 (Future): IG Auto-Scrape Cron

Add to `wrangler.toml`:
```toml
[triggers]
crons = ["0 8 * * *"]  # 08:00 UTC = 15:00 WIB (WIB = UTC+7)
```

The `scheduled()` handler in `worker/src/index.ts` will:
1. Call IG mobile web API to fetch `@wonosobonyawijiingseni` profile
2. Find pinned post (today's Info Lengger)
3. Download photo
4. Run VLM + LLM pipeline
5. Send .md to user

**Note**: IG mobile web API needs research (see §11).

### 8.3 Retry Logic (for v1.2)

If no pinned post found at 15:00:
- Retry at 15:15 (cron: `15 8 * * *`)
- Retry at 15:30 (cron: `30 8 * * *`)
- Retry at 15:45 (cron: `45 8 * * *`)

Cloudflare allows 3 Cron Triggers per worker on free tier — exactly fits.

---

## 9. Output Format to Telegram

```
📋 Info Lengger OCR Result

[VLM: gemini-3-flash, 94% | LLM fix: applied | source: manual upload]

```markdown
Info Lengger Kamis, 17 September 2026
1_Banaran, Kayugiyang Kec: Garung Kab: Wonosobo
(Romb Warga Tunggal)
Lengger: Yani & Gisha
Sinden: Husnul
...
``` (preview, first 500 chars)

📎 Full .md file attached below ↓
```

Then send `.md` file via `sendDocument`:
- Filename: `info-lengger-2026-09-17.md` (derive date from content if possible, else timestamp)
- MIME: `text/markdown`

**For long .md (>4096 chars)**: split text message into multiple (Telegram 4096 char limit per message). File attachment always contains full content.

---

## 10. Fallback Hierarchy

```
1. Try Gemini 3 Flash VLM (primary, ~95% accuracy)
   ↓ if 429 (rate limit) or 5xx (API down) or empty response
2. Send raw photo back to user with "manual mode" notice
   (Tesseract.js is NOT viable in Workers due to 10ms CPU limit + WASM worker incompatibility)
   ↓ user can then:
   - Transcribe manually
   - Upload to web UI (src/app/page.tsx "Foto → OCR" tab) for browser-side Tesseract OCR
   - Retry with /ocr in 1 hour (if Gemini was just rate-limited)
```

**Why no Tesseract in Worker?**
- Workers edge runtime doesn't support Web Workers (Tesseract.js uses them)
- 10ms CPU limit is too tight for Tesseract WASM init (~2-5s)
- 128MB RAM is tight for language data (~5MB × 2 languages)

**Alternative considered**: Call Tesseract Cloud API (ocr.space free tier 25K/month) as fallback. Viable but adds another external dependency. Skip for v1 — raw photo fallback is sufficient (user has web UI for Tesseract).

---

## 11. IG Mobile Web API — Future Enhancement (v1.2)

**Status**: Research phase. Not blocking v1.

### 11.1 Why Not `instagram-private-api`?

The popular `instagram-private-api` Node.js library uses:
- `fs` (filesystem) — not available in Workers
- `crypto` Node module — partially available via `nodejs_compat` flag, but unstable
- Long-lived sessions — Workers are stateless (need KV for session)

### 11.2 Alternative: IG Mobile Web API

Instagram's mobile website (`https://www.instagram.com/`) exposes JSON endpoints when accessed with mobile User-Agent. Approach:

1. Login via `POST /accounts/login/ajax/` with mobile UA → get session cookies
2. Store cookies in Cloudflare KV (encrypted)
3. Fetch profile: `GET /api/v1/feed/user/<user_id>/?count=12` → returns posts JSON
4. Filter for `is_pinned = true` (today's Info Lengger)
5. Download photo via `images[0].url` (highest resolution)

### 11.3 Challenges

- IG may require 2FA for new logins (need to handle / handle backup codes)
- IG may block Cloudflare IPs (edge datacenter IPs are detectable)
- Rate limit: 1 req/day is very safe, won't trigger anti-bot
- Session expiry: re-login every 1-2 weeks (store last_login in KV, check before fetch)

### 11.4 Fallback if IG API Fails

If IG mobile web API proves unreliable in Workers:
- **Hybrid**: Mini PC (future) runs `instagram-private-api` natively, pushes photos to Worker endpoint
- **Manual**: User screenshots IG post, sends to bot (v1 behavior)
- **Third-party**: Use a IG mirror service (Picuki, Dumpor) — fragile, not recommended

---

## 12. Logging & Monitoring

### 12.1 Cloudflare Workers Logs

- `console.log()` in Worker code → visible via `wrangler tail` (real-time stream)
- Logs auto-expire (Cloudflare keeps ~3-7 days on free tier)
- For permanent logs: write to KV (key: `log:YYYY-MM-DD:HH`, value: JSON)

### 12.2 `/status` Command Output

```
🤖 Lengger OCR Bot Status
━━━━━━━━━━━━━━━━━━━━━━━
Uptime: Worker has no "uptime" (serverless) — but edge is always warm.
Last run: 2026-09-19T08:00:05Z (success, 4 entries parsed)
API quotas today:
  - Gemini: 2/1500 RPD
  - GLM: 1/∞
  - IG: 0/1 (not yet — v1.2)
KV usage:
  - last_run: stored ✓
  - session: not set (v1.2)
Error count today: 0
```

### 12.3 Health Check Endpoint

`GET /health` → returns `200 OK` with JSON:
```json
{ "status": "ok", "timestamp": "2026-09-19T08:00:00Z", "version": "1.0.0" }
```

Use with uptime monitor (e.g., UptimeRobot free tier) for alerting.

---

## 13. Security

### 13.1 Secrets Management

All secrets set via `wrangler secret put <NAME>` (encrypted at rest, never in code/git):
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (random 32-char string for webhook auth)
- `USER_CHAT_ID` (your personal chat ID — bot only responds to you)
- `GEMINI_API_KEY`
- `GLM_API_KEY`
- (Future v1.2: `IG_USERNAME`, `IG_PASSWORD`)

### 13.2 Auth Gate

Every webhook handler checks:
```typescript
if (update.message?.from?.id?.toString() !== env.USER_CHAT_ID) {
  return;  // silently drop unauthorized messages
}
```

### 13.3 Webhook Secret Verification

```typescript
const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
  return new Response("Unauthorized", { status: 401 });
}
```

### 13.4 `.env` / `.dev.vars` Git Safety

- `.dev.vars` (local dev secrets) in `.gitignore`
- `.dev.vars.example` (template) committed to git
- Pre-commit hook (husky) to abort if `.dev.vars` staged

### 13.5 API Key Masking in Logs

```typescript
function maskKey(key: string): string {
  return key.slice(0, 8) + "..." + key.slice(-4);  // AIzaSy...abc
}
```

---

## 14. Auto-Update — GitHub Actions → Wrangler Deploy

### 14.1 CI/CD Pipeline

`.github/workflows/deploy-worker.yml`:
```yaml
name: Deploy Worker to Cloudflare
on:
  push:
    branches: [main]
    paths: ['worker/**', 'src/lib/budaya/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: cd worker && npm install
      - run: cd worker && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### 14.2 `/update` Command (Manual)

User sends `/update` to bot:
1. Worker can't git pull itself (serverless, stateless)
2. Instead: trigger GitHub Actions via `repository_dispatch` event
3. GitHub Action runs `wrangler deploy`
4. New version live in ~30s

### 14.3 Rollback

`wrangler rollback` — reverts to previous deployment. Available via Wrangler CLI (not from Telegram).

---

## 15. Testing Strategy

### 15.1 Local Dev with Wrangler

```bash
cd worker
npm install
npm run dev  # wrangler dev — local Worker on localhost:8787
```

### 15.2 Test Webhook Locally

```bash
# Simulate Telegram webhook POST
curl -X POST http://localhost:8787/api/telegram-webhook \
  -H "X-Telegram-Bot-Api-Secret-Token: <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"message":{"from":{"id":"<USER_CHAT_ID>"},"text":"/help"}}'
```

### 15.3 Unit Tests

- `vlm-ocr.ts`: mock `@google/genai` response, verify prompt structure
- `llm-fix.ts`: mock OpenAI client, verify typo fixes
- `budaya-bridge.ts`: test `convertMdToXlsx()` with sample .md from `samples/`
- `kv.ts`: mock KVNamespace, verify get/set/quota increment

### 15.4 Integration Tests

- End-to-end: send real photo via Telegram → verify .md reply
- Fallback: simulate Gemini 429 → verify raw photo reply
- Auth gate: send from unauthorized chat_id → verify silent drop

### 15.5 Manual Test Commands

- `/help` → command list
- `/status` → health info
- `/ocr` (reply to sample photo from `samples/`) → .md
- `/convert` (reply to sample .md from `samples/`) → .xlsx

---

## 16. Deployment Guide (Step-by-Step)

### Pre-deploy (on local machine, before first Cloudflare deploy)

1. **Push code to GitHub**:
   - `worker/` folder + existing `src/lib/budaya/`
   - `.github/workflows/deploy-worker.yml`
   - `worker/wrangler.toml`, `worker/package.json`, `worker/tsconfig.json`
   - `worker/src/**/*.ts`
   - `worker/.dev.vars.example` (template, NOT `.dev.vars`)

2. **Create Telegram bot** (§5.1) — save token

3. **Get API keys**:
   - Gemini: https://aistudio.google.com/apikey
   - GLM: https://open.bigmodel.cn

4. **Local test**:
   ```bash
   cd worker
   npm install
   cp .dev.vars.example .dev.vars  # fill in real values
   npm run dev  # test locally
   # Send test webhook, verify /help, /ocr work
   ```

### Cloudflare setup (one-time)

5. **Create Cloudflare account** (if not have): https://dash.cloudflare.com/sign-up

6. **Install Wrangler & login**:
   ```bash
   npm install -g wrangler
   wrangler login  # browser auth
   ```

7. **Create KV namespace**:
   ```bash
   cd worker
   wrangler kv:namespace create BOT_KV
   # Copy the ID into wrangler.toml
   ```

8. **Set secrets**:
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_WEBHOOK_SECRET  # random 32-char
   wrangler secret put USER_CHAT_ID
   wrangler secret put GEMINI_API_KEY
   wrangler secret put GLM_API_KEY
   ```

### First deploy

9. **Deploy Worker**:
   ```bash
   cd worker
   wrangler deploy
   # Output: https://lengger-bot.<your-username>.workers.dev
   ```

10. **Set Telegram webhook**:
    ```bash
    curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
      -d "url=https://lengger-bot.<your-username>.workers.dev/api/telegram-webhook" \
      -d "secret_token=<SECRET>"
    ```

11. **Verify**:
    ```bash
    curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
    # Should show "url": "https://lengger-bot...", "pending_update_count": 0
    ```

12. **Test via Telegram**:
    - Send `/help` to bot → should reply with command list
    - Send a sample Info Lengger photo → should reply with .md
    - Reply to the .md with `/convert` → should get .xlsx

### CI/CD setup (optional but recommended)

13. **Get Cloudflare API token**:
    - Cloudflare dashboard → My Profile → API Tokens → Create
    - Template: "Edit Workers" — copy token

14. **Add to GitHub repo secrets**:
    - Settings → Secrets → Actions → New: `CLOUDFLARE_API_TOKEN`

15. **Push to main**:
    - GitHub Action auto-deploys on every push to `worker/` or `src/lib/budaya/`

---

## 17. Cost Analysis (Confirm $0/month)

| Component | Free Tier | Our Usage | Monthly Cost |
|---|---|---|---|
| Cloudflare Workers | 100K req/day, 10ms CPU, 128MB RAM | ~5-10 req/day | $0 |
| Cloudflare KV | 100K reads/day, 1K writes/day | ~10 reads, ~5 writes/day | $0 |
| Cloudflare Cron Triggers | 3 per worker | 0 (v1), 3 (v1.2 future) | $0 |
| GitHub repo | unlimited | 1 repo | $0 |
| GitHub Actions | 2K min/month free | ~5 min/month | $0 |
| Telegram Bot API | unlimited | 5-10 msg/day | $0 |
| Gemini 3 Flash | 1,500 RPD | 1-5 RPD | $0 |
| GLM-4.6-Flash | always free | 0-5 req/day | $0 |
| **TOTAL** | | | **$0/month** |

**One-time costs**: $0 (no hardware).

**Electricity**: $0 (no hardware).

**Total**: $0/month, $0 one-time. Truly free.

---

## 18. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini 3 Flash deprecated (Google cycles every 6-9 months) | Medium | Low (one-line env change) | Watch `ai.google.dev/gemini-api/docs/models` monthly. Switch to `gemini-flash-latest` or next Flash variant. |
| GLM-4.6-Flash removed from free tier | Low (Z.ai markets as "always free") | Low (typo fix optional) | Switch to `glm-4.7-flash` or `glm-4.5-flash`. |
| IG mobile web API breaks (for v1.2 auto-scrape) | Medium | Medium (lose auto-scrape) | v1 manual upload still works. Research alternative endpoints or hybrid Mini PC. |
| Cloudflare Workers free tier limits change | Low (very stable) | Medium (might need Paid $5/mo) | Monitor usage via `/status`. Workers Paid is $5/mo if exceeded — still cheap. |
| Telegram webhook timeout (>60s) | Low (our pipeline ~20-25s) | Medium (Telegram retries, may duplicate) | Worker responds 200 immediately, processes via `ctx.waitUntil()`. Pipeline well under 60s. |
| Gemini rate limit during manual `/ocr` burst | Low | Low (fallback kicks in) | Fallback hierarchy (§10). |
| API key leaked via git | Low (`.gitignore` checked) | High (secrets exposed) | Pre-commit hook. Rotate keys immediately if leaked. |
| `wrangler deploy` fails | Low | Low (old version stays live) | GitHub Action shows error. Manual `wrangler rollback` to revert. |
| Cloudflare outage | Very low | Low (bot down until resolved) | Cloudflare status page. Rare. |
| KV write limit exceeded (1K/day) | Very low (we use ~5) | Low | Switch to Workers Durable Objects (free tier available). |
| IG bans dummy account (v1.2) | Low (1 req/day) | Low (manual upload fallback) | Create 2 accounts, rotate. |

---

## 19. Timeline

| Phase | Days | Work | Output |
|---|---|---|---|
| **Phase 1** | Day 1-2 | Develop `worker/` scaffold: config, handlers, send, webhook. Mock Gemini + GLM for unit tests. | Worker runs locally, `/help`, `/status` reply. |
| **Phase 2** | Day 3 | Wire real Gemini VLM + GLM LLM. Test `/ocr` with sample photos. | End-to-end works locally. |
| **Phase 3** | Day 4 | Wire `/convert` (reuse `parseMd` + `generateXlsx`). Test with sample .md → .xlsx. | All commands work locally. |
| **Phase 4** | Day 5 | Deploy to Cloudflare. Set webhook. Test from real Telegram. | Bot live, responding to commands. |
| **Phase 5** | Day 6 | Set up GitHub Actions CI/CD. Test auto-deploy on push. | Auto-update working. |
| **Phase 6** | Day 7 | Documentation (`worker/README.md`), `/status` monitor, final review. | Acceptance criteria met. |
| **Future v1.2** | TBD | Research IG mobile web API. Add cron + auto-scrape. | Auto-download daily. |
| **Future v2** | TBD | Mini PC at home (runs `instagram-private-api` natively, pushes to Worker). | Full automation, no IG API limits. |

---

## 20. Acceptance Criteria (Definition of "Done")

- [ ] Bot responds to `/help` with command list within 2 seconds
- [ ] Bot responds to `/status` with health info (last run, quotas, errors)
- [ ] Bot responds to `/ocr` (reply to photo) by running Gemini VLM and returning `.md` (text preview + file)
- [ ] Bot responds to `/convert` (reply to `.md` file) by returning `.xlsx` file
- [ ] Bot responds to `/today` with reminder prompt (v1.2: will auto-scrape)
- [ ] Fallback: if Gemini VLM fails (429/5xx/empty), user gets raw photo + "manual mode" notice
- [ ] Auth gate: messages from chat_id !== USER_CHAT_ID are silently dropped
- [ ] Webhook secret verification (401 on mismatch)
- [ ] All secrets set via `wrangler secret put` (not in code/git)
- [ ] Worker deployed to Cloudflare (`wrangler deploy`)
- [ ] Telegram webhook set and verified (`getWebhookInfo` shows correct URL)
- [ ] Logs visible via `wrangler tail`
- [ ] KV stores: last_run, quota_today
- [ ] GitHub Actions CI/CD auto-deploys on push to `worker/` or `src/lib/budaya/`
- [ ] Total monthly cloud cost: **$0**
- [ ] Total monthly API calls: 1-5 Gemini/day, 0-5 GLM/day, 5-10 Telegram/day
- [ ] End-to-end pipeline (photo → VLM → LLM → .md reply) completes in under 30 seconds
- [ ] Existing web UI (`src/app/page.tsx`) continues to work unchanged
- [ ] `worker/` and `src/lib/budaya/` share parser codebase via tsconfig path alias (no duplicate logic)
- [ ] `/health` endpoint returns 200 with timestamp (for uptime monitoring)

---

## 21. Open Questions (Decisions needed before PLAN-2 build phase)

1. **Gemini model**: Confirm `gemini-3-flash` (recommended) vs `gemini-flash-latest` (auto-update)?
2. **GLM model**: Confirm `glm-4.6-flash` (recommended) vs `glm-4.7-flash` (newest)?
3. **Telegram framework**: Confirm grammY (recommended)?
4. **Cloudflare account**: Already have, or need to create?
5. **GitHub repo**: Public or private? (Both free; private recommended for `.env` safety)
6. **Bot pre-fill `bukti` column**: When user `/convert`s .md → .xlsx, should bot auto-fill `bukti` column with today's date or leave empty for user? (Recommendation: leave empty — user fills context)
7. **Web UI on Cloudflare Pages**: Should the Next.js web UI (`src/app/page.tsx`) also deploy to Cloudflare Pages (free) as a companion to the Worker? Or keep it only for local dev? (Recommendation: deploy to Pages too — gives a web fallback when bot is down)
8. **IG auto-scrape priority**: Nice-to-have for v1.2, or defer to Mini PC phase? (Recommendation: defer — manual upload is fine for 1/day)

---

## 22. Future: Mini PC Migration Path (deferred)

When the user is ready to invest in hardware (Mini PC instead of STB), the architecture evolves:

```
Mini PC at home (Intel N100 / N95, 8-16GB RAM, ~$150-200)
  ├── docker compose
  │   ├── lengger-bot (Node.js + grammY, long polling)
  │   ├── ig-scraper (Node.js + instagram-private-api, full Node APIs)
  │   └── web-ui (Next.js, served on LAN)
  └── cron: 15:00 WIB daily auto-scrape

Cloudflare Worker (optional, remains as Telegram-facing layer)
  └── receives photos from Mini PC, runs VLM/LLM, replies to user
```

**Mini PC advantages over STB**:
- Full x86_64 Linux (any distro, official support)
- 8-16GB RAM standard (not the rare 8GB STB)
- NVMe SSD standard (no SD card wear-out)
- More reliable 24/7 (proper cooling, power management)
- Can run Docker (much easier deployment)

**Mini PC candidates** (when user is ready):
- Beelink S12 Pro (Intel N100, 16GB, ~$180)
- Minisforum UN100L (Intel N100, 16GB, ~$200)
- Chuwi LarkBox Pro (Intel N100, 16GB, ~$220)

**Migration plan** (when ready):
1. Mini PC runs `instagram-private-api` natively for IG scraping
2. Mini PC pushes photos to Cloudflare Worker (HTTP POST)
3. Worker unchanged — still handles Telegram + VLM + LLM
4. OR: Mini PC runs the entire bot (long polling, no Worker needed)

This is **v2/v3 scope** — not blocking v1 (Cloudflare Workers + manual upload).

---

## End of Plan — PLAN-1.1

**Next steps**:
1. User reviews this plan (focus on §21 Open Questions)
2. User confirms decisions (8 items)
3. User approves PLAN-2 (build phase)
4. Build phase starts: `worker/` scaffold → VLM module → handlers → deploy

**File location**: This plan is at `/home/z/my-project/PLAN.md` and is included in `source.zip` (downloadable from the web UI's "Source" button).
