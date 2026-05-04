-- ============================================================
-- Phase 14: Site Expansion (Travel, Now, Gear, Films)
-- ============================================================

-- 1. Travel: Trips
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  location TEXT,
  start_date DATE,
  end_date DATE,
  cover_image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public trips read" ON trips FOR SELECT USING (true);
CREATE POLICY "Admin trips all" ON trips USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 2. Travel: Trip Photos
CREATE TABLE IF NOT EXISTS trip_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trip_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public photos read" ON trip_photos FOR SELECT USING (true);
CREATE POLICY "Admin photos all" ON trip_photos USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 3. Now: Status Updates
CREATE TABLE IF NOT EXISTS status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public status read" ON status FOR SELECT USING (true);
CREATE POLICY "Admin status all" ON status USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 4. About: Gear
CREATE TABLE IF NOT EXISTS gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  image_url TEXT,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gear ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public gear read" ON gear FOR SELECT USING (true);
CREATE POLICY "Admin gear all" ON gear USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 5. Films
CREATE TABLE IF NOT EXISTS films (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  director TEXT,
  release_year INT,
  poster_url TEXT,
  backdrop_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE films ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public films read" ON films FOR SELECT USING (true);
CREATE POLICY "Admin films all" ON films USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 6. User Films
CREATE TABLE IF NOT EXISTS user_films (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id UUID REFERENCES films(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INT, -- 1-5
  review TEXT,
  watched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_films ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public user_films read" ON user_films FOR SELECT USING (true);
CREATE POLICY "Admin user_films all" ON user_films USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 7. Travel Images Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('travel-images', 'travel-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Travel images publicly accessible" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'travel-images');

CREATE POLICY "Admin manage travel images" 
  ON storage.objects FOR ALL 
  USING (
    bucket_id = 'travel-images' 
    AND (auth.jwt() ->> 'email' = 'theconison96@gmail.com')
  );
