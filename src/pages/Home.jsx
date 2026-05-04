import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NowPlaying from '../components/NowPlaying';
import './Home.css';

export default function Home() {
  const [latestPost, setLatestPost] = useState(null);
  const [currentlyReading, setCurrentlyReading] = useState(null);
  const [topReviews, setTopReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHomeData() {
      try {
        const { data: adminSettings } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
        const adminId = adminSettings?.admin_user_id;

        if (adminId) {
          // Fetch currently reading
          const { data: readingData } = await supabase
            .from('user_books')
            .select(`
              id,
              status,
              editions ( cover_url, works ( title, author ) ),
              books ( title, author, cover_url )
            `)
            .eq('user_id', adminId)
            .eq('status', 'reading')
            .limit(1);

          if (readingData && readingData.length > 0) {
            const item = readingData[0];
            setCurrentlyReading({
              id: item.id,
              title: item.editions?.works?.title || item.books?.title,
              author: item.editions?.works?.author || item.books?.author,
              cover_url: item.editions?.cover_url || item.books?.cover_url,
            });
          }

          // Fetch recent 5-star reviews
          const { data: reviewsData } = await supabase
            .from('user_books')
            .select(`
              id,
              rating,
              review,
              editions ( cover_url, works ( title, author ) ),
              books ( title, author, cover_url )
            `)
            .eq('user_id', adminId)
            .eq('rating', 5)
            .not('review', 'is', null)
            .not('review', 'eq', '')
            .order('owned_at', { ascending: false })
            .limit(3);

          if (reviewsData) {
            setTopReviews(reviewsData.map(item => ({
              id: item.id,
              title: item.editions?.works?.title || item.books?.title,
              author: item.editions?.works?.author || item.books?.author,
              cover_url: item.editions?.cover_url || item.books?.cover_url,
              review: item.review
            })));
          }
          // Fetch latest post
          const { data: latestPostData } = await supabase
            .from('posts')
            .select('id, title, slug, excerpt, published_at')
            .order('published_at', { ascending: false })
            .limit(1);
            
          if (latestPostData && latestPostData.length > 0) {
            setLatestPost(latestPostData[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching home data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchHomeData();
  }, []);

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero" id="hero-section">
        <div className="hero__noise"></div>
        <div className="hero__bg"></div>
        <div className="hero__content container">
          <div className="hero__text animate-fade-in-up">
            <p className="hero__greeting">Welcome to</p>
            <h1 className="hero__title">
              <span className="hero__title-line">Connor's Collection</span>
            </h1>
            <p className="hero__subtitle">
              A personal space for words, sounds, and stories.
              <br />
              Blog posts, music I love, and books that shaped me.
            </p>
            <div className="hero__actions">
              {latestPost && (
                <div className="hero-latest-post">
                  <span className="hero-latest-post__label">Latest Post</span>
                  <Link to={`/blog/${latestPost.slug}`} className="hero-latest-post__card">
                    <time className="hero-latest-post__date">
                      {new Date(latestPost.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </time>
                    <h3 className="hero-latest-post__title">{latestPost.title}</h3>
                    <p className="hero-latest-post__excerpt">
                      {latestPost.excerpt ? latestPost.excerpt.split(' ').slice(0, 20).join(' ') + '...' : ''}
                    </p>
                    <span className="hero-latest-post__read">Read post →</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
          
          <div className="hero__visual animate-fade-in-up animate-stagger-3">
            {currentlyReading && (
              <div className="hero-now-reading">
                <div className="hero-now-reading__header">
                  <span className="hero-now-reading__badge">📖 Currently Reading</span>
                </div>
                <div className="hero-now-reading__content">
                  {currentlyReading.cover_url ? (
                    <img src={currentlyReading.cover_url} alt={currentlyReading.title} className="hero-now-reading__cover" />
                  ) : (
                    <div className="hero-now-reading__cover hero-now-reading__cover--placeholder">
                      {currentlyReading.title?.[0]}
                    </div>
                  )}
                  <div className="hero-now-reading__info">
                    <h3 className="hero-now-reading__title">{currentlyReading.title}</h3>
                    <p className="hero-now-reading__author">{currentlyReading.author}</p>
                    <Link to="/books" className="hero-now-reading__link">View Library →</Link>
                  </div>
                </div>
              </div>
            )}
            {!currentlyReading && !loading && (
              <>
                <div className="hero__orb hero__orb--1"></div>
                <div className="hero__orb hero__orb--2"></div>
                <div className="hero__orb hero__orb--3"></div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Bento Grid */}
      <section className="bento-section" id="activity-grid">
        <div className="container">
          <div className="bento-grid">
            {/* Reviews Block */}
            <div className="bento-item bento-reviews animate-fade-in-up">
              <div className="bento-item__header">
                <h2 className="bento-item__title">Recent 5-Star Reads</h2>
                <Link to="/books" className="bento-item__link">See all →</Link>
              </div>
              <div className="bento-reviews__list">
                {topReviews.length > 0 ? topReviews.map(review => (
                  <div key={review.id} className="bento-review-card">
                    {review.cover_url ? (
                      <img src={review.cover_url} alt={review.title} className="bento-review-card__cover" />
                    ) : (
                      <div className="bento-review-card__cover bento-review-card__cover--placeholder">
                        {review.title?.[0]}
                      </div>
                    )}
                    <div className="bento-review-card__content">
                      <div className="bento-review-card__stars">★★★★★</div>
                      <h3 className="bento-review-card__title">{review.title}</h3>
                      <p className="bento-review-card__author">{review.author}</p>
                      <p className="bento-review-card__text">"{review.review.length > 80 ? review.review.substring(0, 80) + '...' : review.review}"</p>
                    </div>
                  </div>
                )) : (
                  <p className="bento-empty">No reviews yet.</p>
                )}
              </div>
            </div>

            {/* Music Block */}
            <div className="bento-item bento-music animate-fade-in-up animate-stagger-1">
              <div className="bento-item__header">
                <h2 className="bento-item__title">Latest Rotation</h2>
                <Link to="/music" className="bento-item__link">Listen →</Link>
              </div>
              <div className="bento-music__content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', justifyContent: 'center' }}>
                <NowPlaying />
                <p className="bento-music__text" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
                  A real-time look at my current sounds, synced via Spotify.
                </p>
              </div>
            </div>

            {/* Travel Block */}
            <div className="bento-item bento-travel animate-fade-in-up animate-stagger-2">
              <div className="bento-item__header">
                <h2 className="bento-item__title">Recent Travels</h2>
              </div>
              <div className="bento-travel__content">
                <div className="bento-travel__photo-placeholder">
                  <span className="bento-travel__icon">✈️</span>
                  <p>Travel gallery coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
