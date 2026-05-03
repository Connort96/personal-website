-- 1. Create books table (master catalogue)
CREATE TABLE books (
  id          SERIAL PRIMARY KEY,
  genre_id    TEXT NOT NULL,
  genre_name  TEXT NOT NULL,
  color       TEXT NOT NULL,
  badge       TEXT,
  badge_label TEXT,
  book_index  INT NOT NULL,
  title       TEXT NOT NULL,
  author      TEXT NOT NULL,
  note        TEXT,
  UNIQUE(genre_id, book_index)
);

-- Enable RLS on books
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Books are publicly readable" ON books FOR SELECT USING (true);

-- 2. Create user_books table (the join table for ownership)
CREATE TABLE user_books (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id     INT  REFERENCES books(id) ON DELETE CASCADE,
  owned_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

-- Enable RLS on user_books
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own books" 
ON user_books FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own books" 
ON user_books FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own books" 
ON user_books FOR DELETE 
USING (auth.uid() = user_id);

-- 3. Create profiles table (optional, for displaying username if needed)
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- Function to handle new user signups automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function above
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
