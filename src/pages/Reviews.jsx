import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SlideOverPanel from '../components/SlideOverPanel';
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

export default function Reviews() {
  const { user } = useAuth();
  const [allBooks, setAllBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);

  const isAdmin = user?.email === 'theconison96@gmail.com';

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
            editions ( id, cover_url, color, genre_name, works ( title, author ) ),
            books ( id, title, author, cover_url, color, genre_name )
          `)
          .eq('user_id', adminId)
          .not('rating', 'is', null)
          .order('owned_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        const mapped = data.map(row => {
          const edition = row.editions;
          const work = edition?.works;
          const legacy = row.books;

          return {
            id: work?.id || legacy?.id || row.book_id,
            title: work?.title || legacy?.title || '(Unknown)',
            author: work?.author || legacy?.author || '',
            genre: edition?.genre_name || legacy?.genre_name || '',
            coverColor: edition?.color || legacy?.color,
            coverUrl: edition?.cover_url || legacy?.cover_url,
            status: row.status,
            rating: row.rating || 0,
            review: row.review || '',
            notes: row.review || '',
            owned_at: row.owned_at ? new Date(row.owned_at).toLocaleDateString('en-US', { 
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

  const handleSaveReview = async (bookId, updates, globalCoverUrl) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('user_books')
        .update(updates)
        .eq('user_id', user.id)
        .eq('book_id', bookId);
      if (error) throw error;

      setAllBooks(prev => prev.map(b => b.id === bookId
        ? { ...b, ...updates, notes: updates.review || b.notes }
        : b
      ));
    } catch (err) {
      console.error('Failed to save review:', err);
    }
  };

  return (
    <div className="reviews-page">
      <div className="container container--narrow">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">Reading Log</h1>
          <p className="page-header__subtitle">
            A chronological journal of reflections from the archive.
          </p>
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
          <div className="reviews-feed">
            {allBooks.map((book, i) => (
              <motion.div 
                key={book.id} 
                className="journal-entry"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedBook(book)}
              >
                <div className="journal-entry__cover-wrapper">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="journal-entry__cover" />
                  ) : (
                    <div className="journal-entry__cover-placeholder" style={{ backgroundColor: book.coverColor }}>
                      <span>{book.title[0]}</span>
                    </div>
                  )}
                </div>

                <div className="journal-entry__content">
                  <div className="journal-entry__header">
                    <span className="journal-entry__date">Logged on {book.owned_at}</span>
                    <StarRating rating={book.rating} />
                  </div>
                  
                  <h2 className="journal-entry__title">{book.title}</h2>
                  <p className="journal-entry__author">by {book.author}</p>
                  
                  {book.review && (
                    <div className="journal-entry__reflection">
                      {book.review}
                    </div>
                  )}

                  <div className="journal-entry__footer">
                    <span className="journal-entry__tag">{book.genre}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && !error && allBooks.length === 0 && (
          <div className="reviews-empty">
            <p>The ledger is currently blank.</p>
          </div>
        )}
      </div>

      <SlideOverPanel
        book={selectedBook}
        isOpen={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        onSave={handleSaveReview}
        isAdmin={isAdmin}
      />
    </div>
  );
}
