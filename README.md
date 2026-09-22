# Lengger Ledger Converter

Konversi **Info Lengger** (caption IG/FB budaya Lengger Wonosobo) → **Excel** + **clean.md**.
Align dengan skema **OBH** (Observatorium Budaya Hidup) — https://jayasanganusantara.or.id/observatorium

---

## Status

### ✅ Done (live di GitHub Pages)

| Fitur | File |
|-------|------|
| Web UI 3 tab (RAW / Foto OCR / Excel) | `src/app/page.tsx` |
| Parser 29 kolom (sesuai skema OBH) | `src/lib/budaya/md-parser.ts` + `template.ts` |
| FB scraping → MD (Source URL → POST URL) | `src/lib/budaya/fb-to-md.ts` |
| CSV scraping → MD | `src/lib/budaya/csv-to-md.ts` |
| Excel reader (round-trip: .xlsx → RowData) | `src/lib/budaya/xlsx-parser.ts` |
| Clean MD (YAML + body + ringkasan) | `src/lib/budaya/clean-md-generator.ts` |
| Weekly Excel ZIP (1 file per ISO week) | `src/lib/budaya/weekly-xlsx-generator.ts` |
| OCR browser-side (Tesseract.js) | `src/lib/budaya/ocr.ts` |
| Master wilayah (5882 desa, 385 kecamatan) | `src/lib/data/wilayah/` |
| Prov: parsing (Kalimantan, dll) | `md-parser.ts` |
| Date gap filling + sort | `md-parser.ts` |

### ⚠ Code ready, belum deploy

| Fitur | Yang kurang |
|-------|-------------|
| Bot Telegram (Cloudflare Worker) | Cloudflare account + API keys |
| LLM typo fix (GLM-4.7-flash) | Deploy worker |
| VLM OCR (Gemini 3 Flash) | Deploy worker |
| GitHub Actions CI/CD | PAT dengan `workflow` scope |

### 📋 Plan

| Fitur | Timeline |
|-------|----------|
| DB (Supabase/PostgreSQL + pgvector) | Kalau data sudah 1 tahun |
| Master individu | Setelah Excel rapi |
| Master rombongan | Setelah Excel rapi |
| IG auto-scrape (cron 15:00 WIB) | v1.2 |
| Static site (clean.md → web pages) | Fase berikutnya |

---

## Workflow

```
Tab 1: RAW              Tab 2: Foto OCR         Tab 3: Excel
  Upload .md/.csv         Upload foto             Upload .xlsx (edited)
  ↓                       ↓                       ↓
  Parser 29 kolom         Tesseract.js            ExcelJS reader
  ↓                       ↓                       ↓
  Preview                 Text → edit             Preview (data lengkap)
  ↓                       ↓                       ↓
  Download:               Download:               Download:
  • .xlsx (29 kolom)      • .md (OCR result)      • clean.md ZIP (per-day)
  • Weekly .xlsx ZIP      • "Pakai sebagai input" • .xlsx (re-export)
  • raw-clean.md
  • clean.md ZIP
```

### Round-trip:
1. Tab RAW → upload scraping → "Weekly .xlsx ZIP" → 1 file per minggu
2. User edit tiap minggu (isi peristiwa dari flyer)
3. Tab Excel → upload edited .xlsx → "clean.md ZIP" (data lengkap)

### DB roadmap (nanti):
1. User push Excel → DB (status=draft)
2. User acc di DB UI → status=confirmed
3. DB = master (lokasi, individu, rombongan, peristiwa)

---

## Excel 29 Kolom

```
Event:        Tanggal | TanggalSelesai | Jam | peristiwa | Kategori | aktivitas_budaya | Gagrak
Partisipasi:  nama_rombongan | Peran_Rombongan | nama_individu | peran_individu
Lokasi:       Lokasi | dusun | desa | kode_desa | kecamatan | kode_kecamatan | kabupaten | kode_kabupaten | provinsi
Provenance:   sumber | bukti | tipe_sumber | tanggal_capture | tingkat_verifikasi | status_consent
Quality:      kelengkapan | catatan_gap | catatan
```

Auto-fill: tipe_sumber=fieldnote, kode wilayah dari master, kelengkapan=partial/lengkap.
Data tidak lengkap tidak ditolak — ditandai kelengkapan + catatan_gap.

---

## Master Wilayah

| Level | Coverage |
|-------|----------|
| Kabupaten | 21 (all Jateng) |
| Kecamatan | 385 (20 kabupaten sekitar) |
| Desa | 5882 (Wonosobo + 20 kabupaten sekitar) |
| Dusun | 0 (tidak ada kode Kemendagri resmi) |

Lookup: exact match by name → fill kode + canonical name + catatan_gap if not found.
Data di luar master (Kalimantan, Jakarta, dll) tetap masuk — kode=null + catatan_gap.

---

## Clean MD Format

YAML frontmatter (align skema OBH) + body (peristiwa, aktivitas, lokasi, rombongan, individu) + ringkasan data-driven.

---

## Quick Start

```bash
git clone https://github.com/kaladete-arsip/Parse-INFO-LENGGER.git
cd Parse-INFO-LENGGER
npm install
npm run dev
```

Live: https://kaladete-arsip.github.io/Parse-INFO-LENGGER/

## Deploy

- **Web UI**: GitHub Pages (gh-pages branch, static export)
- **Bot**: `cd worker && npm install && npx wrangler deploy` (lihat `worker/README.md`)

## Stack

Next.js 16 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · ExcelJS · Tesseract.js · JSZip · Cloudflare Workers (bot, ready) · GitHub Pages

## License

CC BY 4.0 — Sumber: INFO LENGGER Nyawiji Ing Seni · Dataset: Yayasan Jaya Sanga Nusantara
