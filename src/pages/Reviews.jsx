import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import ViewToggle from '../components/ViewToggle';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Reviews.css';

const StarRating = ({ rating }) => {
  return (
    <div className="journal-entry__stars">
      {[...Array(5)].map((_, i) => (
        <span key={i} className={i < rating ? "star filled" : "star"}>★</span>
      ))}
    </div>
  );
};

// Helper to group by month/year
function groupEntriesByMonth(entries) {
  const groups = {};
  entries.forEach(entry => {
    const date = entry.raw_owned_at ? new Date(entry.raw_owned_at) : new Date();
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  });
  return Object.entries(groups);
}

export default function Reviews() {
  const { user } = useAuth();
  const [allBooks, setAllBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('reviews-view') || 'list');

  const handleViewChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('reviews-view', mode);
  };

  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const { data: adminSettings } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
        
        const adminId = adminSettings?.admin_user_id;
        if (!adminId) throw new Error('Could not find admin settings.');

        const { data, error: fetchErr } = await supabase
          .from('user_books')
          .select(`
            user_id, book_id, edition_id, status, rating, review, owned_at,
            editions ( 
              id, work_id, cover_url, cover_image_url, color, genre_name, 
              works ( id, title, author ) 
            ),
            books ( id, title, author, cover_url, color, genre_name )
          `)
          .eq('user_id', adminId)
          .not('rating', 'is', null)
          .order('owned_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        // Group by Work ID to avoid duplicates in the feed
        const workGroups = new Map();

        data.forEach(row => {
          const edition = row.editions;
          const work = edition?.works;
          const legacy = row.books;
          const workId = work?.id || legacy?.id || row.book_id;

          if (!workGroups.has(workId)) {
            workGroups.set(workId, {
              id: workId,
              title: work?.title || legacy?.title || '(Unknown)',
              author: work?.author || legacy?.author || '',
              genre: edition?.genre_name || legacy?.genre_name || '',
              rating: 0,
              review: '',
              raw_owned_at: row.owned_at,
              editions: []
            });
          }

          const group = workGroups.get(workId);
          if (row.review && !group.review) group.review = row.review;
          if (row.rating && !group.rating) group.rating = row.rating;
          
          if (edition) {
            group.editions.push(edition);
          } else if (legacy) {
            group.editions.push(legacy);
          }
        });

        const mapped = Array.from(workGroups.values()).map(group => {
          // Choose best cover
          const sorted = [...group.editions].sort((a, b) => {
            const aArt = a.cover_image_url || a.cover_url;
            const bArt = b.cover_image_url || b.cover_url;
            if (!!aArt !== !!bArt) return aArt ? -1 : 1;
            return 0;
          });
          const primary = sorted[0] || {};

          return {
            ...group,
            coverUrl: primary.cover_image_url || primary.cover_url,
            coverColor: primary.color,
            owned_at: group.raw_owned_at ? new Date(group.raw_owned_at).toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            }) : 'Recently',
          };
        });

        setAllBooks(mapped);
      } catch (err) {
        console.error('Error loading reviews:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const groupedBooks = useMemo(() => groupEntriesByMonth(allBooks), [allBooks]);

  return (
    <div className="reviews-page">
      <div className={`container ${viewMode === 'list' ? 'container--narrow' : ''}`}>
        <header className="page-header animate-fade-in-up">
          <div className="page-header__top">
            <div className="page-header__left">
              <h1 className="page-header__title">Reading Log</h1>
              <p className="page-header__subtitle">
                A chronological journal of reflections from the archive.
              </p>
            </div>
            {!loading && allBooks.length > 0 && (
              <div className="page-header__right">
                <ViewToggle view={viewMode} onChange={handleViewChange} />
              </div>
            )}
          </div>
        </header>

        {loading && (
          <div className="reviews-loading">
            <div className="reviews-loading__spinner" />
            <p>Consulting the log...</p>
          </div>
        )}

        {!loading && error && (
          <div className="reviews-empty">
            <p>Could not load the log: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <LayoutGroup>
            <div className={`reviews-feed reviews-feed--${viewMode}`}>
              {groupedBooks.map(([month, books]) => (
                <div key={month} className="reviews-timeline-group">
                  <div className="timeline-header">
                    <span className="timeline-header__label">{month}</span>
                    <div className="timeline-header__line" />
                  </div>
                  
                  <div className={`reviews-grid-inner reviews-grid-inner--${viewMode}`}>
                    <AnimatePresence mode="popLayout">
                      {books.map((book) => (
                        <motion.div 
                          layout
                          key={book.id} 
                          className={`journal-entry journal-entry--${viewMode}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => navigate(`/book/${book.id}`)}
                        >
                          <motion.div layout className="journal-entry__cover-wrapper">
                            {book.coverUrl ? (
                              <img src={book.coverUrl} alt={book.title} className="journal-entry__cover" />
                            ) : (
                              <div className="journal-entry__cover-placeholder" style={{ backgroundColor: book.coverColor }}>
                                <span>{book.title[0]}</span>
                              </div>
                            )}
                          </motion.div>

                          <motion.div layout className="journal-entry__content">
                            <div className="journal-entry__header">
                              <StarRating rating={book.rating} />
                            </div>
                            
                            <h2 className="journal-entry__title">{book.title}</h2>
                            <p className="journal-entry__author">by {book.author}</p>
                            
                            {book.review && (
                              <div className={`journal-entry__reflection ${viewMode === 'grid' ? 'line-clamp-2' : ''}`}>
                                {book.review}
                              </div>
                            )}

                            <div className="journal-entry__footer">
                              <span className="journal-entry__tag">{book.genre}</span>
                            </div>
                          </motion.div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          </LayoutGroup>
        )}

        {!loading && !error && allBooks.length === 0 && (
          <div className="reviews-empty">
            <p>The ledger is currently blank.</p>
          </div>
        )}
      </div>
    </div>
  );
}
