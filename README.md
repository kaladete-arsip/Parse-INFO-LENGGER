# Lengger Ledger Converter

Konversi file `Info Lengger` (MD / CSV / FB scraping) menjadi Excel `.xlsx` sesuai template **2026-06-19_2026-06-20.xlsx** (20 kolom). Local-only, tanpa login, tanpa DB online.

---

## Daftar Isi

1. [Stack](#stack)
2. [Fitur](#fitur)
3. [Quick Start](#quick-start)
4. [Deploy ke GitHub Pages (gratis, no server)](#deploy-ke-github-pages-gratis-no-server)
5. [Format Input yang Didukung](#format-input-yang-didukung)
6. [Aturan Parsing](#aturan-parsing)
7. [Kolom Output (20 kolom)](#kolom-output-20-kolom)
8. [Cara Pakai Harian](#cara-pakai-harian)
9. [Arsitektur Client-Side](#arsitektur-client-side)
10. [Struktur Project](#struktur-project)
11. [Troubleshooting](#troubleshooting)
12. [Limitations](#limitations)
13. [Lisensi](#lisensi)

---

## Stack

| Komponen | Teknologi |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Bahasa | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Excel generator | ExcelJS |
| CSV parser | csv-parse |
| Source zip | static `public/source.zip` (regenerated via `bun run build:source`) |

**Tanpa auth, tanpa DB, tanpa server.** App berjalan 100% in-browser untuk konversi. Siap deploy ke GitHub Pages.

---

## Fitur

### Input auto-detect 3 format

1. **Plain MD** — file `.md` dengan format "Info Lengger" (single-day atau multi-day)
2. **CSV scraping** — file `.csv` RAW Instagram, tiap row = 1 post (boleh multi-line, di-quote)
3. **FB scraping** — file `.md` dengan marker `POST #N` + `--- RAW POST ---`, hasil scrape Facebook

Deteksi otomatis dari konten file. Post FB tanpa header `Info Lengger` di-skip otomatis.

### Parsing rules

- **Multi-day source**: multiple `Info Lengger <Day>, DD Month YYYY` headers sepanjang file. Tiap entri pakai tanggal dari header terdekat di atasnya.
- **MBENGI TOK / MBENGI THOK**: kalau ada marker ini di entry, `Jam` = `19:30` (sesi malam saja). Default = `15:30` (pasca Asar).
- **Rombongan normalization**: `X & Y` → `X; Y` (multiple groups separator). Rombongan dengan comma (info homebase) tetap utuh.
- **Individu filter**: placeholder `...?`, `Bu ...?`, `...`, `?` di-drop (kosong). Token tanpa huruf juga di-drop.
- **Gagrak rules**: Pentas Lengger + Sinden → `Sindenan`. Pentas Lengger tanpa Sinden → `Bedhenan`. Non-Lengger (Tayub/Warok/Jaranan/Topeng Ireng) → kosong.
- **Sumber**: baris `Sumber : ...` di mana saja di MD → mengisi kolom `sumber` untuk semua baris.
- **Aktivitas khusus**: `"TAYUB"`, `"WAROK"`, `"JARANAN & WAROK"`, `"TOPENG IRENG & WAROK"`, `"LENGGERAN, JARANAN & WAROK"` → otomatis set `aktivitas_budaya` + `Peran_Rombongan`.
- **Misspelling handler**: `Sinde:` (tanpa N) juga dikenali sebagai `Sinden:`.
- **Sort by date**: output otomatis urut by `Tanggal` ascending. Entries dengan tanggal sama tetap urut sesuai source (stable sort).

### Output

- **20 kolom** sesuai template `2026-06-19_2026-06-20.xlsx`
- Styling konsisten: font Helvetica Neue 10pt, header bold + yellow-orange fill, thin borders, row height 20.25
- File `.xlsx` digenerate on-demand (tidak disimpan di server)
- Output filename = input filename dengan ekstensi `.xlsx` (mis. `fb_2026-06-22.md` → `fb_2026-06-22.xlsx`)

### UI

- Drag & drop upload
- Live preview tabel 20 kolom sebelum export
- Warnings alert (mis. "baris X tidak punya rombongan") dengan scroll
- Tombol **Source** di header → download zip source code terbaru on-demand dari `/api/source`

---

## Quick Start

Butuh **Node.js 18.18+** atau **Bun 1.1+** (Bun direkomendasikan).

```bash
# 1. Extract zip
unzip lengger-ledger-converter.zip
cd lengger-ledger-converter

# 2. Copy env (SQLite path, opsional)
cp .env.example .env

# 3. Install dependencies
bun install
# atau: npm install && rm bun.lock

# 4. Jalankan dev server
bun run dev
# atau: npm run dev

# 5. Buka http://localhost:3000
```

Tidak ada login. Langsung ke halaman converter.

---

## Deploy ke GitHub Pages (gratis, no server)

App ini **client-side only** — semua konversi (parse + generate xlsx) jalan di browser. Tidak butuh server, DB, atau API. Cocok untuk GitHub Pages.

### Cara deploy

1. **Push ke GitHub** — buat repo public, push semua file:
   ```bash
   git init
   git add .
   git commit -m "init: lengger ledger converter"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPO-NAME.git
   git push -u origin main
   ```

2. **Enable GitHub Pages** di repo Settings:
   - Settings → Pages → Source: **GitHub Actions**
   - Workflow `.github/workflows/deploy.yml` akan auto-build & deploy on push

3. **Tunggu ~2 menit** — GitHub Actions akan build static site dan deploy ke:
   ```
   https://USERNAME.github.io/REPO-NAME/
   ```

4. **Selesai**. URL di atas adalah app Anda — siapa pun bisa akses, upload .md, download .xlsx. Tidak ada server, tidak ada biaya.

### Cara kerja GitHub Actions

File `.github/workflows/deploy.yml` otomatis:
- Setup Bun
- Install dependencies
- Set `NEXT_PUBLIC_BASE_PATH=/{repo-name}` (basePath untuk project Pages)
- Set `NEXT_PUBLIC_GITHUB_REPO={owner}/{repo}` (untuk tombol Source → link ke GitHub)
- Run `bun run build` (Next.js static export → `out/` directory)
- Add `.nojekyll` (bypass Jekyll processing)
- Upload `out/` sebagai GitHub Pages artifact
- Deploy artifact ke GitHub Pages

### Custom domain (opsional)

Kalau mau pakai domain sendiri (mis. `lengger.yourdomain.com`):
1. Settings → Pages → Custom domain → isi domain
2. Buat CNAME record di DNS Anda: `lengger.yourdomain.com → USERNAME.github.io`
3. Set `NEXT_PUBLIC_BASE_PATH=""` (kosong) di GitHub Actions env atau repo Settings → Secrets

### Alternatif: Vercel / Netlify

Kalau tidak mau pakai GitHub Pages, app ini juga bisa deploy ke Vercel/Netlify:
- Vercel: import repo dari dashboard, auto-detect Next.js, deploy
- Netlify: build command `bun run build`, publish directory `out`

Tapi untuk kasus ini GitHub Pages cukup — semua logika client-side, tidak perlu server.

---

## Format Input yang Didukung

### 1. Plain MD (Info Lengger)

File `.md` dengan format standar. Bisa single-day atau multi-day.

**Single-day:**
```md
Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della
2_Siyono, Bojasari Kec: Kertek Kab: Wonosobo
(Romb Rukun Santoso)
Lengger: Mbak Erni, Miah & Amandha Pasya
Sinden: Mak Dini
```

**Multi-day** (multiple `Info Lengger` headers):
```md
Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della

Info Lengger Minggu, 21 Juni 2026
1_Kasemen, Tlogomulyo Kec: Kertek Kab: Wonosobo
(Romb Agung Budoyo)
Lengger: Bu Dian, Gisha, Sani & Ayuk (Temanggung)

Info Lengger Senin, 22 Juni 2026
1_Pagerotan, Pagerejo Kec: Kertek Kab: Wonosobo
(Romb Sri Muda Rahayu & Wahyu Margi Utomo)
"JARANAN & WAROK"

-----

Sumber : Instagram INFO LENGGER (Nyawiji Ing Seni) https://...
```

### 2. CSV scraping (RAW Instagram)

File `.csv` dengan 1 kolom (atau kolom pertama berisi post). Tiap row = 1 post lengkap (boleh multi-line, di-quote sesuai aturan CSV).

```csv
post
"Info Lengger Sabtu, 20 Juni 2026
1_Trenggiling, Sariyoso Kec/Kab: Wonosobo
(Romb Trenggono Sari Budoyo)
Lengger: Bu Ezti, Fathma & Mayssi Della"
"Info Lengger Minggu, 21 Juni 2026
1_Kasemen, Tlogomulyo Kec: Kertek Kab: Wonosobo
(Romb Agung Budoyo)
Lengger: Bu Dian, Gisha, Sani & Ayuk (Temanggung)"
```

Header row dengan keyword `post`, `caption`, `text`, `content`, `raw`, `body`, `message` di-skip otomatis.

### 3. FB scraping (Facebook)

File `.md` hasil scrape Facebook dengan struktur:
```
============================================================
POST #N
Author: ...
Post Date: YYYY-MM-DD
Captured: YYYY-MM-DD
Source: https://...
============================================================
--- RAW POST ---
<actual post content — may or may not be Info Lengger>
============================================================
POST #N+1
...
```

Deteksi otomatis dari konten (tidak peduli extension). Yang dilakukan:
- Extract content antara `--- RAW POST ---` dan `=====` berikutnya
- Filter hanya post yang ada header `Info Lengger` (case-insensitive)
- Strip FB UI noise yang ikut ter-scrape:
  - `Kontributor all-star`, `Kontributor populer`
  - `MATUR NUWUN Tampilkan lebih sedikit`
  - `Suka Balas`, `Balas`, `Suwun wa`
  - `Facebook` berulang
  - Single letters (`n`, `o`, `p`, `s`, `e`, `t`, `r`, `d`, `S`, `f`, `8`, `a`, `u`, `2`, `.`, dll.) — anti-scraping FB
  - Leading author name (sebelum `Info Lengger`)
- Post tanpa `Info Lengger` header di-skip

---

## Aturan Parsing

### Tanggal

- Tiap `Info Lengger <Day>, DD Month YYYY` men-set tanggal untuk entri di bawahnya sampai header berikutnya
- Format tanggal Indonesia: `Januari` s/d `Desember` (case-insensitive)
- Fallback: nama file `YYYY-MM-DD.md` (kalau tidak ada header `Info Lengger`)
- Output: ISO format `YYYY-MM-DD`

### Jam

| Kondisi | Jam |
|---------|-----|
| Ada `MBENGI TOK` / `MBENGI THOK` / `MBENI TOK` di entry | `19:30` (sesi malam saja) |
| Tidak ada marker | `15:30` (default, pasca Asar) |

Marker bisa muncul sebagai baris sendiri atau embedded (mis. di dalam quote `"MBENGI THOK"`).

### Rombongan

- Ekstrak dari baris `(Romb ...)`
- Normalisasi: `X & Y` → `X; Y` (multiple groups)
- Rombongan dengan comma (info homebase) tetap utuh, mis. `Wargo Ngudi Budoyo, Salaman, Lengkong Kec: Garung Kab: Wonosobo` — tidak diubah karena comma di situ menandakan info homebase, bukan pemisah rombongan ganda

Contoh:
| Input | Output |
|-------|--------|
| `Sri Muda Rahayu & Wahyu Margi Utomo` | `Sri Muda Rahayu; Wahyu Margi Utomo` |
| `Rimba Muda & Satrio Mudo` | `Rimba Muda; Satrio Mudo` |
| `Wargo Ngudi Budoyo, Salaman, Lengkong Kec: Garung Kab: Wonosobo` | (tidak berubah) |

### Individu & Peran

- Ekstrak dari baris `Lengger:`, `Sinden:`, `Sinde:` (misspelling), `Artise:` / `Artis:`
- Split separator: `,` dan `&`
- Filter:
  - Token mengandung `...` (placeholder) → drop. Mis. `...?`, `Bu ...?`, `Mas ...?`
  - Token tanpa huruf → drop. Mis. `?`, `-`, `...`
- Peran mapping:
  - `Lengger:` → `Penari`
  - `Artise:` / `Artis:` → `Penari`
  - `Sinden:` / `Sinde:` → `Sinden`

Urutan di output: Lengger dulu, lalu Artis, lalu Sinden.

Contoh:
| Input | Output nama_individu | Output peran_individu |
|-------|---------------------|----------------------|
| `Lengger: Bu Dian, Gisha, Sani & Ayuk (Temanggung)` | `Bu Dian; Gisha; Sani; Ayuk (Temanggung)` | `Penari; Penari; Penari; Penari` |
| `Lengger: Nina & ...?` | `Nina` | `Penari` |
| `Lengger: Aisah & ...?` `Sinden: Bu Pur` | `Aisah; Bu Pur` | `Penari; Sinden` |

### Gagrak

| Aktivitas | Sinden? | Gagrak |
|-----------|---------|--------|
| Pentas Lengger | Ya | `Sindenan` |
| Pentas Lengger | Tidak | `Bedhenan` |
| Pentas Tayub | — | (kosong) |
| Pentas Warok | — | (kosong) |
| Pentas Jaranan & Warok | — | (kosong) |
| Pentas Topeng Ireng & Warok | — | (kosong) |
| Pentas Lenggeran, Jaranan & Warok | — | (kosong) |

Gagrak **hanya berlaku untuk Pentas Lengger**.

### Aktivitas Budaya

Deteksi dari baris di-quote (`"..."`):

| Marker | aktivitas_budaya | Peran_Rombongan |
|--------|-----------------|-----------------|
| `"TAYUB"` | `Pentas Tayub` | `Performer Rombongan Tayub` |
| `"WAROK"` | `Pentas Warok` | `Performer Rombongan Warok` |
| `"JARANAN & WAROK"` | `Pentas Jaranan & Warok` | `Performer Rombongan Jaranan & Warok` |
| `"TOPENG IRENG & WAROK"` | `Pentas Topeng Ireng & Warok` | `Performer Rombongan Topeng Ireng & Warok` |
| `"LENGGERAN, JARANAN & WAROK"` | `Pentas Lenggeran, Jaranan & Warok` | `Performer Rombongan Lenggeran, Jaranan & Warok` |
| `"JARANAN"` (tanpa WAROK) | `Pentas Jaranan` | `Performer Rombongan Jaranan` |
| (tidak ada quote) | `Pentas Lengger` | `Performer Rombongan Lengger` |

### Sumber

Baris `Sumber : ...` di mana saja di file → mengisi kolom `sumber` untuk **semua** baris.

### Separator `-----`

Baris `-----` (3+ dashes) di-skip, tidak diproses sebagai entry.

### Lokasi parsing

Format header entry: `<n>_<location info> Kec: X Kab: Y`

| Format input | Hasil parsing |
|--------------|---------------|
| `1_Trenggiling, Sariyoso Kec/Kab: Wonosobo` | dusun=Trenggiling, desa=Sariyoso, kec=Wonosobo, kab=Wonosobo |
| `2_Siyono, Bojasari Kec: Kertek Kab: Wonosobo` | dusun=Siyono, desa=Bojasari, kec=Kertek, kab=Wonosobo |
| `8_Mungkung Kec: Kalikajar Kab: Wonosobo` | dusun=Mungkung, desa=(kosong), kec=Kalikajar, kab=Wonosobo |
| `19_Halaman Terminal Kalibeber Kec: Mojotengah Kab: Wonosobo` | lokasi=Halaman Terminal Kalibeber, kec=Mojotengah, kab=Wonosobo |
| `16_Dk. Karangsambung, Ds. Jebengan, Trimulyo Kec: Wadaslintang Kab: Wonosobo` | dusun=Karangsambung, desa=Jebengan, lokasi=Trimulyo, kec=Wadaslintang, kab=Wonosobo |

Prefix `Dk.`, `Ds.`, `Dukuh`, `Desa` di-strip otomatis.

### Provinsi

Default `Jawa Tengah` kalau `nama_kabupaten` terisi. Kosong kalau tidak ada kabupaten.

### Sort

Output otomatis urut by `Tanggal` ascending. Entries dengan tanggal sama tetap urut sesuai source (stable sort). Entries tanpa tanggal ditaruh paling akhir.

---

## Kolom Output (20 kolom)

Sesuai template `2026-06-19_2026-06-20.xlsx`:

| # | Kolom | Auto-fill? | Catatan |
|---|-------|-----------|---------|
| A | `Tanggal` | ✅ | Dari header `Info Lengger` atau nama file |
| B | `TanggalSelesai` | ❌ | Kosong, isi manual |
| C | `Jam` | ✅ | `15:30` default, `19:30` jika `MBENGI TOK` |
| D | `peristiwa` | ❌ | Kosong, isi manual |
| E | `Kategori` | ❌ | Kosong, isi manual |
| F | `aktivitas_budaya` | ✅ | Mis. `Pentas Lengger`, `Pentas Tayub` |
| G | `Gagrak` | ✅ | `Sindenan` / `Bedhenan` / kosong |
| H | `nama_rombongan` | ✅ | Dari `(Romb ...)`, `&` → `;` |
| I | `Peran_Rombongan` | ✅ | Mis. `Performer Rombongan Lengger` |
| J | `nama_individu` | ✅ | Dari `Lengger:` / `Sinden:` / `Artise:` |
| K | `peran_individu` | ✅ | `Penari` / `Sinden` |
| L | `sumber` | ✅ | Dari baris `Sumber :` |
| M | `bukti` | ❌ | Kosong, isi manual |
| N | `Lokasi` | ✅ | Mis. `Halaman Terminal Kalibeber` |
| O | `nama_dusun/kampung` | ✅ | Dari header entry |
| P | `nama_desa/Kelurahan` | ✅ | Dari header entry |
| Q | `Nama_Kecamatan` | ✅ | Dari `Kec:` atau `Kec/Kab:` |
| R | `nama_kabupaten` | ✅ | Dari `Kab:` atau `Kec/Kab:` |
| S | `nama_provinsi` | ✅ | `Jawa Tengah` (default) |
| T | `catatan` | ❌ | Kosong, isi manual |

Kolom yang dikosongkan (B, D, E, M, T) harus diisi manual di Excel sesuai konteks peristiwa.

---

## Cara Pakai Harian

1. Buka http://localhost:3000
2. Drag & drop file `.md` atau `.csv` ke kotak upload
   - Atau klik kotak upload untuk pilih file via file picker
3. **Preview tabel muncul** — semua 20 kolom ditampilkan, scroll horizontal & vertical
4. Periksa warnings (kalau ada) di alert kuning di atas tabel
5. Klik **"Convert & download .xlsx"**
6. File `.xlsx` terunduh (nama file = input filename dengan `.xlsx`)
7. Buka di Excel, isi manual kolom yang masih kosong:
   - `TanggalSelesai` — kalau acara multi-day
   - `peristiwa` — nama acara (mis. "Sunatan Budi", "Merti Dusun")
   - `Kategori` — kategori acara (mis. "Sunatan", "Merti Dusun", "Festival")
   - `bukti` — link foto/video bukti
   - `catatan` — catatan tambahan
8. Klik **Reset** untuk upload file lain, atau **Keluar** (kalau ada auth)

### Tombol Source (header kanan)

Klik tombol **Source** di header untuk download source code terbaru.

- **Di GitHub Pages deploy**: GitHub Actions otomatis set `NEXT_PUBLIC_GITHUB_REPO={owner}/{repo}` saat build, jadi tombol Source redirect ke `https://github.com/{repo}/archive/refs/heads/main.zip` — download langsung dari GitHub repo.
- **Di local dev (`next dev`)**: tombol ini download `public/source.zip` (static file). Jalankan `bun run build:source` untuk regenerate snapshot zip ini setelah mengubah kode.

---

## Arsitektur Client-Side

**Tidak ada API endpoints** — semua konversi jalan di browser. App ini adalah static site (HTML/JS/CSS), bisa di-hosting di GitHub Pages tanpa server.

### Alur konversi (semua di browser)

```
User upload .md/.csv
  ↓
normalizeInput()        # auto-detect format (MD / CSV / FB)
  ↓
parseMd()               # multi-day parser + semua aturan
  ↓
generateXlsx()          # ExcelJS di browser → ArrayBuffer
  ↓
new Blob() + <a download>   # trigger download di browser
```

File tidak pernah dikirim ke server. Privacy-friendly — semua prosesing lokal di browser user.

### Tombol Source

- Kalau `NEXT_PUBLIC_GITHUB_REPO` diset (mis. `username/repo`): tombol Source → link langsung ke `https://github.com/{repo}/archive/refs/heads/main.zip`
- Kalau tidak diset (dev mode dengan `next dev`): tombol Source → call `/api/source` (perlu API route yang dihapus di mode static export)
- GitHub Actions workflow otomatis set `NEXT_PUBLIC_GITHUB_REPO` saat deploy

---

## Struktur Project

```
lengger-ledger-converter/
├── .github/
│   └── workflows/
│       └── deploy.yml                        # GitHub Actions auto-deploy
├── src/
│   ├── app/
│   │   ├── layout.tsx                         # Root layout
│   │   ├── page.tsx                           # UI: upload, preview, convert, download (client-side)
│   │   └── globals.css
│   ├── lib/
│   │   └── budaya/
│   │       ├── template.ts                   # Definisi 20 kolom & styling
│   │       ├── md-parser.ts                  # Parser multi-day .md → RowData[]
│   │       ├── csv-to-md.ts                  # Konverter CSV → MD-equivalent
│   │       ├── fb-to-md.ts                   # Konverter FB scraping → MD-equivalent
│   │       ├── normalize-input.ts            # Auto-detect format & dispatch
│   │       └── xlsx-generator.ts             # RowData[] → ArrayBuffer (browser-compatible)
│   └── components/ui/                        # shadcn/ui components
├── prisma/
│   └── schema.prisma                          # SQLite schema (opsional, tidak terpakai default)
├── public/                                    # Static assets
├── samples/                                   # Contoh file .md untuk testing
├── package.json
├── bun.lock
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json
├── next.config.ts                             # output: "export" untuk static build
├── eslint.config.mjs
├── .env.example
├── .gitignore
└── README.md
```

### File inti (logika konversi)

Semua logika konversi ada di `src/lib/budaya/`:

| File | Tanggung jawab |
|------|----------------|
| `template.ts` | Definisi 20 kolom (key, header, width) + tipe `RowData` |
| `md-parser.ts` | Parser utama: MD-equivalent → `RowData[]`. Semua aturan parsing di sini. |
| `csv-to-md.ts` | Konverter CSV scraping → MD-equivalent |
| `fb-to-md.ts` | Konverter FB scraping → MD-equivalent (extract post, strip noise) |
| `normalize-input.ts` | Auto-detect format & dispatch ke converter yang sesuai |
| `xlsx-generator.ts` | Generate `.xlsx` dari `RowData[]` pakai ExcelJS |

---

## Troubleshooting

### "Tidak ada entri terdeteksi"

**Penyebab umum**:
- File tidak punya baris `<n>_<location>` (mis. `1_Trenggiling, Sariyoso Kec: ...`)
- File CSV tapi kolom pertama kosong
- File FB scraping tapi tidak ada post dengan header `Info Lengger`

**Solusi**:
- Untuk MD: pastikan tiap entry dimulai dengan `<nomor>_<lokasi>`
- Untuk CSV: pastikan kolom pertama tiap row berisi 1 post lengkap
- Untuk FB: paste salah satu post ke file terpisah untuk verifikasi format

### "Format tidak didukung"

File harus berekstensi `.md` atau `.csv`. FB scraping tetap pakai ekstensi `.md`.

### Individu kosong padahal ada di source

Cek apakah nama mengandung `...` (placeholder). Parser otomatis drop token dengan `...`. Mis. `Bu ...?` → di-drop.

### Rombongan tidak terdeteksi

Pastikan rombongan ditulis dalam tanda kurung dengan prefix `Romb `: `(Romb Nama Rombongan)`. Tanpa `Romb ` prefix, baris tidak dikenali sebagai rombongan.

### Tanggal salah

- Pastikan header `Info Lengger <Day>, DD Month YYYY` ada (mis. `Info Lengger Sabtu, 20 Juni 2026`)
- Nama bulan harus Indonesia: `Januari`, `Februari`, ..., `Desember` (case-insensitive)
- Kalau tidak ada header, parser fallback ke nama file `YYYY-MM-DD.md`

### Jam salah (seharusnya 19:30 tapi 15:30)

Pastikan marker `MBENGI TOK` atau `MBENGI THOK` ada di entry tersebut. Parser deteksi marker sebagai baris sendiri atau embedded di baris lain.

### Output tidak urut by tanggal

Parser otomatis sort by tanggal ascending sejak versi terbaru. Kalau masih tidak urut, pastikan Anda pakai code terbaru (download ulang dari tombol Source).

### Convert API return 500

Cek `/home/z/my-project/dev.log` (atau terminal tempat `bun run dev` jalan) untuk error stack. Umumnya karena:
- File terlalu besar (>10MB) — pecah jadi beberapa file
- Format tidak dikenali — kirim file contoh ke developer

### Source zip gagal download

Endpoint `/api/source` butuh system `zip` terinstall. Cek dengan:
```bash
which zip
```
Kalau tidak ada, install: `apt install zip` (Linux) atau `brew install zip` (macOS).

---

## Limitations

- **Tidak ada auth**: siapa saja yang bisa akses `http://localhost:3000` bisa pakai. Cocok untuk lokal, **jangan deploy ke public** tanpa tambahan auth.
- **Tidak ada persistensi**: file `.md` dan `.xlsx` tidak disimpan di server. Hanya diproses in-memory saat convert. Kalau butuh history, isi manual ke Excel tracking.
- **DB SQLite opsional**: schema Prisma disiapkan (`ConversionLog` model) tapi tidak terpakai default. Jalankan `bun run db:push` untuk create schema kalau mau pakai.
- **Format FB scraping bisa berubah**: scraper FB rawan breaking kalau Facebook ubah UI. Kalau format berubah, update `src/lib/budaya/fb-to-md.ts`.
- **Tidak multi-user**: tidak ada konsep user, semua request diproses sama. Cocok untuk 1 orang pakai harian.
- **Max file size**: tidak ada limit eksplisit, tapi Next.js default body parser limit ~4MB. Untuk file besar, pecah jadi beberapa file.

---

## Lisensi

Bebas dipakai.
