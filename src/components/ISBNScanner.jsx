import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { detectGenre, GENRE_META, getGenreMeta } from '../lib/genreMap';
import './ISBNScanner.css';

const MISSING_COVER_URL = '/missing-cover.svg';
const COOLDOWN_MS = 2000;

const ISBNScanner = ({ isOpen, onClose, onComplete }) => {
  const { user } = useAuth();
  const scannerRef = useRef(null);
  const lastScannedRef = useRef('');
  const cooldownActiveRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  const [sessionQueue, setSessionQueue] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [committing, setCommitting] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [genres, setGenres] = useState([]);
  const [cameraError, setCameraError] = useState('');

  // Load genre list from DB on mount
  useEffect(() => {
    async function loadGenres() {
      const { data } = await supabase.from('books').select('genre_id, genre_name, color').order('genre_name');
      if (data) {
        const seen = new Set();
        setGenres(data.filter(g => { 
          if (seen.has(g.genre_id)) return false; 
          seen.add(g.genre_id); 
          return true; 
        }));
      }
    }
    loadGenres();
  }, []);

  // Toast helper
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // Flash viewport gold on successful scan
  const triggerFlash = useCallback(() => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 600);
  }, []);

  // Fetch book metadata from APIs
  const fetchBookMetadata = useCallback(async (isbn) => {
    try {
      const [olRes, gbRes] = await Promise.all([
        fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
        fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
      ]);

      const olData = await olRes.json();
      const gbData = await gbRes.json();
      
      const olInfo = olData[`ISBN:${isbn}`];
      const gbInfo = gbData.items?.[0]?.volumeInfo;

      if (!olInfo && !gbInfo) {
        // Draft state — API returned nothing
        return {
          title: 'Unknown Book',
          subtitle: '',
          author: 'Unknown Author',
          publisher: 'Unknown Publisher',
          year: 'Unknown',
          full_date: null,
          cover: MISSING_COVER_URL,
          pages: 0,
          isbn: isbn,
          description: '',
          format: 'Hardcover',
          series: null,
          status: 'draft',
          genre_id: null,
          genre_name: null,
          genre_color: null,
          subjects: [],
          categories: [],
        };
      }

      // Prefer Google Books for cover art
      const gbCover = gbInfo?.imageLinks?.extraLarge || gbInfo?.imageLinks?.large || gbInfo?.imageLinks?.medium || gbInfo?.imageLinks?.thumbnail;
      const olCover = olInfo?.cover?.large || olInfo?.cover?.medium || '';
      
      let bestCover = (gbCover || olCover || '').replace('http://', 'https://');

      // SAGA SCOUT: Check for series info
      let seriesInfo = null;
      const searchRes = await fetch(`https://openlibrary.org/search.json?isbn=${isbn}&fields=title,author_name,series,series_name,series_position,cover_i,subject`);
      const searchData = await searchRes.json();
      const firstDoc = searchData.docs?.[0];

      if (firstDoc?.series_name?.[0]) {
        seriesInfo = {
          name: firstDoc.series_name[0],
          sequence: parseInt(firstDoc.series_position?.[0] || firstDoc.title?.match(/Vol\.?\s*(\d+)/i)?.[1] || 1)
        };
      } else if (bookData.title && bookData.author) {
        // Fallback: If ISBN specifically lacked series metadata, search broadly by Title + Author
        try {
          const fallbackRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(bookData.title)}&author=${encodeURIComponent(bookData.author)}&fields=title,series_name,series_position&limit=5`);
          const fallbackData = await fallbackRes.json();
          const docWithSeries = fallbackData.docs?.find(d => d.series_name?.[0]);
          if (docWithSeries) {
            seriesInfo = {
              name: docWithSeries.series_name[0],
              sequence: parseInt(docWithSeries.series_position?.[0] || docWithSeries.title?.match(/Vol\.?\s*(\d+)/i)?.[1] || 1)
            };
          }
        } catch (fbErr) {
          console.warn("[Batch Scanner] Fallback series search failed:", fbErr);
        }
      }

      // TRIPLE-HUNT FALLBACK for covers
      if (!bestCover && firstDoc?.cover_i) {
        bestCover = `https://covers.openlibrary.org/b/id/${firstDoc.cover_i}-L.jpg`;
      }

      // Auto-detect genre from API subjects
      // Combine subjects from BOTH the Books API and the Search API for best coverage
      const olSubjects = olInfo?.subjects || [];
      const searchSubjects = (firstDoc?.subject || []).map(s => typeof s === 'string' ? { name: s } : s);
      const combinedSubjects = [...olSubjects, ...searchSubjects];
      const gbCategories = gbInfo?.categories || [];
      const detectedGenre = detectGenre(combinedSubjects, gbCategories);

      return {
        title: olInfo?.title || gbInfo?.title || searchData?.docs?.[0]?.title || 'Unknown Title',
        subtitle: olInfo?.subtitle || gbInfo?.subtitle || '',
        author: olInfo?.authors?.[0]?.name || gbInfo?.authors?.[0] || searchData?.docs?.[0]?.author_name?.[0] || 'Unknown Author',
        publisher: olInfo?.publishers?.[0]?.name || gbInfo?.publisher || 'Unknown Publisher',
        year: olInfo?.publish_date || gbInfo?.publishedDate || 'Unknown',
        full_date: (olInfo?.publish_date || gbInfo?.publishedDate)?.match(/\d{4}/) 
          ? `${(olInfo?.publish_date || gbInfo?.publishedDate).match(/\d{4}/)[0]}-01-01` 
          : null,
        cover: bestCover || MISSING_COVER_URL,
        pages: olInfo?.number_of_pages || gbInfo?.pageCount || 0,
        isbn: isbn,
        description: olInfo?.description || gbInfo?.description || olInfo?.notes || '',
        format: 'Hardcover',
        series: seriesInfo,
        status: 'identified',
        genre_id: detectedGenre?.genre_id || null,
        genre_name: detectedGenre?.genre_name || null,
        genre_color: detectedGenre?.color || null,
        subjects: olSubjects.map(s => s.name || s),
        categories: gbCategories,
      };
    } catch (err) {
      console.error("[Batch Scanner] Fetch error:", err);
      return {
        title: 'Unknown Book',
        subtitle: '',
        author: 'Unknown Author',
        publisher: 'Unknown Publisher',
        year: 'Unknown',
        full_date: null,
        cover: MISSING_COVER_URL,
        pages: 0,
        isbn: isbn,
        description: '',
        format: 'Hardcover',
        series: null,
        status: 'draft',
        genre_id: null,
        genre_name: null,
        genre_color: null,
        subjects: [],
        categories: [],
      };
    }
  }, []);

  // Handle a successful barcode scan
  const onScanSuccess = useCallback(async (decodedText) => {
    const isbn = decodedText.replace(/[-\s]/g, '');
    if (isbn.length !== 10 && isbn.length !== 13) return;

    // Debounce: ignore if same barcode within cooldown
    if (cooldownActiveRef.current && lastScannedRef.current === isbn) return;
    // Ignore if this ISBN is already in the queue
    if (sessionQueue.some(item => item.isbn === isbn)) {
      showToast(`ISBN ${isbn} already in queue`, 'warning');
      return;
    }

    // Activate cooldown
    lastScannedRef.current = isbn;
    cooldownActiveRef.current = true;
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownActiveRef.current = false;
    }, COOLDOWN_MS);

    // Visual feedback
    triggerFlash();
    showToast(`Scanning ISBN: ${isbn}...`, 'info');

    // Fetch metadata asynchronously
    const bookData = await fetchBookMetadata(isbn);
    
    // Add a unique queue ID
    bookData._queueId = `${isbn}-${Date.now()}`;

    setSessionQueue(prev => [...prev, bookData]);

    if (bookData.status === 'draft') {
      showToast(`ISBN not found — added as draft`, 'warning');
    } else {
      const genreHint = bookData.genre_name ? ` → ${bookData.genre_name}` : '';
      showToast(`${bookData.title}${genreHint}`, 'success');
    }
  }, [sessionQueue, fetchBookMetadata, showToast, triggerFlash]);

  // We need a stable ref for onScanSuccess since html5-qrcode holds the callback
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  // Start/stop camera when modal opens/closes
  useEffect(() => {
    if (!isOpen) return;

    setCameraError('');
    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => onScanSuccessRef.current(decodedText)
    ).catch(err => {
      console.error("Camera start error:", err);
      setCameraError("Could not access camera. Please check permissions.");
    });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(e => console.log("Stop error", e));
      }
      scannerRef.current = null;
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [isOpen]);

  // Remove item from queue
  const removeFromQueue = useCallback((queueId) => {
    setSessionQueue(prev => prev.filter(item => item._queueId !== queueId));
  }, []);

  // Update genre for a specific queue item
  const updateQueueGenre = useCallback((queueId, genreId) => {
    setSessionQueue(prev => prev.map(item => {
      if (item._queueId !== queueId) return item;
      const meta = getGenreMeta(genreId);
      return {
        ...item,
        genre_id: genreId === 'uncategorized' ? null : genreId,
        genre_name: meta?.genre_name || 'Uncategorized',
        genre_color: meta?.color || '#1a1a1a',
      };
    }));
  }, []);

  // ── COMMIT: Write all queued books to Supabase ──
  const handleCommitAll = async () => {
    if (!user || sessionQueue.length === 0) return;
    setCommitting(true);

    try {
      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('admin_user_id')
        .single();
      
      const targetUserId = adminSettings?.admin_user_id || user.id;

      for (const bookData of sessionQueue) {
        try {
        const isDraft = bookData.status === 'draft';
        const genreId = bookData.genre_id || 'modern_post2000'; // Never null — books table requires NOT NULL
        const genreMeta = getGenreMeta(genreId) || { genre_name: 'Modern Fiction (Post-2000)', color: '#4A8A8A' };

        // 0. Prevent Duplicate ISBNs — but still ensure ownership link exists
        if (bookData.isbn) {
          const { data: existingEd } = await supabase
            .from('editions')
            .select('id, work_id')
            .eq('isbn', bookData.isbn.trim())
            .maybeSingle();
          
          if (existingEd) {
            // Edition exists — just ensure the user_books link is there
            const { data: legacyRow } = await supabase
              .from('books')
              .select('id')
              .eq('work_id', existingEd.work_id)
              .limit(1)
              .maybeSingle();
            
            if (legacyRow) {
              await supabase.from('user_books').upsert({
                user_id: targetUserId,
                book_id: legacyRow.id,
                edition_id: existingEd.id,
                status: 'unread',
                owned_at: new Date().toISOString()
              }, { onConflict: 'user_id, book_id' });
            }
            console.log(`[Batch Scanner] ISBN ${bookData.isbn} exists — ensured ownership link`);
            continue;
          }
        }

        // 1. Get or Create Work
        let workId;
        const { data: existingWork } = await supabase
          .from('works')
          .select('id')
          .ilike('title', bookData.title)
          .ilike('author', bookData.author)
          .maybeSingle();

        if (existingWork) {
          workId = existingWork.id;
        } else {
          const { data: newWork } = await supabase
            .from('works')
            .insert({ title: bookData.title, author: bookData.author })
            .select().single();
          workId = newWork.id;
        }

        // 2. Get or Create Edition (Intelligent Merger)
        const { data: genericEd } = await supabase
          .from('editions')
          .select('id')
          .eq('work_id', workId)
          .is('isbn', null)
          .maybeSingle();

        let editionId;
        const editionPayload = {
          work_id: workId,
          isbn: bookData.isbn,
          publisher: bookData.publisher,
          cover_image_url: bookData.cover,
          cover_url: bookData.cover,
          format: bookData.format || 'Hardcover',
          page_count: bookData.pages,
          genre_id: genreId,
          genre_name: genreMeta.genre_name,
          color: genreMeta.color,
          publication_date: bookData.full_date,
          needs_review: isDraft,
        };

        if (genericEd) {
          const { data: updatedEd } = await supabase
            .from('editions')
            .update(editionPayload)
            .eq('id', genericEd.id)
            .select().single();
          editionId = updatedEd.id;
        } else {
          const { data: newEdition } = await supabase
            .from('editions')
            .insert(editionPayload)
            .select().single();
          editionId = newEdition.id;
        }

        // 3. Sync to Legacy 'books' Table
        const { data: genericBook } = await supabase
          .from('books')
          .select('id, book_index')
          .eq('work_id', workId)
          .is('isbn', null)
          .maybeSingle();

        const legacyPayload = {
          title: bookData.title,
          author: bookData.author,
          publisher: bookData.publisher,
          cover_url: bookData.cover,
          isbn: bookData.isbn,
          genre_id: genreId,
          genre_name: genreMeta.genre_name,
          color: genreMeta.color,
          page_count: bookData.pages,
          publication_date: bookData.full_date,
          note: bookData.description || `Scanned via Batch Scanner on ${new Date().toLocaleDateString()}`,
          work_id: workId,
          needs_review: isDraft,
        };

        let legacyBookId;
        if (genericBook) {
          const { data: updatedBook } = await supabase.from('books')
            .update(legacyPayload)
            .eq('id', genericBook.id)
            .select('id').single();
          legacyBookId = updatedBook?.id;
        } else {
          const { data: genreBooks } = await supabase.from('books')
            .select('book_index')
            .eq('genre_name', genreMeta.genre_name)
            .order('book_index', { ascending: false })
            .limit(1);
          const nextIndex = (genreBooks?.[0]?.book_index || 0) + 1;
          
          const { data: insertedBook } = await supabase.from('books').insert({
            ...legacyPayload,
            book_index: nextIndex
          }).select('id').single();
          legacyBookId = insertedBook?.id;
        }

        // 4. Link to User Archive

        const { data: workEds } = await supabase.from('editions').select('id').eq('work_id', workId);
        const wEdIds = (workEds || []).map(e => e.id);
        
        const { data: workReview } = await supabase
          .from('user_books')
          .select('rating, review, status')
          .eq('user_id', targetUserId)
          .in('edition_id', wEdIds)
          .order('review', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (legacyBookId) {
          await supabase.from('user_books').upsert({
            user_id: targetUserId,
            book_id: legacyBookId,
            edition_id: editionId,
            status: workReview?.status || 'unread',
            rating: workReview?.rating || 0,
            review: workReview?.review || '',
            owned_at: new Date().toISOString()
          }, { onConflict: 'user_id, book_id' });
        }

        // 4.5. Checklist Handshake
        await supabase.from('books')
          .update({ work_id: workId })
          .ilike('title', bookData.title)
          .ilike('author', bookData.author);

        // 5. Auto-Saga: Map to series if detected
        if (bookData.series) {
          let { data: existingSeries } = await supabase
            .from('series')
            .select('id')
            .ilike('name', bookData.series.name)
            .maybeSingle();
          
          let sId;
          if (existingSeries) {
            sId = existingSeries.id;
          } else {
            const { data: newS } = await supabase
              .from('series')
              .insert({ name: bookData.series.name, description: `The ${bookData.series.name} series.` })
              .select('id')
              .single();
            sId = newS.id;
          }

          await supabase.from('series_works').upsert({
            series_id: sId,
            work_id: workId,
            sequence_order: bookData.series.sequence
          }, { onConflict: 'series_id, work_id' });

          // NEW: Automated Saga Expansion (Discover missing siblings)
          try {
            console.log(`[Batch Scanner] Auto-Saga Scout for: ${bookData.series.name}`);
            const sagaRes = await fetch(`https://openlibrary.org/search.json?q=series:("${encodeURIComponent(bookData.series.name)}")`);
            const sagaData = await sagaRes.json();
            
            const uniqueVolumes = new Map();
            sagaData.docs?.forEach(doc => {
              if (doc.series_name?.some(n => n.toLowerCase().includes(bookData.series.name.toLowerCase())) && doc.series_position?.[0]) {
                const pos = parseInt(doc.series_position[0]);
                if (pos !== bookData.series.sequence && !uniqueVolumes.has(pos)) {
                  uniqueVolumes.set(pos, {
                    title: doc.title,
                    author: doc.author_name?.[0] || bookData.author
                  });
                }
              }
            });

            if (uniqueVolumes.size > 0) {
              console.log(`[Batch Scanner] Found ${uniqueVolumes.size} missing siblings for ${bookData.series.name}`);
              
              for (const [seq, data] of uniqueVolumes) {
                const { data: existingLink } = await supabase
                  .from('series_works')
                  .select('work_id')
                  .eq('series_id', sId)
                  .eq('sequence_order', seq)
                  .maybeSingle();
                
                if (existingLink) continue;

                let { data: siblingWork } = await supabase
                  .from('works')
                  .select('id')
                  .ilike('title', data.title)
                  .ilike('author', data.author)
                  .maybeSingle();
                
                if (!siblingWork) {
                  const { data: newW } = await supabase
                    .from('works')
                    .insert({ title: data.title, author: data.author })
                    .select('id')
                    .single();
                  siblingWork = newW;
                }

                await supabase.from('series_works').upsert({
                  series_id: sId,
                  work_id: siblingWork.id,
                  sequence_order: seq
                }, { onConflict: 'series_id, work_id' });
              }
              showToast(`Discovered ${uniqueVolumes.size} missing books in ${bookData.series.name} saga!`, 'success');
            }
          } catch (sagaErr) {
            console.error(`[Batch Scanner] Saga Expansion failed for ${bookData.series.name}`, sagaErr);
          }
        }
        } catch (bookErr) {
          console.error(`[Batch Scanner] Error archiving "${bookData.title}":`, bookErr);
          showToast(`Error: ${bookData.title} — ${bookErr.message}`, 'error');
          // Continue with next book instead of aborting the entire batch
        }
      }

      // All done — clear queue and close
      setSessionQueue([]);
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      console.error("[Batch Scanner] Commit error:", err);
      showToast(`Archive error: ${err.message}`, 'error');
    } finally {
      setCommitting(false);
    }
  };

  const handleClose = () => {
    if (sessionQueue.length > 0 && !confirm(`You have ${sessionQueue.length} book(s) in the queue. Close without archiving?`)) {
      return;
    }
    setSessionQueue([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="isbn-scanner-overlay">
      <div className="scanner-container scanner-container--batch">
        {/* Header */}
        <div className="scanner-header">
          <h2>Batch Scanner</h2>
          <div className="scanner-header-meta">
            {sessionQueue.length > 0 && (
              <span className="scanner-queue-count">{sessionQueue.length} queued</span>
            )}
            <button className="scanner-close" onClick={handleClose}>×</button>
          </div>
        </div>

        <div className="scanner-body">
          {/* Camera viewport */}
          <div className={`scanner-viewport ${flashActive ? 'scanner-viewport--flash' : ''}`}>
            <div id="reader" className="scanner-reader"></div>
            
            <div className="scanner-ui-overlay">
              <div className="scanner-target">
                <div className="scanner-laser"></div>
              </div>
              <p className="scanner-hint">
                {sessionQueue.length === 0 
                  ? 'Align barcode within the gold frame' 
                  : `${sessionQueue.length} scanned — keep going`}
              </p>
            </div>

            {cameraError && (
              <div className="scanner-camera-error">
                <p>{cameraError}</p>
              </div>
            )}
          </div>

          {/* Session Queue */}
          {sessionQueue.length > 0 && (
            <div className="scanner-queue">
              <div className="scanner-queue-header">
                <span className="scanner-queue-label">Scan Queue</span>
              </div>
              <div className="scanner-queue-list">
                {sessionQueue.map((item) => (
                  <div 
                    key={item._queueId} 
                    className={`queue-item ${item.status === 'draft' ? 'queue-item--draft' : ''}`}
                  >
                    <div className="queue-item-cover">
                      <img 
                        src={item.cover || MISSING_COVER_URL} 
                        alt={item.title}
                        onError={(e) => { e.target.src = MISSING_COVER_URL; }}
                      />
                    </div>
                    <div className="queue-item-info">
                      <div className="queue-item-title">{item.title}</div>
                      <div className="queue-item-author">{item.author}</div>
                      {item.status === 'draft' && (
                        <span className="queue-item-draft-badge">Draft — Needs Review</span>
                      )}
                      <div className="queue-item-genre-row">
                        <select
                          className="queue-item-genre-select"
                          value={item.genre_id || 'uncategorized'}
                          onChange={(e) => updateQueueGenre(item._queueId, e.target.value)}
                        >
                          <option value="uncategorized">Uncategorized</option>
                          {genres.map(g => (
                            <option key={g.genre_id} value={g.genre_id}>{g.genre_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      className="queue-item-remove"
                      onClick={() => removeFromQueue(item._queueId)}
                      title="Remove from queue"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Commit Bar */}
        {sessionQueue.length > 0 && (
          <div className="scanner-commit-bar">
            <button 
              className="scanner-commit-btn"
              onClick={handleCommitAll}
              disabled={committing}
            >
              {committing ? (
                <>
                  <div className="spinner spinner--small"></div>
                  Archiving...
                </>
              ) : (
                `Archive ${sessionQueue.length} Book${sessionQueue.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        )}

        {/* Committing overlay */}
        {committing && (
          <div className="scanner-committing-overlay">
            <div className="spinner"></div>
            <span>Writing to archive...</span>
            <span className="scanner-commit-progress">
              {sessionQueue.length} volume{sessionQueue.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <div className="scanner-toast-container">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              className={`scanner-toast scanner-toast--${toast.type}`}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              {toast.type === 'success' && '✓ '}
              {toast.type === 'warning' && '⚠ '}
              {toast.type === 'error' && '✕ '}
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ISBNScanner;
