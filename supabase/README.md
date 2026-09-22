# Supabase Setup — Master Wilayah

Setup PostgreSQL DB di Supabase (free) untuk master lokasi OBH.

## Quick Start

### 1. Create Supabase project (free)

1. Buka https://supabase.com → Sign up (Google/GitHub)
2. Click **New Project**
3. Name: `obh-master` (atau apa saja)
4. Database password: simpan (catat!)
5. Region: Singapore (terdekat)
6. Plan: Free
7. Tunggu ~2 menit (provisioning)

### 2. Run schema SQL

1. Supabase Dashboard → **SQL Editor** (sidebar kiri)
2. Click **New query**
3. Copy-paste isi `supabase/schema.sql`
4. Click **Run** (tunggu 2-3 detik)
5. Verify: table `master_lokasi` muncul di **Table Editor**

### 3. Run seed SQL (6387 entries)

1. SQL Editor → **New query**
2. Copy-paste isi `supabase/seed-wilayah.sql` (1.5MB, mungkin perlu split)
3. Click **Run** (tunggu 5-10 detik)
4. Verify: Table Editor → `master_lokasi` → 6387 rows

**Kalau terlalu besar** (timeout): split jadi 3 file:
- File 1: provinsi + kabupaten (~55 rows)
- File 2: kecamatan (~450 rows)
- File 3: desa (~5882 rows) — split lagi kalau perlu

### 4. Verify

```sql
-- Check counts
SELECT level, COUNT(*) FROM master_lokasi GROUP BY level ORDER BY level;

-- Check sample
SELECT * FROM master_lokasi WHERE level = 'kabupaten' LIMIT 5;

-- Search by name
SELECT * FROM master_lokasi WHERE nama ILIKE '%wonosobo%' LIMIT 10;
```

## Table Structure

```sql
master_lokasi (
  id SERIAL PRIMARY KEY,
  nama TEXT,              -- "Wonosobo"
  nama_resmi TEXT,        -- "WONOSOBO" (uppercase)
  level TEXT,             -- provinsi | kabupaten | kecamatan | desa | dusun
  tipe TEXT,              -- kabupaten | kota | kecamatan | desa | kelurahan
  parent_id INTEGER,      -- FK ke parent (hierarchy)
  kode_kemendagri TEXT,   -- "33.07" (kab), "33.07.06" (kec), "33.07.06.2004" (desa)
  kode_bps TEXT,          -- BPS code
  lat DECIMAL,            -- GPS latitude (progressive)
  lng DECIMAL,            -- GPS longitude
  geo_accuracy TEXT,      -- level akurasi GPS
  geo_source TEXT,        -- 'nominatim' | 'manual'
  alamat_lengkap TEXT,    -- full address from Nominatim
  status TEXT,            -- draft | confirmed | rejected
  kelengkapan TEXT,       -- lengkap | partial | tidak_ada
  catatan_gap TEXT,       -- penjelasan kenapa tidak lengkap
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Data Coverage

| Level | Count | GPS | Status |
|-------|-------|-----|--------|
| Provinsi | 34 | ❌ | confirmed |
| Kabupaten | 21 | ✅ | confirmed |
| Kecamatan | 450 | 69 (geo) + 381 (no GPS) | confirmed |
| Desa | 5882 | ❌ (progressive) | confirmed |
| **Total** | **6387** | | |

## RLS (Row Level Security)

- **Public**: read only confirmed data (for GitHub Pages web UI later)
- **Authenticated**: full CRUD (for Studio UI — user acc draft → confirmed)

## Next Steps

1. Setup Supabase + run SQL ✅
2. (Later) Connect GitHub Pages web UI to Supabase REST API (replace static .ts)
3. (Later) Supabase Edge Functions (bot Telegram + cron IG scrape)
4. (Later) pgvector for RAG

## Regenerate SQL

Kalau master wilayah .ts diupdate:

```bash
bun run scripts/generate-wilayah-sql.ts
# → supabase/seed-wilayah.sql (regenerated)
```
