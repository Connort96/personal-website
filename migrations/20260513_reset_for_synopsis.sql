-- Migration: Reset AI Enrichment for Synopsis Backfill
-- Resets the ai_enriched flag for any work missing a synopsis, 
-- allowing the retroactive scanner to re-process them.

UPDATE works 
SET ai_enriched = false 
WHERE synopsis IS NULL;

COMMENT ON TABLE works IS 'Metadata reset performed on 2026-05-13 to backfill academic synopses.';
