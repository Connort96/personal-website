-- Add series_name to works for easier filtering in RelatedWorks
ALTER TABLE works ADD COLUMN IF NOT EXISTS series_name TEXT;

-- Backfill existing series_name from series_works join
UPDATE works w
SET series_name = s.name
FROM series_works sw
JOIN series s ON s.id = sw.series_id
WHERE sw.work_id = w.id;
