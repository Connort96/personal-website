import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { detectGenre, GENRE_META, getGenreMeta } from '../lib/genreMap';
import { runSagaScout } from '../lib/sagaScout';
import { processAndUploadCover } from '../lib/imageProcessing';
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
  const [provenanceNote, setProvenanceNote] = useState('');

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
    let olInfo = null;
    let gbInfo = null;
    let searchInfo = null;

    console.log(`[Batch Scanner] Initiating deep scan for ISBN: ${isbn}`);

    // Create parallel tasks with individual error handling
    const tasks = [
      // TIER 1: Comprehensive APIs (Best Data Quality)
      (async () => {
        try {
          const res = await fetch(`https://openlibrary.org/search.json?isbn=${isbn}&fields=title,author_name,cover_i,subject,series_name,series_position&limit=1`);
          if (res.ok) {
            const data = await res.json();
            const doc = data.docs?.[0];
            if (doc) {
              console.log(`[Batch Scanner] OL Search API hit for ${isbn}`);
              searchInfo = doc;
            }
          }
        } catch (e) { console.warn("OL Search task failed", e); }
      })(),
      (async () => {
        try {
          const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
          if (res.ok) {
            const data = await res.json();
            olInfo = data[`ISBN:${isbn}`];
            if (olInfo) console.log(`[Batch Scanner] OL Data API hit for ${isbn}`);
          }
        } catch (e) { console.warn("OL Data task failed", e); }
      })(),

      // TIER 2: Supplementary & Direct APIs
      (async () => {
        try {
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
          if (res.ok) {
            const data = await res.json();
            gbInfo = data.items?.[0]?.volumeInfo;
            if (gbInfo) console.log(`[Batch Scanner] Google Books hit for ${isbn}`);
          }
        } catch (e) { console.warn("Google Books task failed", e); }
      })(),
      (async () => {
        try {
          const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
          if (res.ok) {
            const data = await res.json();
            if (data && !searchInfo) {
              console.log(`[Batch Scanner] OL Direct ISBN fallback hit: ${data.title}`);
              // Attempt to resolve author key if needed
              let authors = null;
              if (data.authors?.[0]?.key) {
                try {
                  const authorRes = await fetch(`https://openlibrary.org${data.authors[0].key}.json`);
                  if (authorRes.ok) {
                    const authorData = await authorRes.json();
                    authors = [authorData.name];
                  }
                } catch (e) {}
              }
              searchInfo = {
                title: data.title,
                author_name: authors,
                subject: data.subjects || [],
                series_name: data.series ? [data.series] : null,
                cover_i: data.covers?.[0]
              };
            }
          }
        } catch (e) { }
      })()
    ];

    // Wait for all tasks to settle (with a max timeout for the whole process to keep it snappy)
    const timeoutPromise = new Promise(r => setTimeout(r, 4500));
    await Promise.race([
      Promise.allSettled(tasks),
      timeoutPromise
    ]);

    if (!olInfo && !gbInfo && !searchInfo) {
      console.warn(`[Batch Scanner] No metadata found for ${isbn} across 4 providers`);
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

    // Merge strategy
    const finalTitle = gbInfo?.title || olInfo?.title || searchInfo?.title || 'Unknown Title';
    const finalAuthor = gbInfo?.authors?.[0] || olInfo?.authors?.[0]?.name || (searchInfo?.author_name?.[0] !== 'Unknown Author' ? searchInfo?.author_name?.[0] : null) || 'Unknown Author';
    
    const gbCover = gbInfo?.imageLinks?.extraLarge || gbInfo?.imageLinks?.large || gbInfo?.imageLinks?.medium || gbInfo?.imageLinks?.thumbnail;
    const olCover = olInfo?.cover?.large || olInfo?.cover?.medium || '';
    const searchCover = searchInfo?.cover_i ? `https://covers.openlibrary.org/b/id/${searchInfo.cover_i}-L.jpg` : '';
    
    let bestCover = (gbCover || olCover || searchCover || MISSING_COVER_URL).replace('http://', 'https://');

    // TRIPLE-HUNT FALLBACK for covers (if first doc has better cover)
    if (!bestCover || bestCover === MISSING_COVER_URL) {
      if (searchInfo?.cover_i) {
        bestCover = `https://covers.openlibrary.org/b/id/${searchInfo.cover_i}-L.jpg`;
      }
    }

    // SAGA SCOUT: Check for series info
    let seriesInfo = null;

    if (searchInfo?.series_name?.[0]) {
      seriesInfo = {
        name: searchInfo.series_name[0],
        sequence: parseInt(searchInfo.series_position?.[0] || finalTitle?.match(/Vol\.?\s*(\d+)/i)?.[1] || 1)
      };
    } else if (finalTitle !== 'Unknown Title' && finalAuthor !== 'Unknown Author') {
        // Fallback 1: Broad Title + Author search
        try {
          const fallbackRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(finalTitle)}&author=${encodeURIComponent(finalAuthor)}&fields=title,series_name,series_position&limit=5`);
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

        // Fallback 2: AI Librarian Edge Function (with concurrency stagger)
        if (!seriesInfo) {
          try {
            // Stagger delay: prevent multiple queue items from hammering the API simultaneously
            await new Promise(r => setTimeout(r, 500));
            console.log(`[Batch Scanner] APIs failed. Pinging AI Librarian for: ${finalTitle}`);
            const { data: aiData, error: aiError } = await supabase.functions.invoke('saga-scout', {
              body: { title: finalTitle, author: finalAuthor }
            });
            if (!aiError && aiData?.series_name) {
              console.log(`[Batch Scanner] AI Librarian found series:`, aiData);
              seriesInfo = {
                name: aiData.series_name,
                sequence: parseInt(aiData.sequence || 1)
              };
            }
          } catch (aiErr) {
            // Graceful failure: book still gets added, just without series data
            console.warn("[Batch Scanner] AI Librarian failed (non-blocking):", aiErr);
          }
        }
      }

      // Auto-detect genre from API subjects
      // Combine subjects from BOTH the Books API and the Search API for best coverage
      const olSubjects = olInfo?.subjects || [];
      const searchSubjects = (searchInfo?.subject || []).map(s => typeof s === 'string' ? { name: s } : s);
      const combinedSubjects = [...olSubjects, ...searchSubjects];
      const gbCategories = gbInfo?.categories || [];
      const detectedGenre = detectGenre(finalTitle, combinedSubjects, gbCategories);

      return {
        title: finalTitle,
        subtitle: olInfo?.subtitle || gbInfo?.subtitle || '',
        author: finalAuthor,
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
  const updateQueueItem = useCallback((queueId, updates) => {
    setSessionQueue(prev => prev.map(item => 
      item._queueId === queueId ? { ...item, ...updates } : item
    ));
  }, []);

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

      for (const item of sessionQueue) {
        try {
          const bookData = item;
          const genreId = bookData.genre_id || 'modern_post2000';
          const genreMeta = getGenreMeta(genreId) || { genre_name: 'Modern Fiction (Post-2000)', color: '#4A8A8A' };

          // 1. Resolve Master Work
          let workId;
          const { data: existingWork } = await supabase
            .from('works')
            .select('id')
            .ilike('title', bookData.title.trim())
            .ilike('author', bookData.author.trim())
            .maybeSingle();

          if (existingWork) {
            workId = existingWork.id;
          } else {
            const { data: newWork, error: workErr } = await supabase.from('works').insert({
              title: bookData.title.trim(),
              author: bookData.author.trim()
            }).select().single();
            if (workErr || !newWork) throw new Error(`Work creation failed: ${workErr?.message}`);
            workId = newWork.id;
          }

          // 2. Resolve Edition
          let editionId;
          const { data: existingEd } = await supabase
            .from('editions')
            .select('id')
            .eq('isbn', bookData.isbn?.trim())
            .maybeSingle();

          let finalCoverUrl = bookData.cover;
          if (bookData.cover && bookData.cover !== MISSING_COVER_URL && !bookData.cover.includes('supabase.co')) {
            const uploadedUrl = await processAndUploadCover(bookData.cover, bookData.isbn);
            if (uploadedUrl) finalCoverUrl = uploadedUrl;
          }

          const editionPayload = {
            work_id: workId,
            isbn: bookData.isbn?.trim(),
            cover_image_url: finalCoverUrl,
            cover_url: finalCoverUrl,
            publisher: bookData.publisher || 'Unknown Publisher',
            format: 'Hardcover',
            genre_id: genreId,
            genre_name: genreMeta.genre_name,
            color: genreMeta.color
          };

          if (existingEd) {
            editionId = existingEd.id;
            await supabase.from('editions').update(editionPayload).eq('id', editionId);
          } else {
            const { data: newEd, error: neErr } = await supabase.from('editions').insert(editionPayload).select().single();
            if (neErr || !newEd) throw new Error(`Edition creation failed: ${neErr?.message}`);
            editionId = newEd.id;
          }

          // 3. Resolve Checklist Record (MANDATORY book_id link)
          let { data: legacyRow } = await supabase
            .from('books')
            .select('id')
            .eq('work_id', workId)
            .maybeSingle();

          if (!legacyRow) {
            const { data: genreBooks } = await supabase.from('books')
              .select('book_index')
              .eq('genre_name', genreMeta.genre_name)
              .order('book_index', { ascending: false })
              .limit(1);
            const nextIndex = (genreBooks?.[0]?.book_index || 0) + 1;

            const { data: newBk, error: bkErr } = await supabase.from('books').insert({
              title: bookData.title.trim(),
              author: bookData.author.trim(),
              work_id: workId,
              genre_id: genreId,
              genre_name: genreMeta.genre_name,
              color: genreMeta.color,
              book_index: nextIndex
            }).select('id').single();
            if (bkErr || !newBk) throw new Error(`Checklist record failed: ${bkErr?.message}`);
            legacyRow = newBk;
          }

          // 4. Ownership Link (THE CRITICAL PART)
          const { error: ubErr } = await supabase.from('user_books').upsert({
            user_id: targetUserId,
            book_id: legacyRow.id,
            edition_id: editionId,
            status: 'unread',
            owned_at: new Date().toISOString()
          }, { onConflict: 'user_id, edition_id' });

          if (ubErr) throw new Error(`Ownership link failed: ${ubErr.message}`);

          // 5. AI Enrichment & Provenance
          try {
            // Optional: Delay to avoid rate limits
            await new Promise(r => setTimeout(r, 300));
            
            const { data: tagPool } = await supabase.from('works').select('vibes, motifs');
            const existingVibes = [...new Set(tagPool?.flatMap(w => w.vibes || []) || [])].slice(0, 50);
            const existingMotifs = [...new Set(tagPool?.flatMap(w => w.motifs || []) || [])].slice(0, 50);

            const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
              body: { 
                title: bookData.title, 
                author: bookData.author, 
                provenance_string: provenanceNote || null,
                existing_vibes: existingVibes,
                existing_motifs: existingMotifs
              }
            });

            if (!aiError && aiData) {
              // Update Work with AI insights
              await supabase.from('works').update({
                vibes: aiData.vibes || [],
                motifs: aiData.motifs || [],
                setting_era: aiData.setting_era || null,
                setting_location: aiData.setting_location || null,
                synopsis: aiData.synopsis || bookData.description || null,
                ai_enriched: true
              }).eq('id', workId);

              // Update Edition with Provenance details
              if (aiData.provenance) {
                const prov = aiData.provenance;
                await supabase.from('editions').update({
                  condition: prov.condition || null,
                  defects: prov.defects || [],
                  acquisition_notes: prov.acquisition_source || provenanceNote || null,
                  acquisition_year: prov.acquisition_year || null
                }).eq('id', editionId);
              }
            }
          } catch (aiErr) {
            console.warn(`[Batch Scanner] AI Enrichment failed (non-blocking) for ${bookData.title}:`, aiErr);
          }

        } catch (itemErr) {
          console.error(`[Batch Scanner] Failed item "${item.title}":`, itemErr);
          showToast(`Failed: ${item.title} - ${itemErr.message}`, 'error');
        }
      }

      showToast("Batch Archival Complete!", "success");
      setSessionQueue([]);
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      console.error("[Batch Scanner] Fatal:", err);
      showToast(`Batch archival failed: ${err.message}`, 'error');
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

          {/* Provenance Note */}
          <div className="scanner-provenance">
            <input
              type="text"
              className="scanner-provenance-input"
              placeholder="Quick Provenance Note (Optional) — e.g. 'Strand Bookstore 2022, slightly foxed'"
              value={provenanceNote}
              onChange={(e) => setProvenanceNote(e.target.value)}
            />
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
                      {item.status === 'draft' ? (
                        <div className="queue-item-manual-edit">
                          <input 
                            type="text" 
                            className="queue-item-input"
                            placeholder="Title..."
                            value={item.title === 'Unknown Book' ? '' : item.title}
                            onChange={(e) => updateQueueItem(item._queueId, { title: e.target.value })}
                          />
                          <input 
                            type="text" 
                            className="queue-item-input"
                            placeholder="Author..."
                            value={item.author === 'Unknown Author' ? '' : item.author}
                            onChange={(e) => updateQueueItem(item._queueId, { author: e.target.value })}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="queue-item-title">{item.title}</div>
                          <div className="queue-item-author">{item.author}</div>
                        </>
                      )}
                      
                      {item.status === 'draft' && (
                        <span className="queue-item-draft-badge">Draft — Manual Entry</span>
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
