-- ============================================================
-- bot_daily_raw — stores the bot's daily output (raw md + meta)
-- ============================================================
-- This table is separate from the OBH master schema (master_lokasi, etc.)
-- because the bot's output is "raw" (auto-extracted from TikTok via VLM)
-- and needs human review before being promoted to the OBH tables.
--
-- Flow:
--   TikTok post → VLM OCR → LLM fix → bot_daily_raw (this table)
--   → human review (add narrative) → bot_daily_final
--   → promote to OBH tables (peristiwa, aktivitas_harian, partisipasi, ...)
-- ============================================================

DROP TABLE IF EXISTS bot_daily_raw CASCADE;

CREATE TABLE bot_daily_raw (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,          -- ISO YYYY-MM-DD
  run_at          TIMESTAMPTZ NOT NULL,           -- when the bot ran
  photo_count     INTEGER NOT NULL DEFAULT 0,
  location_count  INTEGER NOT NULL DEFAULT 0,
  telegram_report TEXT,
  source          TEXT NOT NULL DEFAULT 'tiktok-real',
  source_url      TEXT,                           -- original TikTok post URL
  raw_md          TEXT NOT NULL,                  -- VLM OCR + LLM fix output
  photo_paths     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- paths in lengger-photos bucket
  has_final       BOOLEAN NOT NULL DEFAULT false,
  final_md        TEXT,                           -- user-edited md with narrative
  final_saved_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast date lookups
CREATE INDEX idx_bot_daily_raw_date ON bot_daily_raw (date DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bot_daily_raw_updated
  BEFORE UPDATE ON bot_daily_raw
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Storage bucket for original TikTok photos
-- ============================================================
-- Create this bucket in the Supabase Dashboard (Storage → New bucket):
--   Name: lengger-photos
--   Public: No (or Yes if you want public read access for previews)
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Photos are stored at: <date>/<filename> (e.g. 2026-09-22/2026-09-22.jpeg)
-- ============================================================
