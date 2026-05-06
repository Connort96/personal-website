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
      // 1. Fetch Work Metadata with Fallbacks
      let workData = null;
      let numericId = parseInt(id);

      const { data: directWork } = await supabase.from('works').select('*').eq('id', numericId).maybeSingle();

      if (directWork) {
        workData = directWork;
      } else {
        // Fallback 1: Check if ID is an Edition ID
        const { data: editionMatch } = await supabase.from('editions').select('work_id').eq('id', numericId).maybeSingle();
        if (editionMatch) {
          const { data: workFromEd } = await supabase.from('works').select('*').eq('id', editionMatch.work_id).maybeSingle();
          workData = workFromEd;
          numericId = workData?.id; // Re-sync to work ID
        } else {
          // Fallback 2: Check if ID is a legacy Book ID
          const { data: legacyBook } = await supabase.from('books').select('title, author').eq('id', numericId).maybeSingle();
          if (legacyBook) {
            const { data: workFromLegacy } = await supabase.from('works').select('*').ilike('title', legacyBook.title).ilike('author', legacyBook.author).maybeSingle();
            workData = workFromLegacy;
            numericId = workData?.id;
          }
        }
      }

      if (!workData) throw new Error('Work not found');

      // 2. Fetch User Archive & Editions for this Work
      // Fallback to admin ID for public viewing
      const viewerId = user?.id || 'd01d61f6-334c-4d90-8bce-4b691eebf514';

      const { data: userBooksData, error: ubErr } = await supabase
        .from('user_books')
        .select(`
          *,
          editions (*)
        `)
        .eq('user_id', viewerId);

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
        const primaryEdition = allEditions?.[0] || {};
        
        setWork({
          ...workData,
          editions: allEditions || [],
          primaryEdition: primaryEdition,
          cover_image_url: workData.cover_image_url || primaryEdition.cover_image_url || primaryEdition.cover_url || '',
          primaryGenre: {
            id: primaryEdition.genre_id || 'modern_post2000',
            name: primaryEdition.genre_name || 'Modern Fiction (Post-2000)'
          },
          status: 'unread'
        });
        // Continue to fetch series info even if not owned
      } else {
        const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4 };
        const sortedEditions = [...ownedEditions].sort((a, b) => {
          const aPrio = formatPriority[a.format] || 5;
          const bPrio = formatPriority[b.format] || 5;
          return aPrio - bPrio;
        });

        const bestReview = ownedEditions.find(e => e.review)?.review || '';
        const bestRating = ownedEditions.find(e => e.rating)?.rating || 0;
        const allGenres = Array.from(new Set(ownedEditions.map(e => e.genre_name).filter(Boolean)));

        const primaryEdition = sortedEditions.find(e => e.cover_url || e.cover_image_url) || sortedEditions[0];
        const mainProgress = sortedEditions[0];
        
        const primaryGenre = {
          id: primaryEdition?.genre_id || 'modern_post2000',
          name: primaryEdition?.genre_name || 'Modern Fiction (Post-2000)'
        };

        setWork({
          ...workData,
          editions: sortedEditions,
          primaryEdition,
          primaryGenre,
          cover_image_url: workData.cover_image_url || primaryEdition?.cover_image_url || primaryEdition?.cover_url || '',
          status: mainProgress?.status || 'unread',
          rating: bestRating,
          review: bestReview,
          genres: allGenres
        });
      }
      const { data: seriesLink } = await supabase
        .from('series_works')
        .select(`
          sequence_order,
          series (
            id,
            name,
            description
          )
        `)
        .eq('work_id', numericId)
        .maybeSingle();

      let sagaInfo = null;
      if (seriesLink && seriesLink.series) {
        // Fetch sibling works in the same series with ownership status
        const { data: siblingWorks } = await supabase
          .from('series_works')
          .select(`
            sequence_order,
            work_id,
            works (
              id,
              title,
              author
            )
          `)
          .eq('series_id', seriesLink.series.id)
          .order('sequence_order', { ascending: true });

        // Check which ones the user owns
        const { data: ownedWorks } = await supabase
          .from('user_books')
          .select('editions!inner(work_id)')
          .eq('user_id', viewerId);
        
        const ownedWorkIds = new Set(ownedWorks?.map(ow => ow.editions?.work_id));

        // Check which ones are on the checklist
        const { data: checklistWorks } = await supabase
          .from('books')
          .select('work_id')
          .not('work_id', 'is', null);
        
        const checklistWorkIds = new Set(checklistWorks?.map(cw => cw.work_id));

        const siblingsWithStatus = siblingWorks.map(sw => ({
          ...sw,
          isOwned: ownedWorkIds.has(sw.work_id),
          isWishlisted: checklistWorkIds.has(sw.work_id)
        }));

        // Find Next/Previous
        const currentIndex = siblingsWithStatus.findIndex(sw => sw.work_id === numericId);
        sagaInfo = {
          ...seriesLink.series,
          sequence: seriesLink.sequence_order,
          siblings: siblingsWithStatus,
          previous: siblingsWithStatus[currentIndex - 1],
          next: siblingsWithStatus[currentIndex + 1]
        };
      }

      setWork({
        ...workData,
        editions: sortedEditions,
        primaryEdition,
        review: bestReview,
        rating: bestRating,
        genres: allGenres,
        ownedAt: mainProgress.owned_at,
        currentPage: mainProgress.current_page || 0,
        status: mainProgress.status || 'unread',
        pageCount: primaryEdition?.page_count || 0,
        coverUrl: primaryEdition?.cover_image_url || primaryEdition?.cover_url || '',
        saga: sagaInfo
      });
    } catch (err) {
      console.error('Error loading book detail:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookData();
  }, [id, user]);

  const handleSaveReview = async (workId, updates, globalCoverUrl, editionUpdates = {}) => {
    if (!isAdmin) return;
    try {
      // 1. Sync global review/rating across ALL editions
      const editionIds = work.editions.map(ed => ed.id);
      if (editionIds.length > 0) {
        await supabase.from('user_books')
          .update(updates)
          .eq('user_id', user.id)
          .in('edition_id', editionIds);
      }

      // 2. Update global cover if provided
      if (globalCoverUrl !== undefined && globalCoverUrl !== null) {
        await supabase.from('editions').update({ cover_image_url: globalCoverUrl }).eq('work_id', workId);
      }

      // 3. Process individual edition updates with legacy mirroring
      for (const [id, edits] of Object.entries(editionUpdates)) {
        const { data: currentEd } = await supabase.from('editions').select('*').eq('id', id).single();
        if (!currentEd) continue;

        // Update the modern 'editions' table
        await supabase.from('editions').update(edits).eq('id', id);

        // Mirror to legacy 'books' table for grid visibility
        const searchIsbn = edits.isbn || currentEd.isbn;
        if (searchIsbn) {
          const legacyUpdates = {
            publisher: edits.publisher || currentEd.publisher,
            cover_url: edits.cover_image_url || edits.cover_url || currentEd.cover_image_url || currentEd.cover_url,
            isbn: edits.isbn || currentEd.isbn,
            page_count: edits.page_count || currentEd.page_count
          };

          await supabase.from('books').update(legacyUpdates).eq('isbn', searchIsbn);
        } else {
          // Fallback to title/author sync if no ISBN
          await supabase.from('books')
            .update({ cover_url: edits.cover_image_url || edits.cover_url })
            .ilike('title', work.title)
            .ilike('author', work.author);
        }
      }

      await loadBookData();
    } catch (err) {
      console.error('Failed to save archive updates:', err);
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
              <path d="M19 12H5M12 19l-7-7 7-7" />
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
                {work.coverUrl ? (
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
              {work.saga && (
                <div className="book-detail-saga-badge">
                  {work.saga.name} • Vol {work.saga.sequence}
                </div>
              )}
              <p className="book-detail-author">by {work.author}</p>

              <div className="book-detail-meta">
                <div className="book-detail-stars">
                  {'★'.repeat(work.rating)}{'☆'.repeat(5 - work.rating)}
                </div>
                {work.genres && work.genres.length > 0 && (
                  <div className="book-detail-genres">
                    {work.genres.map(g => (
                      <span key={g} className="book-detail-genre-tag">{g}</span>
                    ))}
                  </div>
                )}
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
            
            {work.saga && (
              <section className="book-detail-saga-nav">
                <div className="saga-nav-header">
                  <h3 className="saga-nav-title">The Saga: {work.saga.name}</h3>
                  <div className="saga-nav-progress-text">
                    {work.saga.siblings.filter(s => s.isOwned).length} of {work.saga.siblings.length} volumes collected
                  </div>
                </div>

                <div className="saga-roadmap">
                  {work.saga.siblings.map((s, i) => (
                    <div 
                      key={s.work_id} 
                      className={`saga-roadmap-item ${s.work_id === work.id ? 'active' : ''} ${!s.isOwned ? 'missing' : ''}`}
                    >
                      <div className="saga-roadmap-dot-track">
                        <div className="saga-roadmap-dot" />
                        {i < work.saga.siblings.length - 1 && <div className="saga-roadmap-line" />}
                      </div>
                      
                      <div className="saga-roadmap-content">
                        <div className="saga-roadmap-meta">
                          Vol {s.sequence_order} • {!s.isOwned ? 'Missing from Archive' : 'In Collection'}
                        </div>
                        {s.isOwned ? (
                          <Link to={`/book/${s.work_id}`} className="saga-roadmap-title">
                            {s.works.title}
                          </Link>
                        ) : (
                          <div className="saga-roadmap-flex">
                            <div className="saga-roadmap-title saga-roadmap-title--missing">
                              {s.works.title}
                            </div>
                            {s.isWishlisted ? (
                              <span className="saga-wishlisted-badge">✓ Wishlisted</span>
                            ) : isAdmin && (
                              <button 
                                className="saga-add-to-checklist-btn"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log("[Checklist Add] Adding missing volume:", s.works.title);
                                  
                                  try {
                                    const gId = work.primaryGenre?.id || 'modern_post2000';
                                    const gName = work.primaryGenre?.name || 'Modern Fiction (Post-2000)';
                                    
                                    // Calculate next book_index
                                    const { data: maxBook } = await supabase
                                      .from('books')
                                      .select('book_index')
                                      .order('book_index', { ascending: false })
                                      .limit(1)
                                      .maybeSingle(); 
                                    const nextIndex = (maxBook?.book_index || 0) + 1;

                                    const { error: insErr } = await supabase.from('books').insert({
                                      title: s.works.title,
                                      author: s.works.author,
                                      work_id: s.work_id,
                                      genre_id: gId,
                                      genre_name: gName,
                                      color: work.primaryEdition?.color || '#1a1a1a',
                                      badge: work.primaryEdition?.badge || 'badge-black',
                                      badge_label: work.primaryEdition?.badge_label || 'Modern Fiction',
                                      book_index: nextIndex,
                                      note: `Saga volume added from ${work.saga?.name}`
                                    });

                                    if (insErr) {
                                      console.error("Checklist add failed:", insErr);
                                      alert(`Failed to add: ${insErr.message} (${insErr.details || 'No details'})`);
                                      return;
                                    }

                                    // Update local state instantly
                                    setWork(prev => ({
                                      ...prev,
                                      saga: {
                                        ...prev.saga,
                                        siblings: prev.saga.siblings.map(sib => 
                                          sib.work_id === s.work_id ? { ...sib, isWishlisted: true } : sib
                                        )
                                      }
                                    }));

                                    alert(`" ${s.works.title} " added to your Collection Checklist!`);
                                  } catch (err) {
                                    console.error("Checklist add failed:", err);
                                    alert(`Critical error: ${err.message}`);
                                  }
                                }}
                              >
                                + Add to Checklist
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
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
