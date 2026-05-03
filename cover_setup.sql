-- Add cover_url column to books table
ALTER TABLE books
ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Update RLS policies to allow the Admin to UPDATE global books (so they can add covers to legacy books)
CREATE POLICY "Only Admin can update books" 
ON books FOR UPDATE 
USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');
