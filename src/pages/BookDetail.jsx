import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { runSagaScout } from '../lib/sagaScout';
import SlideOverPanel from '../components/SlideOverPanel';
import RelatedWorks from '../components/RelatedWorks';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSyncingSaga, setIsSyncingSaga] = useState(false);
  const [isDetectingAI, setIsDetectingAI] = useState(false);
  const isAdmin = user?.email === 'theconison96@gmail.com';
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadBookData = useCallback(async () => {
    setLoading(true);
    setError(null);

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
      const viewerId = user?.id || 'd01d61f6-334c-4d90-8bce-4b691eebf514';
      const { data: userBooksData, error: ubErr } = await supabase
        .from('user_books')
        .select('*, editions(*)')
        .eq('user_id', viewerId);
      if (ubErr) throw ubErr;

      const ownedEditions = userBooksData
        ?.filter(ub => ub.editions?.work_id === numericId)
        .map(ub => ({
          ...ub.editions,
          owned_at: ub.owned_at,
          current_page: ub.current_page,
          status: ub.status,
          rating: ub.rating,
          review: ub.review
        })) || [];

      let editions = [];
      let primaryEdition = {};
      let bestReview = '';
      let bestRating = 0;
      let allGenres = [];
      let mainProgress = { status: 'unread', current_page: 0 };

      if (ownedEditions.length > 0) {
        const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4 };
        editions = [...ownedEditions].sort((a, b) => (formatPriority[a.format] || 5) - (formatPriority[b.format] || 5));
        primaryEdition = editions.find(e => e.cover_url || e.cover_image_url) || editions[0];
        bestReview = ownedEditions.find(e => e.review)?.review || '';
        bestRating = ownedEditions.find(e => e.rating)?.rating || 0;
        allGenres = Array.from(new Set(ownedEditions.map(e => e.genre_name).filter(Boolean)));
        mainProgress = editions[0];
      } else {
        const { data: allEditions } = await supabase.from('editions').select('*').eq('work_id', numericId);
        editions = allEditions || [];
        primaryEdition = editions[0] || {};
      }

      const primaryGenre = {
        id: primaryEdition?.genre_id || 'modern_post2000',
        name: primaryEdition?.genre_name || 'Modern Fiction (Post-2000)'
      };

      // 3. Fetch Series Info (use limit(1) instead of maybeSingle to avoid crash on duplicate mappings)
      const { data: seriesLinks } = await supabase
        .from('series_works')
        .select('sequence_order, series(id, name, description)')
        .eq('work_id', numericId)
        .limit(1);
      const seriesLink = seriesLinks?.[0];
      let sagaInfo = null;

      if (seriesLink?.series) {
        const { data: siblingWorks } = await supabase
          .from('series_works')
          .select('sequence_order, work_id, works(id, title, author, in_collection)')
          .eq('series_id', seriesLink.series.id)
          .order('sequence_order', { ascending: true });

        const { data: ownedWorks } = await supabase
          .from('user_books')
          .select('editions!inner(work_id)')
          .eq('user_id', viewerId);
        
        const ownedWorkIds = new Set(ownedWorks?.map(ow => ow.editions?.work_id));
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

        const currentIndex = siblingsWithStatus.findIndex(sw => sw.work_id === numericId);
        sagaInfo = {
          ...seriesLink.series,
          sequence: seriesLink.sequence_order,
          siblings: siblingsWithStatus,
          previous: siblingsWithStatus[currentIndex - 1],
          next: siblingsWithStatus[currentIndex + 1]
        };
      }

      const coverImage = workData.cover_image_url || primaryEdition?.cover_image_url || primaryEdition?.cover_url || '';
      const needsReview = primaryEdition?.needs_review === true;

      setWork({
        ...workData,
        editions,
        primaryEdition,
        primaryGenre,
        cover_image_url: coverImage,
        coverUrl: coverImage,
        status: mainProgress.status || 'unread',
        currentPage: mainProgress.current_page || 0,
        rating: bestRating,
        review: bestReview,
        genres: allGenres,
        ownedAt: mainProgress.owned_at,
        pageCount: primaryEdition?.page_count || 0,
        saga: sagaInfo,
        needs_review: needsReview,
      });
    } catch (err) {
      console.error('Error loading book detail:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]); // Removed isAdmin to satisfy lint

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBookData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadBookData]);

  useEffect(() => {
    if (work?.needs_review && isAdmin && !isEditOpen) {
      const timer = setTimeout(() => {
        setIsEditOpen(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [work?.needs_review, isAdmin, isEditOpen]);
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
  const handleAIDetection = async () => {
    if (!isAdmin || !work) return;
    try {
      setIsDetectingAI(true);
      // Fetch existing taxonomy for standardization
      const { data: tagPool } = await supabase.from('works').select('vibes, motifs');
      const existingVibes = [...new Set(tagPool?.flatMap(w => w.vibes || []) || [])].slice(0, 100);
      const existingMotifs = [...new Set(tagPool?.flatMap(w => w.motifs || []) || [])].slice(0, 100);
      const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
        body: { 
          title: work.title, 
          author: work.author, 
          provenance_string: null,
          existing_vibes: existingVibes,
          existing_motifs: existingMotifs
        }
      });
      if (aiError) throw aiError;
      if (aiData) {
        // 1. Write literary metadata and synopsis to works
        const updates = { ai_enriched: true };
        if (aiData.vibes?.length) updates.vibes = aiData.vibes;
        if (aiData.motifs?.length) updates.motifs = aiData.motifs;
        if (aiData.setting_era) updates.setting_era = aiData.setting_era;
        if (aiData.setting_location) updates.setting_location = aiData.setting_location;
        if (aiData.synopsis) updates.synopsis = aiData.synopsis;
        await supabase.from('works').update(updates).eq('id', work.id);
        let seriesMsg = '';
        // 2. Link series if found
        if (aiData.is_series && aiData.series_name) {
          let { data: existingSeries } = await supabase
            .from('series')
            .select('id')
            .ilike('name', aiData.series_name)
            .maybeSingle();
          let sId;
          if (existingSeries) {
            sId = existingSeries.id;
          } else {
            const { data: newS } = await supabase.from('series').insert({ name: aiData.series_name }).select('id').single();
            sId = newS.id;
          }
          const sequence = parseInt(aiData.series_index || 1);
          await supabase.from('series_works').upsert({
            series_id: sId,
            work_id: work.id,
            sequence_order: sequence
          }, { onConflict: 'series_id, work_id' });
          seriesMsg = `\nSeries identified: ${aiData.series_name} (Book ${sequence}).`;
          // Auto-run saga scout to find siblings (non-blocking)
          runSagaScout(supabase, sId, aiData.series_name, sequence, work.author).catch(e => console.warn(e));
        }
        alert(`AI Enrichment Complete!${seriesMsg}`);
        await loadBookData();
      } else {
        alert("The AI Librarian returned no data.");
      }
    } catch (err) {
      // Graceful failure: inform the user but don't crash
      console.warn('[BookDetail] AI Detection failed (non-blocking):', err);
      alert("AI Detection was unable to reach the server. The book has not been modified.");
    } finally {
      setIsDetectingAI(false);
    }
  };
  if (error) {
    return (
      <div className="book-detail-error">
        <h2>The archives are silent on this work</h2>
        <p>{error}</p>
        <Link to="/books" className="back-link">Return to the Master Catalog</Link>
      </div>
    );
  }
  if (loading || !work) {
    return (
      <div className="book-detail-loading">
        <div className="loading-spinner"></div>
        <p>Consulting the archives...</p>
      </div>
    );
  }
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
            <div style={{ display: 'flex', gap: '10px' }}>
              {!work.saga && (
                <button 
                  className="book-detail-edit-btn" 
                  onClick={handleAIDetection}
                  disabled={isDetectingAI}
                  style={{ opacity: isDetectingAI ? 0.7 : 1 }}
                >
                  {isDetectingAI ? 'Detecting...' : '✨ AI Series Detect'}
                </button>
              )}
              <button className="book-detail-edit-btn" onClick={() => setIsEditOpen(true)}>
                Edit Archive
              </button>
            </div>
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
                {work.cover_image_url ? (
                  <img src={work.cover_image_url} alt={work.title} />
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
              {work.needs_review && (
                <div className="book-detail-review-banner">
                  <span className="review-banner-icon">⚠</span>
                  This book needs review — metadata may be incomplete.
                </div>
              )}
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
               {work.synopsis && (
                 <div className="book-detail-synopsis">
                   <p className="synopsis-text">{work.synopsis}</p>
                 </div>
               )}
              {(work.ai_enriched || work.primaryEdition?.condition || work.primaryEdition?.acquisition_notes) && (
                <div className="book-detail-archival-meta">
                  <div className={`archival-meta-grid ${!((work.primaryEdition?.condition || (work.primaryEdition?.defects && work.primaryEdition.defects.length > 0) || work.primaryEdition?.acquisition_notes)) ? 'full-width' : ''}`}>
                    <div className="archival-meta-column">
                      {(work.setting_era || work.setting_location) && (
                        <div className="archival-meta-setting-grid">
                          {work.setting_era && (
                            <div className="setting-grid-item">
                              <span className="setting-label">ERA</span>
                              <span className="setting-value">{work.setting_era}</span>
                            </div>
                          )}
                          {work.setting_location && (
                            <div className="setting-grid-item">
                              <span className="setting-label">LOCATION</span>
                              <span className="setting-value">{work.setting_location}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {work.vibes && work.vibes.length > 0 && (
                        <div className="meta-index-row">
                          <span className="meta-label">Vibes:</span>
                          <div className="meta-index-tags">
                            {work.vibes.map((v, i) => (
                              <button 
                                key={v} 
                                className="meta-index-btn"
                                onClick={() => navigate(`/books?vibe=${encodeURIComponent(v)}`)}
                              >
                                {v}{i < work.vibes.length - 1 && <span className="meta-separator">·</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {work.motifs && work.motifs.length > 0 && (
                        <div className="meta-index-row">
                          <span className="meta-label">Themes:</span>
                          <div className="meta-index-tags">
                            {work.motifs.map((m, i) => (
                              <button 
                                key={m} 
                                className="meta-index-btn"
                                onClick={() => navigate(`/books?theme=${encodeURIComponent(m)}`)}
                              >
                                {m}{i < work.motifs.length - 1 && <span className="meta-separator">·</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {(work.primaryEdition?.condition || (work.primaryEdition?.defects && work.primaryEdition.defects.length > 0) || work.primaryEdition?.acquisition_notes) && (
                      <div className="archival-meta-column">
                        {work.primaryEdition?.condition && <p><span className="meta-label">Condition:</span> <span className="meta-value">{work.primaryEdition.condition}</span></p>}
                        {work.primaryEdition?.defects && work.primaryEdition.defects.length > 0 && (
                           <div className="meta-index-row">
                            <span className="meta-label">Defects:</span>
                            <div className="meta-index-tags">
                              {work.primaryEdition.defects.map((d, i) => (
                                <span key={d} className="meta-defect-text">
                                  {d}{i < work.primaryEdition.defects.length - 1 && <span className="meta-separator">,</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(work.primaryEdition?.acquisition_notes || work.primaryEdition?.acquisition_year) && (
                          <p>
                            <span className="meta-label">Acquisition:</span> 
                            <span className="meta-value">
                              {work.primaryEdition?.acquisition_notes} 
                              {work.primaryEdition?.acquisition_year && ` (${work.primaryEdition.acquisition_year})`}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="archival-meta-divider" />
                </div>
              )}
            </div>
            {work.saga && (
              <section className="book-detail-saga-nav">
                <div className="saga-nav-header">
                  <div>
                    <h3 className="saga-nav-title">The Saga: {work.saga.name}</h3>
                    <div className="saga-nav-progress-text">
                      {work.saga.siblings.filter(s => s.isOwned).length} of {work.saga.siblings.length} volumes collected
                    </div>
                  </div>
                  {isAdmin && (
                    <button 
                      className="book-detail-saga-sync-btn"
                      onClick={async () => {
                        try {
                          setIsSyncingSaga(true);
                          const { newWorks } = await runSagaScout(supabase, work.saga.id, work.saga.name, work.saga.sequence, work.author);
                          if (newWorks > 0) {
                            alert(`Found ${newWorks} missing volumes!`);
                            loadBookData(); // Reload to show them
                          } else {
                            alert("No new missing volumes found.");
                          }
                        } catch (err) {
                          alert("Failed to sync saga: " + err.message);
                        } finally {
                          setIsSyncingSaga(false);
                        }
                      }}
                      disabled={isSyncingSaga}
                    >
                      {isSyncingSaga ? '🔄 Scouting...' : '✨ Sync Missing Volumes'}
                    </button>
                  )}
                </div>
                <div className="saga-roadmap">
                  {work.saga.siblings.map((s, i) => (
                    <div 
                      key={s.work_id} 
                      className={`saga-roadmap-item ${s.work_id === work.id ? 'active' : ''} ${!s.isOwned ? 'missing' : ''} ${s.works?.in_collection === false ? 'ghost' : ''}`}
                    >
                      <div className="saga-roadmap-dot-track">
                        <div className="saga-roadmap-dot" />
                        {i < work.saga.siblings.length - 1 && <div className="saga-roadmap-line" />}
                      </div>
                      <div className="saga-roadmap-content">
                        <div className="saga-roadmap-meta">
                          Vol {s.sequence_order} • {s.works?.in_collection === false ? 'Ghost Entry (Missing)' : (!s.isOwned ? 'Uncollected' : 'In Collection')}
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
            
            <RelatedWorks 
              currentBookId={work.id} 
              themes={work.motifs || []} 
              vibes={work.vibes || []} 
              author={work.author}
              seriesName={work.saga?.name}
            />
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
