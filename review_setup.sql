-- Add status, rating, and review columns to user_books
ALTER TABLE user_books
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unread',
ADD COLUMN IF NOT EXISTS rating INT CHECK (rating >= 1 AND rating <= 5),
ADD COLUMN IF NOT EXISTS review TEXT;

-- Create an UPDATE policy so users can edit their own reviews/status
CREATE POLICY "Users can update their own books" 
ON user_books FOR UPDATE 
USING (auth.uid() = user_id);
