-- ============================================================
-- Phase 13: Multi-Edition Ownership Support
-- This migration removes the restrictive (user_id, book_id) 
-- constraint to allow users to own multiple editions of the 
-- same work (e.g. both Hardcover and Paperback).
-- ============================================================

-- 1. Ensure edition_id is never null for the new constraint
UPDATE user_books SET edition_id = book_id WHERE edition_id IS NULL;

-- 2. Drop the old composite primary key that limited ownership to one per work
ALTER TABLE user_books DROP CONSTRAINT IF EXISTS user_books_pkey;

-- 3. Apply the new primary key based on the specific edition
-- This allows multiple rows with the same book_id as long as edition_id differs.
ALTER TABLE user_books ADD PRIMARY KEY (user_id, edition_id);

-- 4. Verify RLS policies (they should still work as they reference user_id)
-- But we ensure the Admin policy covers the new structure
DROP POLICY IF EXISTS "Admin can update any user_books" ON user_books;
CREATE POLICY "Admin can update any user_books"
ON user_books FOR ALL
USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');
