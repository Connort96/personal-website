import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import SlideOverPanel from '../components/SlideOverPanel';
import './BookDetail.css';

const FormatIcon = ({ format }) => {
  const f = format?.toLowerCase() || '';
  if (f.includes('audio')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
};

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isAdmin = user?.email === 'theconison96@gmail.com';

  const loadBookData = async () => {
    setLoading(true);
    try {
      const numericId = parseInt(id);
      
      // 1. Fetch Work Metadata
      const { data: workData, error: workErr } = await supabase
        .from('works')
        .select('*')
        .eq('id', numericId)
        .single();
      if (workErr) throw workErr;

      // 2. Fetch User Archive & Editions for this Work
      const { data: userBooksData, error: ubErr } = await supabase
        .from('user_books')
        .select(`
          *,
          editions (*)
        `)
        .eq('user_id', user.id);
      
      if (ubErr) throw ubErr;

      const ownedEditions = userBooksData
        .filter(ub => ub.editions?.work_id === numericId)
        .map(ub => ({
          ...ub.editions,
          user_book_id: ub.id,
          rating: ub.rating,
          review: ub.review,
          status: ub.status,
          owned_at: ub.owned_at,
          current_page: ub.current_page
        }));

      if (ownedEditions.length === 0) {
        const { data: allEditions } = await supabase.from('editions').select('*').eq('work_id', numericId);
        setWork({ 
          ...workData, 
          editions: allEditions || [], 
          primaryEdition: allEditions?.[0] || {},
          status: 'unread' 
        });
        return;
      }

      const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4 };
      const sortedEditions = [...ownedEditions].sort((a, b) => {
        const aPrio = formatPriority[a.format] || 5;
        const bPrio = formatPriority[b.format] || 5;
        return aPrio - bPrio;
      });

      // Find the "best" review/rating among all owned editions
      const bestReview = ownedEditions.find(e => e.review)?.review || '';
      const bestRating = ownedEditions.find(e => e.rating)?.rating || 0;
      const mainProgress = sortedEditions[0]; 

      setWork({
        ...workData,
        editions: sortedEditions,
        primaryEdition,
        review: bestReview,
        rating: bestRating,
        ownedAt: mainProgress.owned_at,
        currentPage: mainProgress.current_page || 0,
        status: mainProgress.status || 'unread',
        pageCount: primaryEdition?.page_count || 0,
        coverUrl: primaryEdition?.cover_image_url || primaryEdition?.cover_url || ''
      });
    } catch (err) {
      console.error('Error loading book detail:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadBookData();
  }, [id, user]);

  const handleSaveReview = async (workId, updates, globalCoverUrl) => {
    if (!isAdmin) return;
    try {
      // Sync the review/rating across ALL editions of this work
      const editionIds = work.editions.map(ed => ed.id);
      if (editionIds.length > 0) {
        await supabase.from('user_books')
          .update(updates)
          .eq('user_id', user.id)
          .in('edition_id', editionIds);
      }
      
      if (globalCoverUrl !== undefined) {
        await supabase.from('editions').update({ cover_url: globalCoverUrl }).eq('work_id', workId);
      }
      
      await loadBookData();
    } catch (err) {
      console.error('Failed to save review:', err);
    }
  };

  if (loading) return (
    <div className="book-detail-loading">
      <div className="spinner" />
      <p>Opening the volume...</p>
    </div>
  );

  if (error || !work) return (
    <div className="book-detail-error">
      <p>The archives are silent on this work.</p>
      <Link to="/books" className="back-link">Return to Library</Link>
    </div>
  );

  return (
    <div className="book-detail-page">
      <div className="container">
        <div className="book-detail-nav-row">
          <Link to="/books" className="book-detail-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Library
          </Link>

          {isAdmin && (
            <button className="book-detail-edit-btn" onClick={() => setIsEditOpen(true)}>
              Edit Archive
            </button>
          )}
        </div>

        <div className="book-detail-grid">
          <div className="book-detail-art-column">
            <div className="sticky-art-wrapper">
              <motion.div 
                className="book-detail-primary-cover"
                initial={{ opacity: 0, scale: 0.95, rotateY: -10 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                { work.coverUrl ? (
                  <img src={work.coverUrl} alt={work.title} />
                ) : (
                  <div className="cover-placeholder" style={{ backgroundColor: work.primaryEdition?.color || 'var(--bg-tertiary)' }}>
                    <span>{work.title[0]}</span>
                  </div>
                )}
                <div className="cover-shadow" />
              </motion.div>
            </div>
          </div>

          <div className="book-detail-content-column">
            <header className="book-detail-header">
              <h1 className="book-detail-title">{work.title}</h1>
              <p className="book-detail-author">by {work.author}</p>
              
              <div className="book-detail-meta">
                <div className="book-detail-stars">
                  {'★'.repeat(work.rating)}{'☆'.repeat(5 - work.rating)}
                </div>
                {work.ownedAt && (
                  <span className="book-detail-date">
                    Logged on {new Date(work.ownedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </header>

            <div className="book-detail-review-section">
              <div className="book-detail-review-body">
                {work.review ? (
                  work.review.split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))
                ) : (
                  <p className="no-review">No reflection has been logged for this work yet.</p>
                )}
              </div>
            </div>

            <section className="book-detail-holdings">
              <h3 className="holdings-title">Editions in Archive</h3>
              <div className="holdings-grid">
                {work.editions.map((ed, i) => (
                  <div key={ed.id || i} className="holding-card">
                    <div className="holding-art">
                      {(ed.cover_image_url || ed.cover_url) ? (
                        <img src={ed.cover_image_url || ed.cover_url} alt={ed.format} />
                      ) : (
                        <div className="holding-placeholder" style={{ backgroundColor: ed.color || 'var(--bg-tertiary)' }}>
                          {ed.format?.[0]}
                        </div>
                      )}
                    </div>
                    <div className="holding-info">
                      <div className="holding-format-row">
                        <FormatIcon format={ed.format} />
                        <span className="holding-format">{ed.format}</span>
                      </div>
                      <span className="holding-publisher">{ed.publisher || 'Unknown Publisher'}</span>
                      {ed.isbn && <span className="holding-isbn">ISBN: {ed.isbn}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <SlideOverPanel
        book={work}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveReview}
        isAdmin={isAdmin}
      />
    </div>
  );
}
