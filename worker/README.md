# Lengger Bot — Cloudflare Worker (Bot Telegram)

Bot Telegram yang meng-OCR foto "Info Lengger" pakai **Gemini 3 Flash VLM** + **GLM-4.7-Flash** untuk fix typo, dan konversi `.md` → `.xlsx` memakai parser yang sudah ada di `src/lib/budaya/`.

**Biaya:** $0/bulan (semua free tier). **Tanpa hardware.** Deploy di Cloudflare Workers (edge, tanpa cold start).

---

## Daftar Isi

1. [Arsitektur](#arsitektur)
2. [Checklist Cepat](#checklist-cepat)
3. [Panduan Step-by-Step](#panduan-step-by-step)
   - [Langkah 1: Buat akun](#langkah-1-buat-akun)
   - [Langkah 2: Buat bot Telegram](#langkah-2-buat-bot-telegram)
   - [Langkah 3: Dapatkan Chat ID Anda](#langkah-3-dapatkan-chat-id-anda)
   - [Langkah 4: Dapatkan API keys](#langkah-4-dapatkan-api-keys)
   - [Langkah 5: Clone repo & install](#langkah-5-clone-repo--install)
   - [Langkah 6: Login ke Cloudflare](#langkah-6-login-ke-cloudflare)
   - [Langkah 7: Buat KV namespace](#langkah-7-buat-kv-namespace)
   - [Langkah 8: Set secrets](#langkah-8-set-secrets)
   - [Langkah 9: Deploy Worker](#langkah-9-deploy-worker)
   - [Langkah 10: Set webhook Telegram](#langkah-10-set-webhook-telegram)
   - [Langkah 11: Init menu bot](#langkah-11-init-menu-bot)
   - [Langkah 12: Test](#langkah-12-test)
4. [Deploy Web UI ke Cloudflare Pages](#deploy-web-ui-ke-cloudflare-pages)
5. [CI/CD: Auto-deploy saat git push](#cicd-auto-deploy-saat-git-push)
6. [Perintah Bot](#perintah-bot)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)
9. [Struktur Project](#struktur-project)
10. [Limit](#limit-cloudflare-workers-free-tier)

---

## Arsitektur

```
GitHub (source code, gratis)
  ├── src/          → Cloudflare Pages (web UI, static export)
  ├── worker/       → Cloudflare Workers (bot Telegram)
  └── .github/      → CI/CD auto-deploy saat push

Cloudflare (semua, gratis):
  ├── Pages:  lengger-ledger.pages.dev    (web UI — upload manual + OCR browser)
  └── Workers: lengger-bot.workers.dev   (bot Telegram — VLM + LLM + parser)

Cuma 4 alat:
  1. GitHub (source code, gratis)
  2. Cloudflare (Pages + Workers, gratis)
  3. Telegram (@BotFather, gratis)
  4. API keys: Gemini (aistudio.google.com) + GLM-4.7-flash (open.bigmodel.cn)
```

### Alur Bot

```
User kirim foto ke bot Telegram
  → Worker webhook (POST /api/telegram-webhook)
  → Download foto via API getFile Telegram (fetch)
  → Base64 encode
  → Gemini 3 Flash VLM → teks MD (akurasi 95%)
  → (Opsional) GLM-4.7-Flash fix typo
  → Balas: preview teks .md + file .md terlampir
```

Rencana v1.2: auto-scrape IG (cron 15:00 WIB) via IG mobile web API.

---

## Checklist Cepat

Print checklist ini dan centang tiap langkah:

```
[ ] 1. Akun GitHub dibuat (https://github.com/signup)
[ ] 2. Akun Cloudflare dibuat (https://dash.cloudflare.com/sign-up)
[ ] 3. Bot Telegram dibuat via @BotFather → token disimpan
[ ] 4. USER_CHAT_ID ketemu → disimpan
[ ] 5. API key Gemini didapat (https://aistudio.google.com/apikey)
[ ] 6. API key GLM didapat (https://open.bigmodel.cn)
[ ] 7. Repo di-clone ke laptop: git clone <repo-anda>
[ ] 8. Deps worker ter-install: cd worker && npm install
[ ] 9. Wrangler login: npx wrangler login
[ ] 10. KV namespace dibuat → ID di-paste ke wrangler.toml
[ ] 11. 5 secrets di-set via wrangler secret put
[ ] 12. Worker ter-deploy: npm run deploy → URL disimpan
[ ] 13. Webhook Telegram di-set: curl setWebhook
[ ] 14. Menu bot di-init: /init dikirim ke bot
[ ] 15. Test: /help dikirim → bot balas
[ ] 16. Test: foto dikirim → bot balas .md
[ ] 17. (Opsional) GitHub secrets di-set untuk CI/CD
[ ] 18. (Opsional) Web UI di-deploy ke Cloudflare Pages
```

---

## Panduan Step-by-Step

### Langkah 1: Buat akun

Semua gratis, tanpa kartu kredit.

| Akun | URL | Yang Anda dapat |
|------|-----|-----------------|
| GitHub | https://github.com/signup | Username + repo untuk source code |
| Cloudflare | https://dash.cloudflare.com/sign-up | Account ID + akses dashboard |
| Telegram | https://web.telegram.org (atau aplikasi HP) | Akun untuk chat dengan bot |

**Estimasi waktu:** 10 menit (ketiganya signup verifikasi email).

---

### Langkah 2: Buat bot Telegram

1. Buka Telegram, cari **`@BotFather`** (terverifikasi, centang biru).
2. Kirim `/newbot`.
3. BotFather tanya: *Choose a name for your bot.* Ketik nama apa saja, misal `Lengger OCR Bot`.
4. BotFather tanya: *Choose a username.* Harus akhiran `bot`. Misal `lengger_ocr_bot`.
5. BotFather balas:
   ```
   Done! Congratulations on your new bot. ...
   Use this token to access the HTTP API:
   1234567890:AAH...token-anda-di-sini
   ```
6. **Copy token** → simpan sebagai `TELEGRAM_BOT_TOKEN` (akan di-set di Langkah 8).

---

### Langkah 3: Dapatkan Chat ID Anda

Bot cuma boleh merespon ke ANDA (bukan orang lain yang nemu bot-nya). Anda butuh `USER_CHAT_ID` pribadi.

1. Kirim pesan apa saja (misal "hai") ke bot yang baru dibuat.
2. Buka URL ini di browser (ganti `<TOKEN>` dengan token bot Anda):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Cari `"chat":{"id":XXXXXXXXX,"first_name":"...","type":"private"}`.
4. **Copy angkanya** `XXXXXXXXX` → simpan sebagai `USER_CHAT_ID` (akan di-set di Langkah 8).

**Alternatif:** Kirim pesan ke `@userinfobot` — dia balas dengan chat ID Anda.

---

### Langkah 4: Dapatkan API keys

#### API key Gemini (untuk VLM OCR)

1. Buka https://aistudio.google.com/apikey
2. Klik **"Create API key"**.
3. Pilih Google Cloud project (atau buat baru — gratis).
4. **Copy key-nya** (mulai dengan `AIzaSy...`) → simpan sebagai `GEMINI_API_KEY`.

**Free tier:** 1.500 request/hari. Anda pakai 1-5/hari.

#### API key GLM (untuk fix typo)

1. Buka https://open.bigmodel.cn
2. Daftar (gratis, email atau HP).
3. Buka **API Keys** (menu kanan atas → "API Keys").
4. Klik **"Add API Key"**.
5. **Copy key-nya** → simpan sebagai `GLM_API_KEY`.

**Free tier:** GLM-4.7-flash "selalu gratis" (request unlimited, fair use).

---

### Langkah 5: Clone repo & install

```bash
# Clone repo Anda (ganti dengan URL repo Anda)
git clone https://github.com/<username-anda>/lengger-ledger-converter.git
cd lengger-ledger-converter

# Masuk ke folder worker
cd worker

# Install dependencies
npm install
```

**Verifikasi:**
```bash
npx tsc --noEmit   # harusnya tidak ada output (0 error)
```

---

### Langkah 6: Login ke Cloudflare

```bash
npx wrangler login
```

Ini buka browser. Klik **"Allow"** untuk authorize Wrangler. Anda harus lihat:

```
✅ Successfully logged in.
```

**Verifikasi:**
```bash
npx wrangler whoami   # harusnya tampil email + account ID Anda
```

**Copy Account ID Anda** (tampil di output `whoami`) — dibutuhkan nanti untuk deploy Pages.

---

### Langkah 7: Buat KV namespace

Cloudflare KV adalah key-value store untuk session + tracking quota.

```bash
npx wrangler kv:namespace create BOT_KV
```

Output:
```
{ "id": "abcdef1234567890abcdef1234567890" }
```

**Copy nilai `id`** (string hex panjang).

Sekarang buka `worker/wrangler.toml` di editor. Cari baris:
```toml
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```
Ganti dengan ID asli Anda:
```toml
id = "abcdef1234567890abcdef1234567890"
```

Simpan file.

---

### Langkah 8: Set secrets

Jalankan tiap command — prompt minta Anda paste nilainya (input tersembunyi):

```bash
# 1. Token bot Telegram (dari Langkah 2)
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: 1234567890:AAH...token-anda

# 2. Webhook secret (generate string random — lihat bawah)
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Paste: string random 32-karakter

# 3. Chat ID Anda (dari Langkah 3)
npx wrangler secret put USER_CHAT_ID
# Paste: 123456789

# 4. API key Gemini (dari Langkah 4)
npx wrangler secret put GEMINI_API_KEY
# Paste: AIzaSy...

# 5. API key GLM (dari Langkah 4)
npx wrangler secret put GLM_API_KEY
# Paste: key-glm-anda
```

#### Cara generate TELEGRAM_WEBHOOK_SECRET

Jalankan ini di terminal untuk generate string random 32-karakter:
```bash
openssl rand -hex 16
# Output: a1b2c3d4e5f6... (32 karakter)
```
Atau pakai generator string random apa saja. **Simpan nilai ini** — dibutuhkan lagi di Langkah 10 saat set webhook.

**Verifikasi secrets sudah ter-set:**
```bash
npx wrangler secret list
# Harusnya tampil 5 secrets
```

---

### Langkah 9: Deploy Worker

```bash
npm run deploy
# Ini jalanin: wrangler deploy
```

Output:
```
Published lengger-bot
  https://lengger-bot.<subdomain-anda>.workers.dev
```

**Copy URL ini** — dibutuhkan untuk webhook (Langkah 10).

**Verifikasi deploy:**
```bash
curl https://lengger-bot.<subdomain-anda>.workers.dev/health
# Harus balas: {"status":"ok","timestamp":"...","version":"1.0.0"}
```

---

### Langkah 10: Set webhook Telegram

Kasih tahu Telegram kemana kirim update bot.

**Ganti `<TOKEN>` dan `<SECRET>` dan `<WORKER_URL>`:**

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=<WORKER_URL>/api/telegram-webhook" \
  -d "secret_token=<SECRET>"
```

Contoh:
```bash
curl "https://api.telegram.org/bot1234567890:AAH.../setWebhook" \
  -d "url=https://lengger-bot.nama-anda.workers.dev/api/telegram-webhook" \
  -d "secret_token=a1b2c3d4e5f6..."
```

**Verifikasi webhook ter-set:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Harus tampil:
```json
{
  "ok": true,
  "result": {
    "url": "https://lengger-bot.nama-anda.workers.dev/api/telegram-webhook",
    "pending_update_count": 0
  }
}
```

Kalau `pending_update_count` > 0, ada error — cek [Troubleshooting](#troubleshooting).

---

### Langkah 11: Init menu bot

1. Buka Telegram, cari bot Anda (search by username, misal `@lengger_ocr_bot`).
2. Kirim `/init`.
3. Bot balas:
   ```
   ✅ Bot menu initialized!

   Ketik / di chat untuk lihat command autocomplete:
     • /ocr — Reply to a photo: run Gemini VLM → reply .md
     • /convert — Reply to a .md file: convert to .xlsx
     • /today — Reminder: screenshot today's IG post
     • /status — Show bot health and API quotas
     • /help — Show all commands
     • /init — Setup bot command menu (run once after deploy)
   ```

Sekarang saat Anda ketik `/` di chat, menu autocomplete tampil semua command.

---

### Langkah 12: Test

1. **`/help`** → bot balas dengan daftar command.
2. **`/status`** → bot balas dengan info health (last run, quotas, runtime).
3. **Kirim foto** (foto apa saja yang ada teksnya) → bot balas dengan:
   - Preview teks (500 karakter pertama)
   - File `.md` terlampir
4. **Reply file `.md` dengan `/convert`** → bot balas dengan file `.xlsx`.

**Kalau ada langkah yang gagal, lihat [Troubleshooting](#troubleshooting).**

✅ **Setup selesai!** Bot sudah live dan siap pakai harian.

---

## Deploy Web UI ke Cloudflare Pages

Web UI Next.js (`src/app/page.tsx`) bisa deploy ke Cloudflare Pages — kasih URL publik untuk upload manual + OCR browser, sebagai pendamping bot Telegram.

### Kenapa pakai Pages + Workers?

| Platform | Hosts | Use case |
|----------|-------|----------|
| Cloudflare Pages | Web UI (static, `out/`) | Upload manual .md/.csv/foto → preview → .xlsx (browser-side) |
| Cloudflare Workers | Bot Telegram | Otomatis: kirim foto → bot balas .md (VLM server-side) |

Keduanya gratis. Keduanya auto-deploy dari GitHub. Keduanya di Cloudflare — satu akun, satu dashboard.

### Step-by-step deploy Pages

1. **Dari root project** (BUKAN folder worker/):
   ```bash
   cd ..   # kalau masih di worker/
   ```

2. **Buat project Pages**:
   ```bash
   npx wrangler pages project create lengger-ledger --production-branch=main
   ```

3. **Build static export**:
   ```bash
   npm run build          # next.config.ts output: "export" → generate out/
   npm run build:source   # generate source.zip (untuk tombol "Source")
   cp public/source.zip out/source.zip
   ```

4. **Deploy**:
   ```bash
   npx wrangler pages deploy out/ --project-name=lengger-ledger
   # Output: https://lengger-ledger.pages.dev
   ```

5. **Verifikasi**: Buka `https://lengger-ledger.pages.dev` di browser → harus tampil web UI Lengger Converter.

---

## CI/CD: Auto-deploy saat git push

**Setelah setup sekali, tiap `git push` auto-deploy Pages + Workers.**

### Langkah 1: Dapatkan Cloudflare API token

1. Cloudflare dashboard → **My Profile** (kanan atas) → **API Tokens**.
2. Klik **"Create Token"**.
3. Pakai template **"Edit Cloudflare Workers"** — ATAU buat custom dengan permission:
   - Account → Workers Scripts → Edit
   - Account → Workers KV Storage → Edit
   - Account → Account Settings → Read
   - Account → Cloudflare Pages → Edit
4. Klik **"Continue to summary"** → **"Create Token"**.
5. **Copy token** → simpan sebagai `CLOUDFLARE_API_TOKEN`.

### Langkah 2: Dapatkan Account ID

1. Cloudflare dashboard → lihat sidebar kanan → **Account ID**.
2. **Copy** → simpan sebagai `CLOUDFLARE_ACCOUNT_ID`.

### Langkah 3: Tambah ke GitHub secrets

1. Buka repo GitHub Anda → **Settings** → **Secrets and variables** → **Actions**.
2. Klik **"New repository secret"**.
3. Tambah 2 secrets:
   - Name: `CLOUDFLARE_API_TOKEN`, Value: token Anda
   - Name: `CLOUDFLARE_ACCOUNT_ID`, Value: account ID Anda

### Langkah 4: Push ke GitHub

```bash
git add .
git commit -m "setup: worker + pages deploy"
git push origin main
```

**Verifikasi auto-deploy:**
1. Buka repo GitHub Anda → tab **Actions**.
2. Harus tampil 2 workflow jalan:
   - "Deploy Worker to Cloudflare"
   - "Deploy Web UI to Cloudflare Pages"
3. Keduanya harus hijau ✅ dalam 2-3 menit.
4. Worker live di: `https://lengger-bot.<subdomain-anda>.workers.dev`
5. Pages live di: `https://lengger-ledger.pages.dev`

### Workflow mana yang trigger kapan?

| File yang berubah saat git push | Workflow yang trigger |
|----------------------------------|----------------------|
| `worker/**` | deploy-worker.yml (bot) |
| `src/lib/budaya/**` | deploy-worker.yml (bot — parser di-share) |
| `src/**` (kecuali lib/budaya) | deploy-pages.yml (web UI) |
| `public/**` | deploy-pages.yml (web UI) |
| `next.config.ts`, `package.json`, dll | deploy-pages.yml (web UI) |
| `worker/**` + `src/**` | Keduanya paralel |
| `PLAN.md`, `README.md` saja | Tidak ada yang trigger |

---

## Perintah Bot

| Perintah | Trigger | Apa yang terjadi |
|----------|---------|------------------|
| `/init` | Ketik sekali setelah deploy | Call `setMyCommands` → isi menu autocomplete `/` |
| `/help` atau `/start` | Kapan saja | Tampilkan daftar command |
| `/status` | Kapan saja | Tampilkan: last run, quota hari ini (Gemini/GLM/Telegram), info runtime |
| `/today` | Kapan saja | Reminder: cara screenshot pinned post @wonosobonyawijiingseni hari ini |
| `/ocr` | Reply ke foto, ATAU kirim foto langsung | Download foto → Gemini VLM OCR → (opsional) GLM fix → balas `.md` (teks + file) |
| `/convert` | Reply ke file `.md`, ATAU kirim `.md` langsung | Download `.md` → `parseMd` + `generateXlsx` → balas file `.xlsx` |
| *(tanpa command)* | Kirim foto langsung | Sama seperti `/ocr` (auto-detected) |
| *(tanpa command)* | Kirim `.md` langsung | Sama seperti `/convert` (auto-detected) |

**Auth:** Bot cuma merespon ke `USER_CHAT_ID`. User lain di-drop diam-diam.

---

## Troubleshooting

### Bot tidak merespon pesan

1. **Cek status webhook:**
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```
   - Kalau `url` kosong → webhook belum di-set (ulangi Langkah 10)
   - Kalau `pending_update_count > 0` → webhook gagal (cek log)
   - Kalau `last_error_message` ada → lihat error itu

2. **Cek log Worker (real-time):**
   ```bash
   cd worker
   npx wrangler tail
   ```
   Biarkan jalan saat Anda kirim pesan ke bot — Anda lihat error live.

3. **Verifikasi secrets ter-set:**
   ```bash
   npx wrangler secret list
   ```
   Harus tampil 5 secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, USER_CHAT_ID, GEMINI_API_KEY, GLM_API_KEY.

4. **Cek endpoint `/health`:**
   ```bash
   curl https://lengger-bot.<subdomain-anda>.workers.dev/health
   ```
   Harus balas `{"status":"ok",...}`.

### Bot balas "Unauthorized" (401)

`TELEGRAM_WEBHOOK_SECRET` tidak cocok. Salah satu:
- Anda set secret berbeda di `wrangler secret put` vs `curl setWebhook -d "secret_token=..."`
- Fix: set ke nilai yang SAMA. Ulangi Langkah 8 (secret put) dan Langkah 10 (setWebhook).

### Bot tidak merespon pesan ANDA (padahal Anda owner)

`USER_CHAT_ID` Anda salah. Verifikasi:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```
Lihat `"from":{"id":XXXX}` — itu chat ID asli Anda. Update:
```bash
npx wrangler secret put USER_CHAT_ID
# Paste ID yang benar
```

### VLM (Gemini) gagal

1. **Cek API key valid:** https://aistudio.google.com/apikey — pastikan aktif.
2. **Cek rate limit:** kirim `/status` ke bot — lihat "Gemini VLM: X / 1500 RPD".
3. **Cek nama model:** harus `gemini-3-flash` (lihat `worker/src/config.ts`).
   - `gemini-2.0-flash` sudah MATI (shut down 2026-06-01).
   - Kalau Google deprecate `gemini-3-flash`, ganti ke `gemini-flash-latest` di config.
4. **Fallback:** kalau Gemini gagal, bot kirim foto mentah balik + notice "manual mode".

### /convert gagal ("Tidak ada entri terdeteksi")

Format file `.md` salah. Cek:
- Harus ada header `Info Lengger <Hari>, DD Bulan YYYY` (mis. `Info Lengger Sabtu, 20 Juni 2026`)
- Harus ada entry mulai dengan `<n>_<lokasi> Kec: X Kab: Y` (underscore setelah angka!)
- Lihat `samples/*.md` untuk contoh format yang benar.

### Worker deploy gagal

1. **"KV namespace not found":** Anda belum ganti `REPLACE_WITH_KV_NAMESPACE_ID` di `wrangler.toml`. Ulangi Langkah 7.
2. **"Missing secrets":** Anda belum set semua 5 secrets. Ulangi Langkah 8.
3. **TypeScript errors:** Jalankan `npx tsc --noEmit` lokal dan fix error sebelum deploy.

### GitHub Actions gagal

1. **"Missing CLOUDFLARE_API_TOKEN":** Anda belum tambah GitHub secrets. Ulangi CI/CD Langkah 3.
2. **"Authentication error":** Token invalid atau expired. Recreate di Cloudflare dashboard.
3. **"Pages project not found":** Buat project dulu (Pages deploy Langkah 2).

---

## FAQ

**Q: Bisakah saya pakai bot tanpa web UI?**
A: Bisa. Bot Telegram standalone penuh. Web UI opsional (untuk fallback upload manual).

**Q: Bagaimana kalau saya exceed free tier?**
A: Cloudflare Workers: 100K req/hari (Anda pakai ~5-10). Gemini: 1.500 RPD (Anda pakai 1-5). GLM: selalu gratis. Telegram: unlimited. Tidak akan exceed.

**Q: Bagaimana cara update code bot?**
A: `git push origin main` → GitHub Actions auto-deploy. Tidak perlu `wrangler deploy` manual (setelah CI/CD setup).

**Q: Bagaimana cara ubah jadwal cron (rencana v1.2)?**
A: Edit `worker/wrangler.toml` → `[triggers] crons = ["0 8 * * *"]` → ubah cron expression → `git push`.

**Q: Apa yang terjadi kalau API Gemini down?**
A: Bot fallback ke "manual mode" — kirim foto mentah balik dengan notice. Anda bisa upload ke web UI untuk OCR Tesseract browser-side.

**Q: Bisakah orang lain pakai bot saya?**
A: Tidak. Bot cuma merespon ke `USER_CHAT_ID`. User lain di-drop diam-diam (tidak dibalas, tidak error).

**Q: Berapa biaya total?**
A: $0/bulan. Semua free tier. Tanpa kartu kredit untuk semua service.

---

## Struktur Project

```
worker/
├── wrangler.toml              # Config Cloudflare (KV, cron, nodejs_compat)
├── package.json               # deps: @google/genai, openai, exceljs, wrangler
├── tsconfig.json              # path alias @budaya/* → ../src/lib/budaya/*
├── .dev.vars.example          # template env local dev (copy ke .dev.vars)
├── README.md                  # file ini
├── src/
│   ├── index.ts               # main entry: handler fetch() + scheduled()
│   ├── config.ts              # CONFIG constants + validateEnv() + maskKey()
│   ├── types.ts               # Env, VlmResult, TelegramUpdate, dll.
│   ├── telegram/
│   │   ├── webhook.ts         # verify secret + parse update + dispatch
│   │   ├── handlers.ts        # /help /init /status /ocr /convert /today
│   │   └── send.ts            # sendMdAsText, sendMdAsFile, sendStatus, sendHelp
│   ├── ai/
│   │   ├── prompts.ts         # system prompt VLM + LLM (format Info Lengger)
│   │   ├── vlm-ocr.ts         # call Gemini 3 Flash vision
│   │   ├── llm-fix.ts         # fix typo GLM-4.7-Flash (non-fatal)
│   │   └── fallback.ts        # reply foto mentah saat VLM gagal
│   ├── cron/
│   │   └── scheduler.ts       # v1.2 IG auto-scrape (stub untuk v1)
│   └── utils/
│       ├── budaya-bridge.ts   # import parseMd/generateXlsx dari ../src/lib/budaya/
│       ├── kv.ts              # helper Cloudflare KV (quota, last_run)
│       ├── retry.ts           # exponential backoff untuk fetch
│       └── logger.ts          # console.log + masking secret
└── (node_modules/ — install via npm install)
```

### Reuse parser

Worker import `src/lib/budaya/*` (parser, xlsx-generator, normalize-input) via tsconfig path alias:

```typescript
import { parseMd } from "@budaya/md-parser";
import { generateXlsx } from "@budaya/xlsx-generator";
import { normalizeInput } from "@budaya/normalize-input";
```

Bot dan web UI pakai parser yang PERSIS SAMA — tanpa duplikasi. Kalau Anda update `src/lib/budaya/md-parser.ts`, bot otomatis pakai logic baru saat deploy berikutnya.

---

## Limit (Cloudflare Workers free tier)

| Resource | Free Tier | Pemakaian Kita | OK? |
|---|---|---|---|
| Requests/hari | 100.000 | ~5-10 | ✅ 0.01% |
| CPU per invocation | 10ms | ~2-5ms (base64 + JSON) | ✅ |
| Memory | 128MB | ~30-50MB (1 image) | ✅ |
| Subrequests (fetch) | 50 per invocation | 5 (Telegram+Gemini+GLM+2 sends) | ✅ |
| KV reads | 100K/hari | ~5-10 | ✅ |
| KV writes | 1K/hari | ~5 | ✅ |
| Cron Triggers | 3 per worker | 0 (v1), 1 (v1.2 future) | ✅ |
| Cold start | TIDAK ADA (edge, always warm) | — | ✅ |

---

## Lihat Juga

- **`PLAN.md`** — plan implementasi komprehensif (22 section, arsitektur, risiko, timeline)
- **`src/lib/budaya/`** — logic parser (di-share dengan web UI)
- **`src/app/page.tsx`** — web UI (fallback upload manual, OCR Tesseract browser-side)
- **`samples/`** — contoh file `.md` Info Lengger untuk test
- **`worklog.md`** — log development (PLAN-1 → PLAN-1.1 → PLAN-2 code)
