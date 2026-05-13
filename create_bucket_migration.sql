-- ============================================================
-- Supabase Storage Setup: Book Covers
-- Creates the public bucket and the required RLS policies
-- so the scanner can upload compressed images.
-- ============================================================

-- 1. Create the 'book-covers' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Allow authenticated users to upload files to the bucket
-- Note: 'authenticated' role means anyone logged into your app (you)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'book-covers' );

-- 3. Allow public access to view the images
CREATE POLICY "Allow public viewing"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'book-covers' );
