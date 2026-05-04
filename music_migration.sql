-- ============================================================
-- Phase 15: Music Overhaul (Featured Music)
-- ============================================================

CREATE TABLE IF NOT EXISTS featured_music (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'album', -- 'album' or 'playlist'
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE featured_music ENABLE ROW LEVEL SECURITY;

-- Publicly readable
CREATE POLICY "Featured music is publicly readable" 
  ON featured_music FOR SELECT 
  USING (true);

-- Only Admin can manage featured music
CREATE POLICY "Only Admin can manage featured music" 
  ON featured_music FOR ALL
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');
