-- ============================================================
-- Phase 12: Needs Review Column (Batch Scanner Support)
-- Safe, additive migration — adds needs_review boolean to
-- editions and books tables. Existing rows default to false.
-- ============================================================

ALTER TABLE editions ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE books    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
