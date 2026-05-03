-- ============================================================
-- Phase 11: Editions Metadata Extension
-- Safe, additive migration - adds columns to editions and books
-- ============================================================

-- Add metadata columns to editions table
ALTER TABLE editions
  ADD COLUMN IF NOT EXISTS page_count       INT,
  ADD COLUMN IF NOT EXISTS isbn             TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS translator       TEXT;

-- Mirror on legacy books table for Collection.jsx backwards compatibility
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS page_count       INT,
  ADD COLUMN IF NOT EXISTS isbn             TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS translator       TEXT;
