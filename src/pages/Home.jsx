import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import NowPlaying from '../components/NowPlaying';
import './Home.css';

export default function Home() {
  const [latestPost, setLatestPost] = useState(null);
  const [currentlyReading, setCurrentlyReading] = useState(null);
  const [recentAdditions, setRecentAdditions] = useState([]);
  const [latestTrip, setLatestTrip] = useState(null);
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
          const [
            { data: readingData },
            { data: additionsData },
            { data: latestPostData },
            { data: travelData }
          ] = await Promise.all([
            supabase.from('user_books').select(`
              book_id, status, current_page,
              editions ( cover_url, works ( title, author ) ),
              books ( title, author, cover_url, page_count )
            `).eq('user_id', adminId).eq('status', 'reading').limit(1),
            
            supabase.from('user_books').select(`
              book_id,
              editions ( cover_url, works ( title ) ),
              books ( cover_url, title )
            `).eq('user_id', adminId).order('owned_at', { ascending: false }).limit(10),

            supabase.from('posts').select('title, slug, excerpt, published_at').order('published_at', { ascending: false }).limit(1),
            
            supabase.from('trips').select('title, location, cover_image_url, trip_photos ( url )').order('start_date', { ascending: false }).limit(1)
          ]);

          if (readingData?.[0]) {
            const item = readingData[0];
            const pageCount = item.books?.page_count || 300;
            const progress = item.current_page > 0 ? (item.current_page / pageCount) * 100 : 0;
            setCurrentlyReading({
              id: item.book_id,
              title: item.editions?.works?.title || item.books?.title || 'Unknown Title',
              author: item.editions?.works?.author || item.books?.author || 'Unknown Author',
              cover_url: item.editions?.cover_url || item.books?.cover_url,
              progress: Math.min(100, progress)
            });
          }

          if (additionsData) {
            setRecentAdditions(additionsData.map(item => ({
              id: item.book_id,
              cover_url: item.editions?.cover_url || item.books?.cover_url,
              title: item.editions?.works?.title || item.books?.title
            })));
          }

          if (latestPostData?.[0]) setLatestPost(latestPostData[0]);
          
          if (travelData?.[0]) {
            const trip = travelData[0];
            const cover = trip.cover_image_url || (trip.trip_photos && trip.trip_photos.length > 0 ? trip.trip_photos[0].url : null);
            setLatestTrip({ ...trip, cover_image_url: cover });
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
      <div className="home__noise-overlay"></div>
      
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__content container">
          <motion.div 
            className="hero__text-wrapper"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="hero__text">
              <p className="hero__greeting">The Reading Room</p>
              <h1 className="hero__title">
                <span className="hero__title-line">CONNOR'S LIBRARY</span>
              </h1>
              <p className="hero__subtitle">
                A curated archive of literature, philosophical inquiry, and tracking my progress through the scriptorium.
              </p>
            </div>

            {currentlyReading && (
              <motion.div 
                className="hero-reading-card"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 1, delay: 0.3 }}
              >
                <div className="hero-reading-card__header">
                  <span className="hero-reading-card__badge">CURRENTLY READING</span>
                </div>
                <div className="hero-reading-card__content">
                  {currentlyReading.cover_url ? (
                    <img src={currentlyReading.cover_url} alt={currentlyReading.title} className="hero-reading-card__cover" />
                  ) : (
                    <div className="hero-reading-card__cover-placeholder">{currentlyReading.title?.[0]}</div>
                  )}
                  <div className="hero-reading-card__info">
                    <h3 className="hero-reading-card__title">{currentlyReading.title}</h3>
                    <p className="hero-reading-card__author">{currentlyReading.author}</p>
                    <div className="hero-reading-card__progress-track">
                       <div className="hero-reading-card__progress-fill" style={{ width: `${currentlyReading.progress}%` }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Recent Additions */}
      <section className="shelf-section">
        <div className="container">
          <div className="shelf-header">
            <h2 className="shelf-title">Recent Additions to the Shelf</h2>
            <Link to="/books" className="shelf-link">View Full Grid →</Link>
          </div>
          
          <div className="shelf-row">
            {recentAdditions.map((book, i) => (
              <motion.div 
                key={book.id}
                className="shelf-item"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -10, transition: { duration: 0.2 } }}
              >
                <Link to="/books">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt={book.title} className="shelf-item__cover" />
                  ) : (
                    <div className="shelf-item__placeholder">{book.title?.[0]}</div>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footnotes Grid */}
      <section className="footnotes-section">
        <div className="container">
          <div className="footnotes-header">
            <span className="footnotes-micro-tag">SECONDARY ENTRIES</span>
            <h2 className="footnotes-title">The Footnotes</h2>
          </div>
          
          <div className="footnotes-grid">
            {/* Journal (Editorial Style) */}
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <Link to={latestPost ? `/blog/${latestPost.slug}` : '/blog'} className="footnote-editorial">
                <span className="footnote-editorial__date">
                  {latestPost?.published_at ? new Date(latestPost.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Recently'}
                </span>
                <h3 className="footnote-editorial__title">{latestPost?.title || "Drafting new entries..."}</h3>
                <p className="footnote-editorial__excerpt">
                  {latestPost?.excerpt || "A quiet space for reflections and notes from the scriptorium."}
                </p>
                <span className="footnote-editorial__link">Read Dispatch →</span>
              </Link>
            </motion.div>

            {/* Travel Log (Photographic Style) */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Link to="/travel" className="footnote-travel">
                {latestTrip?.cover_image_url && (
                  <div className="footnote-travel__bg" style={{ backgroundImage: `url(${latestTrip.cover_image_url})` }}></div>
                )}
                <div className="footnote-travel__overlay"></div>
                <div className="footnote-travel__content">
                  <span className="footnote-travel__label">Recent Dispatch</span>
                  <h3 className="footnote-travel__title">{latestTrip?.title || "Scouting new horizons..."}</h3>
                  <p className="footnote-travel__location">{latestTrip?.location || "Unknown Territory"}</p>
                </div>
              </Link>
            </motion.div>

            {/* Spotify Rotation (Widget Style) */}
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="footnote-spotify">
              <div className="footnote-spotify__player">
                <div className="footnote-spotify__header">
                  <div className="footnote-spotify__eq">
                    <span></span><span></span><span></span>
                  </div>
                  <span className="footnote-spotify__label">Latest Rotation</span>
                </div>
                <NowPlaying />
                <div className="footnote-spotify__progress-bar"></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
