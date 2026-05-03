-- ============================================================
-- Phase 10: Works & Editions Migration
-- Run this in Supabase SQL Editor AFTER taking a backup.
-- This script is non-destructive: books table is preserved.
-- ============================================================

-- STEP 1: Create the `works` table (abstract title + author)
CREATE TABLE IF NOT EXISTS works (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Works are publicly readable" ON works FOR SELECT USING (true);
CREATE POLICY "Only Admin can insert works" ON works FOR INSERT
  WITH CHECK (auth.jwt() ->> 'email' = 'theconison96@gmail.com');
CREATE POLICY "Only Admin can update works" ON works FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- STEP 2: Populate works from the existing books table (1:1 mapping, keeps same IDs)
INSERT INTO works (id, title, author)
SELECT id, title, author FROM books
ON CONFLICT DO NOTHING;

-- Make sure the sequence doesn't collide with existing IDs
SELECT setval('works_id_seq', (SELECT MAX(id) FROM works));


-- STEP 3: Create the `editions` table (physical copy: cover, publisher, etc.)
CREATE TABLE IF NOT EXISTS editions (
  id          SERIAL PRIMARY KEY,
  work_id     INT REFERENCES works(id) ON DELETE CASCADE NOT NULL,
  publisher   TEXT,
  cover_url   TEXT,
  -- Preserve legacy genre/color metadata needed by Collection page
  genre_id    TEXT,
  genre_name  TEXT,
  color       TEXT,
  badge       TEXT,
  badge_label TEXT,
  book_index  INT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editions are publicly readable" ON editions FOR SELECT USING (true);
CREATE POLICY "Only Admin can insert editions" ON editions FOR INSERT
  WITH CHECK (auth.jwt() ->> 'email' = 'theconison96@gmail.com');
CREATE POLICY "Only Admin can update editions" ON editions FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- STEP 4: Populate editions 1:1 from books table (same IDs for backwards compat)
INSERT INTO editions (id, work_id, cover_url, genre_id, genre_name, color, badge, badge_label, book_index)
SELECT id, id, cover_url, genre_id, genre_name, color, badge, badge_label, book_index FROM books
ON CONFLICT DO NOTHING;

-- Sync the sequence
SELECT setval('editions_id_seq', (SELECT MAX(id) FROM editions));


-- STEP 5: Add edition_id column and read_at to user_books (non-destructive)
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS edition_id INT REFERENCES editions(id);
ALTER TABLE user_books ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Backfill edition_id from existing book_id (they are the same right now)
UPDATE user_books SET edition_id = book_id WHERE edition_id IS NULL;


-- STEP 6: Allow the admin to UPDATE user_books (for status/rating/review/read_at)
CREATE POLICY "Admin can update any user_books"
ON user_books FOR UPDATE
USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');


-- STEP 7: admin_settings - ensure it exists (idempotent)
CREATE TABLE IF NOT EXISTS admin_settings (
  id INT PRIMARY KEY DEFAULT 1,
  admin_user_id UUID REFERENCES auth.users(id)
);
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_settings' AND policyname = 'Public can view admin settings'
  ) THEN
    CREATE POLICY "Public can view admin settings" ON admin_settings FOR SELECT USING (true);
  END IF;
END $$;


-- DONE: The `books` table is untouched. Collection.jsx continues to work.
-- New queries should use: user_books -> editions -> works
