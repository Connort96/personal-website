-- ============================================================
-- Phase 13: Database-Backed Blog
-- Creates posts table and blog-images storage bucket
-- ============================================================

-- 1. Create the `posts` table
CREATE TABLE IF NOT EXISTS posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT NOT NULL,
  excerpt        TEXT,
  content        TEXT NOT NULL, -- HTML from TipTap
  featured_image TEXT,
  work_id        INT REFERENCES works(id) ON DELETE SET NULL, -- Optional link to a book
  published_at   TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Posts are publicly readable
CREATE POLICY "Posts are publicly readable" 
  ON posts FOR SELECT 
  USING (true);

-- Only Admin can insert/update/delete posts
CREATE POLICY "Only Admin can insert posts" 
  ON posts FOR INSERT
  WITH CHECK (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

CREATE POLICY "Only Admin can update posts" 
  ON posts FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

CREATE POLICY "Only Admin can delete posts" 
  ON posts FOR DELETE
  USING (auth.jwt() ->> 'email' = 'theconison96@gmail.com');

-- 2. Create the `blog-images` storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage objects in 'blog-images'
CREATE POLICY "Blog images are publicly accessible" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'blog-images');

CREATE POLICY "Only Admin can upload blog images" 
  ON storage.objects FOR INSERT 
  WITH CHECK (
    bucket_id = 'blog-images' 
    AND (auth.jwt() ->> 'email' = 'theconison96@gmail.com')
  );

CREATE POLICY "Only Admin can update blog images" 
  ON storage.objects FOR UPDATE 
  USING (
    bucket_id = 'blog-images' 
    AND (auth.jwt() ->> 'email' = 'theconison96@gmail.com')
  );

CREATE POLICY "Only Admin can delete blog images" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id = 'blog-images' 
    AND (auth.jwt() ->> 'email' = 'theconison96@gmail.com')
  );


-- 3. Seed existing posts
INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('books-that-rewired-my-brain', 'Books That Rewired My Brain', 'A handful of books that didn''t just entertain me — they fundamentally changed how I see the world.', '<p>A handful of books that didn&#39;t just entertain me — they fundamentally changed how I see the world.</p>
<h2>The List</h2>
<p>These aren&#39;t &quot;best of&quot; picks. They&#39;re the books that cracked something open in my thinking. Your list would be different, and that&#39;s the whole point.</p>
<h3><em>Sapiens</em> by Yuval Noah Harari</h3>
<p>This book made me feel simultaneously insignificant and empowered. The idea that human civilization runs on shared fictions — money, nations, corporations — was like putting on glasses for the first time.</p>
<h3><em>The Overstory</em> by Richard Powers</h3>
<p>I&#39;ve never looked at trees the same way. Powers writes about forests the way some authors write about lovers — with reverence, wonder, and a deep ache for what we&#39;re losing.</p>
<h3><em>Stoner</em> by John Williams</h3>
<p>The quietest masterpiece I&#39;ve ever read. A novel about an ordinary life, told so perfectly that it becomes extraordinary. It taught me that you don&#39;t need explosions to tell a powerful story.</p>
<h3><em>Thinking, Fast and Slow</em> by Daniel Kahneman</h3>
<p>The book that made me distrust my own brain — in the best way possible. Every chapter is a revelation about how poorly we understand our own decision-making.</p>
<h2>Why These Books Matter</h2>
<p>Each of these books gave me a new lens. And once you see through a new lens, you can&#39;t unsee it. That&#39;s the power of reading — it&#39;s not about accumulating information. It&#39;s about transformation.</p>
', '2026-03-22T00:00:00.000Z') ON CONFLICT (slug) DO NOTHING;
INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('learning-to-sit-with-silence', 'Learning to Sit with Silence', 'We fill every quiet moment with noise. What happens when you stop?', '<p>We fill every quiet moment with noise. What happens when you stop?</p>
<h2>The Experiment</h2>
<p>For one week, I eliminated background noise. No music while cooking. No podcasts while walking. No TV while eating. Just… silence.</p>
<p>The first day was excruciating. My hand kept reaching for my phone like a phantom limb. By day three, something shifted.</p>
<h2>What I Heard</h2>
<p>Without the constant input, I started noticing things:</p>
<ul>
<li>The rhythm of my own breathing</li>
<li>The way rain sounds different on glass versus leaves</li>
<li>Thoughts I&#39;d been drowning out for months</li>
</ul>
<h2>The Discomfort is the Teacher</h2>
<p>Silence is uncomfortable because it forces you to be with yourself. No distractions, no escapes. Just you and whatever you&#39;ve been avoiding.</p>
<p>And that&#39;s exactly why it&#39;s valuable.</p>
<h2>A New Relationship with Sound</h2>
<p>After the week ended, I didn&#39;t go back to my old habits. Now I choose sound intentionally. Music is an event, not wallpaper. Podcasts are a treat, not a default. And silence? Silence is where I do my best thinking.</p>
', '2026-03-05T00:00:00.000Z') ON CONFLICT (slug) DO NOTHING;
INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('the-art-of-slow-living', 'The Art of Slow Living', 'In a world that glorifies hustle culture, I''ve been experimenting with doing less — and finding more meaning in the process.', '<p>In a world that glorifies hustle culture, I&#39;ve been experimenting with doing less — and finding more meaning in the process.</p>
<h2>The Breaking Point</h2>
<p>It started last autumn. I was juggling three projects, doom-scrolling through feeds, and measuring my worth in productivity metrics. Then one morning, I just… didn&#39;t open my laptop. Instead, I made coffee — real coffee, with a hand grinder and a pour-over — and sat by the window watching the rain.</p>
<p>That hour changed everything.</p>
<h2>What Slow Living Actually Means</h2>
<p>Slow living isn&#39;t about being lazy. It&#39;s about intentionality. It&#39;s choosing depth over breadth, quality over quantity. It means:</p>
<ul>
<li><strong>Cooking a meal</strong> instead of ordering one</li>
<li><strong>Reading a chapter</strong> instead of skimming headlines</li>
<li><strong>Having one great conversation</strong> instead of ten shallow ones</li>
</ul>
<h2>The Unexpected Benefits</h2>
<p>Since embracing a slower pace, I&#39;ve noticed my creativity has skyrocketed. Ideas come when there&#39;s space for them. My best writing happens after long walks with no earbuds, no podcasts — just the sound of the world.</p>
<h2>Finding Your Own Pace</h2>
<p>You don&#39;t have to overhaul your life overnight (that would be very un-slow of you). Start small. One slow morning a week. One evening with your phone in another room. One meal cooked from scratch.</p>
<p>The world will keep spinning. But you might finally notice how beautiful the rotation is.</p>
', '2026-04-28T00:00:00.000Z') ON CONFLICT (slug) DO NOTHING;
INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('vinyl-in-the-digital-age', 'Vinyl in the Digital Age', 'Why I started collecting records in 2026, and what the crackle and hiss taught me about listening.', '<p>Why I started collecting records in 2026, and what the crackle and hiss taught me about listening.</p>
<h2>The First Record</h2>
<p>I found it at a flea market — a beat-up copy of Miles Davis&#39;s <em>Kind of Blue</em>. The sleeve was water-stained, the vinyl scratched. But when I dropped the needle, something shifted. The music wasn&#39;t just playing — it was <em>arriving</em>.</p>
<h2>Digital Convenience vs. Analog Experience</h2>
<p>Streaming is incredible. I have the entire history of recorded music in my pocket. But there&#39;s something about the ritual of vinyl that streaming can&#39;t replicate:</p>
<ol>
<li><strong>The selection</strong> — standing in front of your shelf, running your fingers along the spines</li>
<li><strong>The commitment</strong> — you&#39;re listening to this album, start to finish, no skip button</li>
<li><strong>The physicality</strong> — holding the artwork, reading the liner notes, watching the disc spin</li>
</ol>
<h2>Building a Collection</h2>
<p>My collection is small but curated. Each record has a story — where I found it, what was happening in my life when I bought it, the first time I really <em>heard</em> it.</p>
<h2>The Imperfection is the Point</h2>
<p>That crackle between tracks? The slight warble of a record that&#39;s been loved too hard? Those aren&#39;t flaws. They&#39;re proof that music is a living thing, changed by every hand that&#39;s touched it.</p>
<p>In a world of perfect digital reproduction, imperfection feels revolutionary.</p>
', '2026-04-15T00:00:00.000Z') ON CONFLICT (slug) DO NOTHING;
INSERT INTO posts (slug, title, excerpt, content, published_at) VALUES ('why-i-write-by-hand', 'Why I Write by Hand', 'In defense of the notebook, the fountain pen, and the beautifully imperfect handwritten word.', '<p>In defense of the notebook, the fountain pen, and the beautifully imperfect handwritten word.</p>
<h2>The Tactile Joy</h2>
<p>There&#39;s a specific pleasure in the scratch of nib on paper. The slight resistance, the flow of ink, the way your handwriting changes with your mood. It&#39;s writing as a physical act, not just a mental one.</p>
<h2>Slower is Smarter</h2>
<p>When I type, I transcribe. When I write by hand, I think. The slowness forces me to choose words more carefully, to synthesize ideas rather than just capture them.</p>
<p>Research backs this up — handwriting engages different neural pathways than typing. It&#39;s not just romantic nostalgia; it&#39;s cognitive science.</p>
<h2>The Beauty of Impermanence</h2>
<p>A typed document is infinitely editable, always perfectible. A handwritten page is done. The crossed-out words, the arrows, the marginalia — they&#39;re a map of your thinking process.</p>
<p>I have notebooks from years ago that I flip through like photo albums. Each page is a snapshot of who I was when I wrote it.</p>
<h2>Getting Started</h2>
<p>You don&#39;t need a fancy pen or a leather-bound journal (though both are lovely). A ballpoint and a cheap notebook will do. The point isn&#39;t the tools — it&#39;s the act of slowing down enough to let your thoughts take shape on paper.</p>
<p>Try it. Write a letter to a friend. Journal for ten minutes. Draft a poem. Feel the words forming under your hand.</p>
<p>It&#39;s magic. Quiet, analog, imperfect magic.</p>
', '2026-02-18T00:00:00.000Z') ON CONFLICT (slug) DO NOTHING;
