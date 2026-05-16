-- ============================================================
-- Add Missing DELETE Policies for Editions and Works
-- Run this in Supabase SQL Editor to allow Admin deletion of trackers and books
-- ============================================================

-- Enable Admin to delete editions
DROP POLICY IF EXISTS "Only Admin can delete editions" ON editions;
CREATE POLICY "Only Admin can delete editions" ON editions FOR DELETE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- Enable Admin to delete works
DROP POLICY IF EXISTS "Only Admin can delete works" ON works;
CREATE POLICY "Only Admin can delete works" ON works FOR DELETE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- Ensure Admin can delete user_books
DROP POLICY IF EXISTS "Users can delete their own books" ON user_books;
DROP POLICY IF EXISTS "Admin can delete any user_books" ON user_books;
CREATE POLICY "Admin can delete any user_books" ON user_books FOR DELETE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com' OR auth.uid() = user_id);
