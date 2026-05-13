-- ============================================================
-- AI Enrichment Schema Expansion
-- Adds literary metadata to works and physical provenance to editions.
-- Safe, additive migration — existing rows get sensible defaults.
-- ============================================================

-- works table: literary metadata from Gemini
ALTER TABLE works ADD COLUMN IF NOT EXISTS motifs text[] DEFAULT '{}';
ALTER TABLE works ADD COLUMN IF NOT EXISTS vibes text[] DEFAULT '{}';
ALTER TABLE works ADD COLUMN IF NOT EXISTS setting_era text;
ALTER TABLE works ADD COLUMN IF NOT EXISTS setting_location text;
ALTER TABLE works ADD COLUMN IF NOT EXISTS ai_enriched boolean DEFAULT false;

-- editions table: physical provenance
ALTER TABLE editions ADD COLUMN IF NOT EXISTS condition text;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS defects text[] DEFAULT '{}';
ALTER TABLE editions ADD COLUMN IF NOT EXISTS acquisition_notes text;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS acquisition_year integer;
