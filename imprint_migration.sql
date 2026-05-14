-- Add collection tracking columns to books and editions
ALTER TABLE books ADD COLUMN IF NOT EXISTS imprint_collection TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS curated_list TEXT;

ALTER TABLE editions ADD COLUMN IF NOT EXISTS imprint_collection TEXT;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS curated_list TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_books_imprint ON books(imprint_collection);
CREATE INDEX IF NOT EXISTS idx_editions_imprint ON editions(imprint_collection);
