-- Reset the sequence for books.id since we seeded it manually
SELECT setval('books_id_seq', (SELECT MAX(id) FROM books));

-- Enable the admin to insert books into the global catalog
CREATE POLICY "Only Admin can insert books" 
ON books FOR INSERT 
WITH CHECK (
  auth.jwt() ->> 'email' = 'theconison96@gmail.com'
);
