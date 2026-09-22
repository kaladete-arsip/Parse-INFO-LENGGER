-- ============================================================
-- OBH — Master Lokasi Schema
-- Aligns with OBH database schema (location_master table)
-- https://jayasanganusantara.or.id/observatorium
-- ============================================================

-- Drop if exists (for re-run during development)
DROP TABLE IF EXISTS master_lokasi CASCADE;

CREATE TABLE master_lokasi (
  id              SERIAL PRIMARY KEY,
  
  -- Identity
  nama            TEXT NOT NULL,
  nama_resmi      TEXT,
  level           TEXT NOT NULL CHECK (level IN ('provinsi', 'kabupaten', 'kecamatan', 'desa', 'dusun')),
  tipe            TEXT DEFAULT NULL, -- 'kabupaten' | 'kota' | 'kecamatan' | 'desa' | 'kelurahan' | 'dusun' | 'landmark'
  
  -- Hierarchy
  parent_id       INTEGER REFERENCES master_lokasi(id),
  
  -- Codes (Kemendagri/BPS)
  kode_kemendagri TEXT UNIQUE,
  kode_bps        TEXT,
  
  -- GPS (progressive — not all levels have coordinates)
  lat             DECIMAL(10, 7),
  lng             DECIMAL(10, 7),
  geo_accuracy    TEXT, -- 'provinsi' | 'kabupaten' | 'kecamatan' | 'desa' | 'dusun'
  geo_source      TEXT DEFAULT 'nominatim',
  
  -- Full address (from Nominatim, if available)
  alamat_lengkap  TEXT,
  
  -- Status (OBH principle: data tidak lengkap tidak ditolak)
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'rejected')),
  
  -- Metadata
  kelengkapan     TEXT DEFAULT 'partial' CHECK (kelengkapan IN ('lengkap', 'partial', 'tidak_ada')),
  catatan_gap     TEXT,
  
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lokasi_parent ON master_lokasi(parent_id);
CREATE INDEX idx_lokasi_kode ON master_lokasi(kode_kemendagri);
CREATE INDEX idx_lokasi_level ON master_lokasi(level);
CREATE INDEX idx_lokasi_status ON master_lokasi(status);
CREATE INDEX idx_lokasi_nama ON master_lokasi(LOWER(nama));

-- Enable RLS (Row Level Security) — public read, no public write
ALTER TABLE master_lokasi ENABLE ROW LEVEL SECURITY;

-- Public can read confirmed data only (draft = private, for user acc)
CREATE POLICY "Public read confirmed" ON master_lokasi
  FOR SELECT USING (status = 'confirmed');

-- Authenticated users can read all + write (for Studio UI acc)
CREATE POLICY "Auth read all" ON master_lokasi
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert" ON master_lokasi
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update" ON master_lokasi
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete" ON master_lokasi
  FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lokasi_updated_at
  BEFORE UPDATE ON master_lokasi
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Enable pgvector (for RAG phase later)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
