-- Add primary_edition_id to works table
ALTER TABLE works ADD COLUMN primary_edition_id UUID REFERENCES editions(id);
