# Lengger Ledger Converter

Konversi **Info Lengger** (caption IG/FB budaya Lengger Wonosobo) → **Excel** + **clean.md**.
Align dengan skema **OBH** (Observatorium Budaya Hidup) — https://jayasanganusantara.or.id/observatorium

---

## Status

### ✅ Done

| Fitur | File |
|-------|------|
| Web UI 3 tab (RAW / Foto OCR / Excel) | `src/app/page.tsx` |
| Parser 29 kolom (sesuai skema OBH) | `src/lib/budaya/md-parser.ts` |
| FB scraping → MD (Source: POST URL) | `src/lib/budaya/fb-to-md.ts` |
| CSV scraping → MD | `src/lib/budaya/csv-to-md.ts` |
| Excel round-trip (.xlsx → RowData) | `src/lib/budaya/xlsx-parser.ts` |
| Clean MD (YAML + body + ringkasan) | `src/lib/budaya/clean-md-generator.ts` |
| Weekly Excel ZIP (per ISO week) | `src/lib/budaya/weekly-xlsx-generator.ts` |
| OCR browser-side (Tesseract.js) | `src/lib/budaya/ocr.ts` |
| Master wilayah (5882 desa, 385 kec) | `src/lib/data/wilayah/` |
| Supabase schema + seed SQL (6387 entries) | `supabase/` |
| GitHub Pages live | https://kaladete-arsip.github.io/Parse-INFO-LENGGER/ |

### 📋 Plan

| Fitur | Timeline |
|-------|----------|
| Supabase DB setup | Kalau user siap (SQL sudah ready) |
| Connect web UI → Supabase REST API | Setelah DB setup |
| Bot Telegram (Supabase Edge Functions) | Fase DB |
| IG auto-scrape (cron) | Fase DB |
| Master individu & rombongan | Setelah Excel rapi |
| RAG-KG (pgvector + Neo4j) | Fase berikutnya |

---

## Workflow

```
RAW .md → Parser → Excel 29 kolom → Weekly .xlsx ZIP
                                    ↓
                              User edit (flyer)
                                    ↓
                              Upload .xlsx → Clean MD ZIP
```

---

## Excel 29 Kolom

```
Event:       Tanggal | TanggalSelesai | Jam | peristiwa | Kategori | aktivitas_budaya | Gagrak
Partisipasi: nama_rombongan | Peran_Rombongan | nama_individu | peran_individu
Lokasi:      Lokasi | dusun | desa | kode_desa | kecamatan | kode_kecamatan | kabupaten | kode_kabupaten | provinsi
Provenance:  sumber | bukti | tipe_sumber | tanggal_capture | tingkat_verifikasi | status_consent
Quality:     kelengkapan | catatan_gap | catatan
```

---

## Master Wilayah

| Level | Count | GPS |
|-------|-------|-----|
| Provinsi | 34 | ❌ |
| Kabupaten | 21 | ✅ |
| Kecamatan | 450 | 69 ✅, 381 ❌ |
| Desa | 5882 | ❌ (progressive) |
| **Total** | **6387** | |

Supabase SQL: `supabase/schema.sql` + `supabase/seed-wilayah.sql`

---

## Quick Start

```bash
git clone https://github.com/kaladete-arsip/Parse-INFO-LENGGER.git
cd Parse-INFO-LENGGER
npm install && npm run dev
```

Live: https://kaladete-arsip.github.io/Parse-INFO-LENGGER/

---

## Stack

Next.js 16 · TypeScript 5 · Tailwind 4 · shadcn/ui · ExcelJS · Tesseract.js · JSZip · Supabase (PostgreSQL + pgvector) · GitHub Pages

## License

CC BY 4.0 — INFO LENGGER Nyawiji Ing Seni · Yayasan Jaya Sanga Nusantara
