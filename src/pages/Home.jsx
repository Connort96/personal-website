import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import NowPlaying from '../components/NowPlaying';
import './Home.css';

export default function Home() {
  const [latestPost, setLatestPost] = useState(null);
  const [currentlyReading, setCurrentlyReading] = useState(null);
  const [topReviews, setTopReviews] = useState([]);
  const [recentTrips, setRecentTrips] = useState([]);
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
          // Fetch currently reading with progress
          const { data: readingData } = await supabase
            .from('user_books')
            .select(`
              book_id,
              status,
              current_page,
              editions ( 
                cover_url, 
                works ( title, author ) 
              ),
              books (
                title,
                author,
                cover_url,
                page_count
              )
            `)
            .eq('user_id', adminId)
            .eq('status', 'reading')
            .limit(1);

          if (readingData && readingData.length > 0) {
            const item = readingData[0];
            const pageCount = item.books?.page_count || 300; // Fallback
            const progress = item.current_page > 0 ? (item.current_page / pageCount) * 100 : 0;
            
            setCurrentlyReading({
              id: item.book_id,
              title: item.editions?.works?.title || item.books?.title || 'Unknown Title',
              author: item.editions?.works?.author || item.books?.author || 'Unknown Author',
              cover_url: item.editions?.cover_url || item.books?.cover_url,
              progress: Math.min(100, progress)
            });
          }

          // Fetch recent reviews
          const { data: reviewsData } = await supabase
            .from('user_books')
            .select(`
              book_id,
              rating,
              review,
              owned_at,
              editions ( 
                cover_url, 
                works ( title, author ) 
              ),
              books (
                title,
                author,
                cover_url
              )
            `)
            .eq('user_id', adminId)
            .not('rating', 'is', null)
            .order('owned_at', { ascending: false })
            .limit(3);

          if (reviewsData) {
            setTopReviews(reviewsData.map(item => ({
              id: item.book_id,
              title: item.editions?.works?.title || item.books?.title || 'Unknown Title',
              author: item.editions?.works?.author || item.books?.author || 'Unknown Author',
              cover_url: item.editions?.cover_url || item.books?.cover_url,
              review: item.review || 'No review written yet.',
              rating: item.rating
            })));
          }

          // Fetch recent travel trips with photos
          const { data: travelData } = await supabase
            .from('trips')
            .select(`
              *,
              trip_photos ( url )
            `)
            .order('start_date', { ascending: false })
            .limit(3);
            
          if (travelData) {
            setRecentTrips(travelData.map(trip => ({
              ...trip,
              display_image: trip.cover_image_url || (trip.trip_photos && trip.trip_photos.length > 0 ? trip.trip_photos[0].url : null)
            })));
          }

          // Fetch latest post with thumbnail
          const { data: latestPostData } = await supabase
            .from('posts')
            .select('id, title, slug, excerpt, published_at, featured_image')
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

  const renderStars = (rating) => {
    return '★'.repeat(rating || 0) + '☆'.repeat(5 - (rating || 0));
  };

  return (
    <div className="home">
      <div className="home__noise-overlay"></div>
      
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__glow-bridge"></div>
        <div className="hero__micro-tag hero__micro-tag--top-left">SO-UK // 2026</div>
        
        <div className="hero__content container">
          <motion.div 
            className="hero__text"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="hero__greeting">A Personal Archive</p>
            <h1 className="hero__title">
              <span className="hero__title-line">CONNOR’S COLLECTIONS</span>
            </h1>
            <p className="hero__subtitle">
              An editorial anthology of literature, sound, and observations from the road. 
              Exploring the texture of a life lived intentionally.
              <span className="hero__signature">— Connor</span>
            </p>
            <div className="hero__actions">
              {latestPost && (
                <Link to={`/blog/${latestPost.slug}`} className="hero-compact-post">
                  {latestPost.featured_image && (
                    <div className="hero-compact-post__thumb">
                      <img src={latestPost.featured_image} alt={latestPost.title} />
                    </div>
                  )}
                  <div className="hero-compact-post__content">
                    <span className="hero-compact-post__label">Latest Entry</span>
                    <h3 className="hero-compact-post__title">{latestPost.title}</h3>
                  </div>
                  <span className="hero-compact-post__arrow">→</span>
                </Link>
              )}
            </div>
          </motion.div>
          
          <motion.div 
            className="hero__visual"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="hero__spotlight"></div>
            {currentlyReading && (
              <div className="hero-reading-card">
                <div className="hero-reading-card__header">
                  <span className="hero-reading-card__badge">Currently Reading</span>
                </div>
                <div className="hero-reading-card__content">
                  {currentlyReading.cover_url ? (
                    <img src={currentlyReading.cover_url} alt={currentlyReading.title} className="hero-reading-card__cover" />
                  ) : (
                    <div className="hero-reading-card__cover-placeholder">
                      {currentlyReading.title?.[0]}
                    </div>
                  )}
                  <div className="hero-reading-card__info">
                    <h3 className="hero-reading-card__title">{currentlyReading.title}</h3>
                    <p className="hero-reading-card__author">{currentlyReading.author}</p>
                    <Link to="/books" className="hero-reading-card__link">Library →</Link>
                  </div>
                </div>
                <div className="hero-reading-card__progress">
                  <div 
                    className="hero-reading-card__progress-bar" 
                    style={{ width: `${currentlyReading.progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
        
        <div className="hero__scroll-guide"></div>
      </section>

      {/* Bento Grid */}
      <section className="bento-section">
        <div className="container">
          <div className="bento-micro-label">VOL. 01 // COLLECTIONS</div>
          <div className="bento-grid">
            {/* Reviews Block */}
            <motion.div 
              className="bento-item bento-reviews"
              whileHover={{ y: -5, borderColor: 'rgba(200, 168, 75, 0.5)' }}
              transition={{ duration: 0.3 }}
            >
              <div className="bento-header">
                <div>
                  <h2 className="bento-header__title">Recent Reviews</h2>
                  <p className="bento-header__sublabel">Reflections on recent reads</p>
                </div>
                <Link to="/books" className="bento-header__link">Archive →</Link>
              </div>
              <div className="bento-reviews-list">
                {topReviews.length > 0 ? topReviews.map(review => (
                  <div key={review.id} className="bento-review-row">
                    {review.cover_url ? (
                      <img src={review.cover_url} alt={review.title} className="bento-review-row__cover" />
                    ) : (
                      <div className="bento-review-row__cover-placeholder">
                        {review.title?.[0]}
                      </div>
                    )}
                    <div className="bento-review-row__content">
                      <div className="bento-review-row__stars">{renderStars(review.rating)}</div>
                      <h3 className="bento-review-row__title">{review.title}</h3>
                      <p className="bento-review-row__author">{review.author}</p>
                      <p className="bento-review-row__text">"{review.review.length > 80 ? review.review.substring(0, 80) + '...' : review.review}"</p>
                    </div>
                  </div>
                )) : (
                  <p className="bento-empty">Curating the shelves...</p>
                )}
              </div>
            </motion.div>

            {/* Music Block */}
            <motion.div 
              className="bento-item bento-music"
              whileHover={{ y: -5, borderColor: 'rgba(200, 168, 75, 0.5)' }}
              transition={{ duration: 0.3 }}
            >
              <div className="bento-header">
                <div>
                  <h2 className="bento-header__title">Latest Rotation</h2>
                  <p className="bento-header__sublabel">Synced via Spotify</p>
                </div>
              </div>
              <div className="bento-music-content">
                <NowPlaying />
              </div>
            </motion.div>

            {/* Travel Block */}
            <motion.div 
              className="bento-item bento-travel"
              whileHover={{ y: -5, borderColor: 'rgba(200, 168, 75, 0.5)' }}
              transition={{ duration: 0.3 }}
            >
              {recentTrips.length > 0 && recentTrips[0].display_image && (
                <div 
                  className="bento-travel-bg"
                  style={{ backgroundImage: `url(${recentTrips[0].display_image})` }}
                ></div>
              )}
              <div className="bento-travel-overlay"></div>
              
              <div className="bento-header bento-header--on-dark">
                <div>
                  <h2 className="bento-header__title">Recent Travels</h2>
                  <p className="bento-header__sublabel">Notes from the road</p>
                </div>
              </div>
              
              <div className="bento-travel-content">
                {recentTrips.length > 0 ? (
                  <div className="bento-trip-list">
                    {recentTrips.map(trip => (
                      <Link key={trip.id} to="/travel" className="bento-trip-item">
                        <div className="bento-trip-item__info">
                          <h3 className="bento-trip-item__title">{trip.title}</h3>
                          <p className="bento-trip-item__meta">{trip.location} • {new Date(trip.start_date).getFullYear()}</p>
                        </div>
                        <span className="bento-trip-item__arrow">→</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bento-empty bento-empty--on-dark">
                    Scouting new horizons...
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
