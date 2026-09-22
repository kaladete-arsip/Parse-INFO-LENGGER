# Lengger Bot — Daily TikTok → VLM OCR → Markdown

Bot harian yang download foto asli dari TikTok (post `@wonosobonyawijiingseni`), VLM OCR untuk extract data Info Lengger, simpan `YYYY-MM-DD-raw.md` + foto asli, kirim report Telegram, sync ke Supabase (opsional).

**Tidak halu** — VLM hanya menulis apa yang terlihat di foto. Jika field tidak terbaca, baris field dihapus (tidak ditulis kosong). Genre non-sinden (WAROK, JARANAN & WAROK, TAYUB) memang tidak ada baris `Sinden:`.

---

## Arsitektur

```
┌─────────────┐   tikwm.com    ┌──────────┐   VLM OCR   ┌──────────┐
│ TikTok post │ ──────────────▶│  Download │ ──────────▶│  z-ai    │
│ (photo/...) │  (proxy, HD)   │  photos  │  (base64)  │  VLM     │
└─────────────┘                └──────────┘            └──────────┘
                                                              │
                                                              ▼
┌──────────┐   LLM fix    ┌──────────┐   save      ┌──────────────────┐
│  z-ai    │ ◀────────────│ raw OCR  │            │ storage/<date>/  │
│  LLM     │ ────────────▶│  text    │            │  <date>-raw.md   │
└──────────┘               └──────────┘            │  meta.json      │
                                                    │  photos/<date>.jpeg │
                                                    └──────────────────┘
                                                              │
                              ┌───────────────────────────────┤
                              ▼                               ▼
                     ┌────────────────┐            ┌──────────────────┐
                     │ Telegram report │            │ Supabase (opt.)  │
                     │ "...ada N lokasi"│           │ Storage + DB     │
                     └────────────────┘            └──────────────────┘
```

**Mengapa tikwm.com?** TikTok langsung geo-block sandbox ini (IP ter-detect HK, TikTok HK sudah tutup). `tikwm.com/api/?url=<post_url>` adalah proxy yang fetch dari server non-HK dan return URL CDN asli TikTok → kita download JPEG full-res (1740×2176).

---

## Quick Start (local dev)

```bash
cd mini-services/lengger-bot
cp .env.example .env   # edit if you want Telegram/Supabase
bun install
bun run dev             # starts on http://localhost:3031
```

Bot langsung jalan. Cron catch-up: kalau sekarang sudah lewat 15:00 WIB dan folder hari ini belum ada, pipeline langsung jalan.

Buka web UI di `http://localhost:81/` → tab **Bot Daily** → klik tanggal → lihat foto asli + raw md.

---

## API Endpoints

All via Caddy gateway (`:81`) with `?XTransformPort=3031`:

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/days?XTransformPort=3031` | List semua hari yang sudah diproses |
| `GET` | `/api/day/:date?XTransformPort=3031` | Detail 1 hari (meta + rawMd + finalMd + photos) |
| `GET` | `/api/photo/:date/:filename?XTransformPort=3031` | Serve file foto asli |
| `POST` | `/api/run?XTransformPort=3031` | Trigger pipeline untuk hari ini |
| `POST` | `/api/run/:date?XTransformPort=3031` | Trigger pipeline untuk tanggal spesifik |
| `POST` | `/api/run/:date?url=<tiktok_url>&XTransformPort=3031` | Trigger dengan URL TikTok spesifik |
| `POST` | `/api/day/:date/final?XTransformPort=3031` | Simpan final md (user-edited + narasi) |
| `POST` | `/api/day/:date/convert-xlsx?XTransformPort=3031` | Convert md → Excel (pakai parser Info Lengger) |

---

## Tutor: Connect Supabase

Supabase = database PostgreSQL + Storage (untuk file foto) + auto API. Free tier cukup untuk bot ini (500MB DB, 1GB Storage).

### Step 1 — Buat project

1. Buka https://supabase.com → sign up (pakai GitHub / email).
2. Klik **New Project** → isi:
   - **Name**: `lengger-ledger` (atau apa punun)
   - **Database Password**: simpan di password manager (jangan hilang).
   - **Region**: Southeast Asia (Singapore) — paling dekat ke Indonesia.
   - **Plan**: Free.
3. Tunggu ~2 menit sampai project siap.

### Step 2 — Run schema SQL

1. Di dashboard project, klik **SQL Editor** (sidebar kiri) → **New query**.
2. Buka file `supabase/schema.sql` dari repo ini → copy semua → paste di SQL Editor → **Run**.
   - Ini bikin tabel `master_lokasi` (6387 entri wilayah) untuk lookup kode desa/kec/kab.
3. Ulangi: **New query** → paste isi `supabase/seed-wilayah.sql` → **Run**.
   - Ini insert 6387 baris data wilayah (34 prov + 21 kota + 450 kec + 5882 desa).
4. Ulangi lagi: **New query** → paste isi `supabase/schema-bot-daily.sql` → **Run**.
   - Ini bikin tabel `bot_daily_raw` (tempat bot simpan raw md + meta) + trigger `updated_at`.

Cek: buka **Table Editor** → harus ada tabel `master_lokasi` (6387 rows) dan `bot_daily_raw` (0 rows).

### Step 3 — Bikin Storage bucket untuk foto

1. Klik **Storage** (sidebar) → **New bucket**.
2. Isi:
   - **Name**: `lengger-photos` (harus persis sama — hardcoded di `src/lib/supabase.ts`).
   - **Public**: No (default). Kalau Yes, foto bisa diakses publik tanpa auth key (untuk preview di web).
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`.
3. Klik **Create bucket**.

### Step 4 — Ambil API keys

1. Klik **Project Settings** (gear icon di sidebar kiri bawah) → **API**.
2. Copy 2 nilai:
   - **Project URL**: `https://xxxxx.supabase.co` (simpan sebagai `SUPABASE_URL`).
   - **service_role** secret (klik "Reveal" → copy): ini bypass RLS supaya bot bisa write. **JANGAN commit key ini ke git.** Simpan sebagai `SUPABASE_SERVICE_KEY`.
   - (Jangan pakai "anon public" key — itu read-only dengan RLS.)

### Step 5 — Set env vars

Edit `mini-services/lengger-bot/.env`:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJI...your-service-role-key...
```

Restart bot: `bun run dev`. Cek log — saat pipeline jalan, harus muncul:
```
[pipeline] Syncing to Supabase...
[supabase] ✓ Photo uploaded: 2026-09-22/2026-09-22.jpeg
[supabase] ✓ Record upserted: 2026-09-22
```

Cek di Supabase:
- **Table Editor** → `bot_daily_raw` → harus ada 1 row per tanggal.
- **Storage** → `lengger-photos` bucket → folder per tanggal dengan foto asli di dalamnya.

### Verifikasi Supabase terhubung

```bash
# Cek apakah bot detect Supabase config
curl -s "http://localhost:3031/?XTransformPort=3031" | python3 -m json.tool
# Harus ada: "service": "lengger-bot" (tidak ada error)

# Setelah trigger pipeline, cek table di Supabase Dashboard:
# Table Editor → bot_daily_raw → row untuk tanggal tsb.
```

### RLS (Row Level Security)

Tabel `bot_daily_raw` default **tidak ada RLS policy** (bisa di-write oleh siapa pun yang punya service key). Untuk produksi, tambah policy:

```sql
-- Hanya service_role (bot) yang bisa write; anon (web UI) hanya read
ALTER TABLE bot_daily_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read" ON bot_daily_raw
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role can write" ON bot_daily_raw
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

---

## Tutor: Connect Telegram

Telegram report = notifikasi singkat setiap hari: "hari ini 22 september ada 6 lokasi".

### Step 1 — Bikin bot via @BotFather

1. Buka Telegram, search **@BotFather**, klik **Start**.
2. Kirim `/newbot`.
3. BotFather minta **name** → isi: `Lengger Bot` (atau apa punun).
4. BotFather minta **username** → harus unik, akhiran "bot": `lengger_daily_bot`.
5. BotFather kasih **HTTP API token** (format: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`).
   - Simpan sebagai `TELEGRAM_BOT_TOKEN`.

### Step 2 — Ambil Chat ID Anda

1. Kirim pesan apa punun ke bot baru Anda (klik link dari BotFather, klik **Start**, ketik "hi").
2. Buka browser, visit:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Ganti `<TOKEN>` dengan token Anda.
3. Cari `"chat":{"id":XXXXXXX}` di JSON response — itu **Chat ID** Anda.
   - Untuk private chat, angkanya positif (mis. `123456789`).
   - Untuk group, angkanya negatif (mis. `-100123456789`).
4. Simpan sebagai `TELEGRAM_CHAT_ID`.

### Step 3 — Test kirim pesan

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=Test dari Lengger Bot" | python3 -m json.tool
```

Kalau `"ok":true` → bot bisa kirim pesan ke Anda. Kalau error `"chat not found"` → Anda belum kirim pesan ke bot (Step 1 belum dilakukan).

### Step 4 — Set env vars + restart

Edit `mini-services/lengger-bot/.env`:

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=123456789
```

Restart bot: `bun run dev`.

### Verifikasi Telegram terhubung

Trigger pipeline manual:
```bash
curl -X POST "http://localhost:81/api/run/2026-09-22?url=https://www.tiktok.com/@wonosobonyawijiingseni/photo/7688234635414752530?XTransformPort=3031"
```

Cek log:
```
[telegram] hari ini 22 september ada 6 lokasi | (sumber: TikTok @wonosobonyawijiingseni)
```

Cek Telegram Anda — harus ada pesan dari bot:
> hari ini 22 september ada 6 lokasi
> (sumber: TikTok @wonosobonyawijiingseni)

Kalau tidak muncul, cek log untuk error Telegram API (biasanya: token salah, chat ID salah, atau belum start chat dengan bot).

---

## Cron harian 15:00 WIB

Bot cek setiap 60 detik. Kalau WIB time = 15:00 dan folder hari ini belum ada:
1. Cari post TikTok di akun `@wonosobonyawijiingseni` dengan title "Info Lengger <Hari>, <DD> <Bulan> <YYYY>".
2. Download foto asli (1740×2176 JPEG).
3. VLM OCR (z-ai-web-dev-sdk, prompt strict — tulis apa adanya).
4. LLM typo fix (z-ai-web-dev-sdk, non-fatal).
5. Strip empty field lines (Sinden/Lengger/Rombongan/Jam kosong → hapus barisnya).
6. Save `YYYY-MM-DD-raw.md` + foto + `meta.json`.
7. Kirim Telegram report.
8. Sync ke Supabase (kalau configured).

Catch-up: kalau bot restart setelah 15:00 WIB dan hari ini belum diproses, pipeline langsung jalan saat startup.

---

## Production deployment

Bot ini tinggal di Mini PC / VPS (bukan sandbox). Yang perlu di-install:

```bash
git clone https://github.com/kaladete-arsip/Parse-INFO-LENGGER.git
cd Parse-INFO-LENGGER/mini-services/lengger-bot
cp .env.example .env  # isi semua (Telegram + Supabase)
bun install
bun run dev            # atau pakai pm2/systemd untuk auto-restart
```

Kalau deploy di luar HK (server Indonesia/Singapore/US), TikTok langsung bisa diakses — ganti `tikwm.com` proxy dengan fetch langsung ke `tiktok.com` (og:image ada di static HTML, full-res, no login needed). Edit `src/lib/tiktok-source.ts` fungsi `fetchPost()`.

---

## File structure

```
mini-services/lengger-bot/
├── src/
│   ├── index.ts              # HTTP server (port 3031) + cron scheduler
│   ├── gen-flyers.ts         # (deleted — no more fake flyers)
│   ├── ocr-real-photo.ts     # One-off: OCR real photo + save to storage
│   ├── test-7-days.ts        # Test: download + OCR 7 TikTok URLs
│   └── lib/
│       ├── storage.ts        # Local file storage (photos + raw.md + meta.json)
│       ├── tiktok-source.ts  # Download real TikTok photos via tikwm.com
│       ├── vlm.ts            # VLM OCR (z-ai-web-dev-sdk createVision, strict prompt)
│       ├── llm.ts            # LLM typo fix (z-ai-web-dev-sdk, non-fatal)
│       ├── telegram.ts       # Telegram report (real if env set, mock if not)
│       ├── supabase.ts       # Supabase Storage + DB sync (optional)
│       ├── pipeline.ts       # Orchestrator: download → OCR → fix → save → sync
│       └── cron.ts            # Daily 15:00 WIB scheduler + catch-up on restart
├── storage/                  # YYYY-MM-DD folders with real photos + raw.md + meta.json
├── .env.example              # Template for env vars
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

| Masalah | Penyebab | Solusi |
|---|---|---|
| `tikwm.com error: Url parsing is failed` | URL bukan TikTok photo post | Pastikan URL format: `https://www.tiktok.com/@<user>/photo/<id>` |
| `No images in post` | Post itu video, bukan photo post | Cek URL — harus `/photo/<id>`, bukan `/video/<id>` |
| `Telegram 401 Unauthorized` | Token salah / bot dihapus | Bikin bot baru via @BotFather |
| `Telegram 400 chat not found` | Chat ID salah / belum start chat | Kirim pesan ke bot dulu, baru ambil chat ID |
| `Supabase photo upload failed: 401` | Key salah (pakai anon, bukan service_role) | Pakai "service_role" secret, bukan "anon public" |
| `Supabase record upsert failed: 42P01` | Tabel `bot_daily_raw` belum dibuat | Run `schema-bot-daily.sql` di SQL Editor |
| VLM halu / nama salah | (Tidak terjadi — prompt strict) | Kalau terjadi, report + kasih contoh → update prompt di `vlm.ts` |
| `Sinden: ` kosong di output | (Fixed — sekarang dihapus otomatis) | Liat `stripEmptyFieldLines()` di `pipeline.ts` |
