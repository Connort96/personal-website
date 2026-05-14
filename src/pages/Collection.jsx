import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { detectGenre, GENRE_META } from '../lib/genreMap';
import { runSagaScout } from '../lib/sagaScout';
import { processAndUploadCover } from '../lib/imageProcessing';
import Drawer from '../components/Drawer';
import BookDetail from './BookDetail';
import './Collection.css';

// Minimal Circular Progress Component
const ProgressRing = ({ pct, size = 18, stroke = 2, color = 'var(--accent-primary)' }) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="progress-ring-wrapper" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          stroke="rgba(200, 168, 75, 0.05)"
          strokeWidth={stroke}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.8s ease-in-out' }}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      {pct === 100 && (
        <div className="progress-check-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default function Collection() {
  const { user } = useAuth();
  const [libraryData, setLibraryData] = useState([]);
  const [ownedBooks, setOwnedBooks] = useState(new Set());
  const [openGenres, setOpenGenres] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'missing', 'owned'
  const [categorySort, setCategorySort] = useState('alphabetical'); // 'alphabetical' | 'count'
  const [isSyncing, setIsSyncing] = useState(true);
  const isInitialMount = useRef(true);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newBook, setNewBook] = useState({ title: '', author: '', genre_id: '', isbn: '' });
  const [addStatus, setAddStatus] = useState(null); // 'saving', 'success', 'error'
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const isAdmin = user?.email === 'theconison96@gmail.com';

  // Load Catalog and Owned Books
  useEffect(() => {
    async function loadData() {
      setIsSyncing(true);
      try {
        // 1. Fetch ALL books from the master catalog with pagination
        let catalogData = [];
        let from = 0;
        const limit = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from('books')
            .select('*')
            .order('title', { ascending: true })
            .range(from, from + limit - 1);
          
          if (error) throw error;
          catalogData = [...catalogData, ...data];
          if (data.length < limit) break;
          from += limit;
        }

        const collectionsMap = new Map();
        const seenEditions = new Map(); // Key: title|author|isbn or title|author|publisher

        catalogData.forEach(b => {
          // Create a unique key for deduplication
          const isbnKey = b.isbn ? `isbn:${b.isbn}` : `pub:${b.publisher}`;
          const uniqueKey = `${b.title}|${b.author}|${isbnKey}`.toLowerCase();

          if (seenEditions.has(uniqueKey)) {
            const existing = seenEditions.get(uniqueKey);
            existing.ids.add(b.id);
            return;
          }

          const editionEntry = {
            id: b.id,
            ids: new Set([b.id]),
            t: b.title,
            a: b.author,
            publisher: b.publisher,
            pages: b.page_count,
            genre_id: b.genre_id,
            work_id: b.work_id,
            genre_name: b.genre_name,
            imprint: b.imprint_collection,
            color: b.color,
            badge: b.badge,
            badgeLabel: b.badge_label
          };

          seenEditions.set(uniqueKey, editionEntry);

          // Grouping logic: Prioritize imprint_collection, then genre
          const categoryId = b.imprint_collection || b.genre_id;
          const categoryName = b.imprint_collection || b.genre_name;

          if (!collectionsMap.has(categoryId)) {
            collectionsMap.set(categoryId, {
              id: categoryId,
              name: categoryName,
              isImprint: !!b.imprint_collection,
              color: b.color || '#c8a84b',
              badge: b.badge,
              badgeLabel: b.badge_label,
              books: []
            });
          }
          collectionsMap.get(categoryId).books.push(editionEntry);
        });
        
        // 2. Fetch owned editions (to see what is checked)
        let ownedWorkSet = new Set();
        if (user) {
          const { data: userBooks, error: userError } = await supabase
            .from('user_books')
            .select(`
              book_id,
              edition_id,
              editions (work_id)
            `)
            .eq('user_id', user.id);
          
          if (userError) throw userError;
          if (userBooks) {
            userBooks.forEach(row => {
              if (row.editions?.work_id) ownedWorkSet.add(row.editions.work_id);
              if (row.book_id) ownedWorkSet.add(row.book_id);
            });
          }
        }

        // Map owned status to our grouped editions
        const ownedGroupIds = new Set();
        seenEditions.forEach(ed => {
          for (const id of ed.ids) {
            if (ownedWorkSet.has(id)) {
              ownedGroupIds.add(ed.id);
              break;
            }
          }
        });

        // Final sorting of books within each category (A-Z)
        const finalCategories = Array.from(collectionsMap.values()).map(g => ({
          ...g,
          books: g.books.sort((a, b) => a.t.localeCompare(b.t))
        }));

        setLibraryData(finalCategories);
        setOwnedBooks(ownedGroupIds);
      } catch (err) {
        console.error("Error loading collection:", err);
      } finally {
        setIsSyncing(false);
      }
    }
    loadData();
  }, [user]);

  useEffect(() => {
    if (isInitialMount.current) return;
    localStorage.setItem('libraryOwned', JSON.stringify(Array.from(ownedBooks)));
  }, [ownedBooks]);

  useEffect(() => {
    const localGenres = localStorage.getItem('libraryOpenGenres');
    if (localGenres) setOpenGenres(new Set(JSON.parse(localGenres)));
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('libraryOpenGenres', JSON.stringify(Array.from(openGenres)));
  }, [openGenres]);

  const toggleGenre = (genreId) => {
    setOpenGenres(prev => {
      const next = new Set(prev);
      if (next.has(genreId)) next.delete(genreId);
      else next.add(genreId);
      return next;
    });
  };

  const toggleBook = async (id, e) => {
    e.stopPropagation();
    if (!user) return;
    
    const isAdding = !ownedBooks.has(id);

    // Optimistic UI update
    setOwnedBooks(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(id);
      else next.delete(id);
      return next;
    });

    try {
      if (isAdding) {
        // 1. Get the correct Work ID and existing Edition ID
        let editionId;
        let workId;
        let bookTitle = '';
        let bookAuthor = '';

        // Fetch basic info first to ensure we have title/author for the scout
        const { data: legacyRef, error: fetchErr } = await supabase
          .from('books')
          .select('work_id, title, author, publisher, genre_id, genre_name, color, badge, badge_label')
          .eq('id', id)
          .single();
        
        if (fetchErr || !legacyRef) {
          console.error("Critical: Could not find book record for ID", id, fetchErr);
          // Rollback UI
          setOwnedBooks(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }

        bookTitle = legacyRef.title;
        bookAuthor = legacyRef.author;

        if (!bookTitle) {
          console.error("Critical: Book has no title, aborting work creation.");
          return;
        }

        // Prioritize existing work_id from books table
        if (legacyRef?.work_id) {
          workId = legacyRef.work_id;
          // Also try to find an edition for this work
          const { data: edMatch } = await supabase
            .from('editions')
            .select('id')
            .eq('work_id', workId)
            .maybeSingle();
          if (edMatch) editionId = edMatch.id;
        }

        if (!editionId) {
          if (!workId) {
            const { data: workMatch } = await supabase
              .from('works')
              .select('id')
              .ilike('title', bookTitle)
              .ilike('author', bookAuthor)
              .maybeSingle();
            
            if (workMatch) {
              workId = workMatch.id;
            } else {
              const { data: newWork } = await supabase
                .from('works')
                .insert({ title: bookTitle, author: bookAuthor })
                .select().single();
              workId = newWork.id;
            }
          }

          // Create a Generic Edition for this work if one doesn't exist
          const { data: existingGeneric } = await supabase
            .from('editions')
            .select('id')
            .eq('work_id', workId)
            .is('isbn', null)
            .maybeSingle();

          if (existingGeneric) {
            editionId = existingGeneric.id;
          } else {
            const { data: newEd } = await supabase.from('editions').insert({
              work_id: workId,
              publisher: legacyRef?.publisher || 'Unknown Publisher',
              format: 'Hardcover',
              isbn: null, // Explicitly generic
              genre_id: legacyRef?.genre_id,
              genre_name: legacyRef?.genre_name,
              color: legacyRef?.color || '#1a1a1a',
              badge: legacyRef?.badge,
              badge_label: legacyRef?.badge_label
            }).select().single();
            editionId = newEd.id;
          }
          // Update legacy record with the found/created work_id
          await supabase.from('books').update({ work_id: workId }).eq('id', id);
        }

        // 3. AUTO-SAGA & METADATA SCOUT: Precision Discovery
        console.log(`[Checklist Scout] Scanning for "${bookTitle}" metadata...`);
        try {
          const searchRes = await fetch(`https://openlibrary.org/search.json?q=title:${encodeURIComponent('"' + bookTitle + '"')}+author:${encodeURIComponent('"' + bookAuthor + '"')}&limit=1&fields=title,author_name,series_name,series_position,number_of_pages_median,publisher,isbn,first_publish_year,cover_i,subject`);
          const searchData = await searchRes.json();
          const firstDoc = searchData.docs?.[0];

          if (firstDoc) {
            const resultTitle = firstDoc.title.toLowerCase();
            const resultAuthor = (firstDoc.author_name?.[0] || '').toLowerCase();
            const targetTitle = bookTitle.toLowerCase();
            const targetAuthor = bookAuthor.toLowerCase();
            
            const isTitleMatch = resultTitle.includes(targetTitle) || targetTitle.includes(resultTitle);
            const isAuthorMatch = resultAuthor.includes(targetAuthor) || targetAuthor.includes(resultAuthor);

            if (isTitleMatch && isAuthorMatch) {
              if (firstDoc.series_name?.[0]) {
                const seriesName = firstDoc.series_name[0];
                const sequence = parseInt(firstDoc.series_position?.[0] || 1);
                
                let { data: existingS } = await supabase.from('series').select('id').ilike('name', seriesName).maybeSingle();
                let sId;
                if (existingS) sId = existingS.id;
                else {
                  const { data: newS } = await supabase.from('series').insert({ name: seriesName }).select('id').single();
                  sId = newS.id;
                }

                await supabase.from('series_works').upsert({
                  series_id: sId,
                  work_id: workId,
                  sequence_order: sequence
                }, { onConflict: 'series_id, work_id' });

                // Run robust Saga Scout
                try {
                  const { newWorks } = await runSagaScout(supabase, sId, seriesName, sequence, bookAuthor);
                  if (newWorks > 0) {
                    console.log(`[Checklist Scout] Discovered ${newWorks} missing books in ${seriesName} saga!`);
                  }
                } catch (sagaErr) {
                  console.error(`[Checklist Scout] Saga Expansion failed for ${seriesName}`, sagaErr);
                }
              }

              const updates = {};
              if (firstDoc.number_of_pages_median) updates.page_count = firstDoc.number_of_pages_median;
              if (firstDoc.publisher?.[0]) updates.publisher = firstDoc.publisher[0];
              const bestIsbn = firstDoc.isbn?.find(i => i.length === 13) || firstDoc.isbn?.[0];
              if (bestIsbn) updates.isbn = bestIsbn;
              if (firstDoc.first_publish_year) updates.publication_date = `${firstDoc.first_publish_year}-01-01`;
              if (firstDoc.cover_i) {
                const olCover = `https://covers.openlibrary.org/b/id/${firstDoc.cover_i}-L.jpg`;
                updates.cover_image_url = olCover;
                updates.cover_url = olCover;
              }

              // Genre auto-detection from Search API subjects
              const searchSubjects = (firstDoc.subject || []).map(s => ({ name: s }));
              const detected = detectGenre(searchSubjects, []);
              if (detected) {
                const genreMeta = GENRE_META[detected.genre_id];
                if (genreMeta) {
                  updates.genre_id = detected.genre_id;
                  updates.genre_name = genreMeta.genre_name;
                  updates.color = genreMeta.color;
                  
                  // Cascade genre to legacy books table
                  await supabase.from('books')
                    .update({ 
                      genre_id: detected.genre_id, 
                      genre_name: genreMeta.genre_name, 
                      color: genreMeta.color 
                    })
                    .eq('id', id);
                  
                  console.log(`[Checklist Scout] Auto-detected genre: ${genreMeta.genre_name}`);
                }
              }
              
              if (Object.keys(updates).length > 0) {
                await supabase.from('editions').update(updates).eq('id', editionId);
              }
            }
          }
        } catch (sErr) {
          console.error("[Saga Scout] Metadata scout failed:", sErr);
        }

        // 4. AI ENRICHMENT: Fetch vibes, motifs, setting from Gemini
        try {
          console.log(`[Checklist Scout] Running AI Enrichment for "${bookTitle}"...`);
          
          // Fetch existing taxonomy for standardization
          const { data: tagPool } = await supabase.from('works').select('vibes, motifs');
          const existingVibes = [...new Set(tagPool?.flatMap(w => w.vibes || []) || [])].slice(0, 100);
          const existingMotifs = [...new Set(tagPool?.flatMap(w => w.motifs || []) || [])].slice(0, 100);

          const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
            body: { 
              title: bookTitle, 
              author: bookAuthor, 
              provenance_string: null,
              existing_vibes: existingVibes,
              existing_motifs: existingMotifs
            }
          });

          if (!aiError && aiData) {
            const updates = { 
              ai_enriched: true,
              vibes: aiData.vibes || [],
              motifs: aiData.motifs || [],
              setting_era: aiData.setting_era || null,
              setting_location: aiData.setting_location || null,
              synopsis: aiData.synopsis || null
            };

            await supabase.from('works').update(updates).eq('id', workId);
            console.log(`[Checklist Scout] AI Enrichment complete for "${bookTitle}"`);
          }
        } catch (aiErr) {
          console.warn(`[Checklist Scout] AI Enrichment failed (non-blocking):`, aiErr);
        }

        await supabase.from('user_books').upsert({ 
          user_id: user.id, 
          book_id: id,
          edition_id: editionId,
          status: 'unread',
          owned_at: new Date().toISOString()
        }, { onConflict: 'user_id, book_id' });

        setOwnedBooks(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      } else {
        await supabase.from('user_books').delete().match({ user_id: user.id, book_id: id });
        await supabase.from('user_books').delete().match({ user_id: user.id, edition_id: id });
      }
    } catch (err) {
      console.error("Error syncing book:", err);
      if (!isAdding) {
        setOwnedBooks(prev => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    }
  };

  const stats = useMemo(() => {
    let total = 0;
    libraryData.forEach(cat => total += cat.books.length);
    const owned = ownedBooks.size;
    const pct = total === 0 ? 0 : (owned / total) * 100;
    return { total, owned, pct };
  }, [ownedBooks, libraryData]);

  const sortedLibrary = useMemo(() => {
    return [...libraryData].sort((a, b) => {
      if (categorySort === 'alphabetical') {
        return a.name.localeCompare(b.name);
      } else {
        return b.books.length - a.books.length;
      }
    });
  }, [libraryData, categorySort]);
  
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!newBook.title || !newBook.author || !newBook.genre_id) return;
    
    setAddStatus('saving');
    try {
      const genre = libraryData.find(g => g.id === newBook.genre_id);
      
      // 1. Silent Scout: Find or Create Master Work
      let workId = null;
      const { data: existingWork } = await supabase
        .from('works')
        .select('id')
        .ilike('title', newBook.title)
        .ilike('author', newBook.author)
        .maybeSingle();
      
      if (existingWork) {
        workId = existingWork.id;
        console.log(`[Silent Scout] Found existing master record for "${newBook.title}":`, workId);
      } else {
        const { data: newWork } = await supabase
          .from('works')
          .insert({ title: newBook.title, author: newBook.author })
          .select().single();
        workId = newWork.id;
        console.log(`[Silent Scout] Created new master record for "${newBook.title}":`, workId);
      }

      // 2. Create Modern Edition with ISBN
      const { data: newEd } = await supabase.from('editions').insert({
        work_id: workId,
        isbn: newBook.isbn || null,
        genre_id: newBook.genre_id,
        genre_name: genre.name,
        color: genre.color,
        publisher: 'Unknown Publisher'
      }).select().single();

      // 3. Trigger Cover Art Pipeline
      let finalCoverUrl = null;
      if (newBook.isbn) {
        try {
          const olUrl = `https://covers.openlibrary.org/b/isbn/${newBook.isbn}-L.jpg`;
          finalCoverUrl = await processAndUploadCover(olUrl, newBook.isbn);
          if (finalCoverUrl) {
            await supabase.from('editions').update({ cover_image_url: finalCoverUrl }).eq('id', newEd.id);
            await supabase.from('works').update({ cover_image_url: finalCoverUrl }).eq('id', workId);
          }
        } catch (coverErr) {
          console.warn("[Quick Add] Cover upload failed:", coverErr);
        }
      }

      // 4. Create Legacy Book Entry
      const { data: lastBook } = await supabase
        .from('books')
        .select('book_index')
        .eq('genre_id', newBook.genre_id)
        .order('book_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const nextIndex = (lastBook?.book_index || 0) + 1;

      const { data, error } = await supabase.from('books').insert({
        title: newBook.title,
        author: newBook.author,
        work_id: workId,
        genre_id: newBook.genre_id,
        genre_name: genre.name,
        color: genre.color,
        badge: genre.badge,
        badge_label: genre.badgeLabel,
        book_index: nextIndex,
        cover_url: finalCoverUrl,
        isbn: newBook.isbn
      }).select().single();

      if (error) throw error;

      setAddStatus('success');
      setNewBook({ title: '', author: '', genre_id: '', isbn: '' });
      
      // Update local state to show the new book immediately
      setLibraryData(prev => prev.map(g => {
        if (g.id === newBook.genre_id) {
          const newEntry = {
            id: data.id,
            ids: new Set([data.id]),
            t: data.title,
            a: data.author,
            publisher: data.publisher,
            pages: data.page_count,
            genre_id: data.genre_id,
            genre_name: data.genre_name,
            color: data.color,
            badge: data.badge,
            badgeLabel: data.badge_label
          };
          return { ...g, books: [...g.books, newEntry].sort((a,b) => a.t.localeCompare(b.t)) };
        }
        return g;
      }));

      setTimeout(() => {
        setAddStatus(null);
        setIsAddingNew(false);
      }, 2000);

    } catch (err) {
      console.error("Quick add failed:", err);
      setAddStatus('error');
    }
  };

  const handleTitleSearch = async (val) => {
    setNewBook(prev => ({ ...prev, title: val }));
    if (val.length < 3) {
      setSearchSuggestions([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const res = await fetch(`https://openlibrary.org/search.json?q=title:${encodeURIComponent(val)}&limit=5&fields=title,author_name,cover_i,first_publish_year,subject,isbn`);
      const data = await res.json();
      setSearchSuggestions(data.docs || []);
    } catch (err) {
      console.error("Autocomplete failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSuggestion = (s) => {
    // Auto-detect genre from the selected book's subjects
    const subjects = (s.subject || []).map(subj => ({ name: subj }));
    const detected = detectGenre(subjects, []);
    
    setNewBook({
      title: s.title,
      author: s.author_name?.[0] || 'Unknown Author',
      genre_id: detected?.genre_id || newBook.genre_id, // Use detected genre, or keep existing
      isbn: s.isbn ? s.isbn[0] : ''
    });
    setSearchSuggestions([]);
  };

  const lowerSearch = searchQuery.toLowerCase();

  return (
    <div className="collection-page container container--narrow animate-fade-in">
      <div className="collection-header-container">
        <h1 className="collection-title">Collection Checklist</h1>
        
        <div className="collection-header-actions">
          {isAdmin && (
            <button 
              className={`quick-add-minimal-btn ${isAddingNew ? 'active' : ''}`}
              onClick={() => setIsAddingNew(!isAddingNew)}
              title="Add to Checklist"
            >
              <span className="icon">+</span>
            </button>
          )}
          {isSyncing && <div className="collection-sync-badge">Syncing...</div>}
        </div>
      </div>

      <AnimatePresence>
        {isAddingNew && isAdmin && (
          <motion.div 
            className="collection-quick-add-overlay"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <form className="quick-add-form" onSubmit={handleQuickAdd}>
              <div className="form-row">
                <div className="autocomplete-wrapper">
                  <input 
                    type="text" 
                    placeholder="Search titles..."
                    value={newBook.title}
                    onChange={e => handleTitleSearch(e.target.value)}
                    required
                  />
                  {searchSuggestions.length > 0 && (
                    <div className="search-suggestions">
                      {searchSuggestions.map((s, i) => (
                        <div key={i} className="suggestion-item" onClick={() => selectSuggestion(s)}>
                          <div className="suggestion-info">
                            <span className="suggestion-title">{s.title}</span>
                            <span className="suggestion-author">{s.author_name?.[0]}</span>
                          </div>
                          {s.first_publish_year && <span className="suggestion-year">{s.first_publish_year}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input 
                  type="text" 
                  placeholder="Author"
                  value={newBook.author}
                  onChange={e => setNewBook(prev => ({ ...prev, author: e.target.value }))}
                  required
                />
                <select 
                  value={newBook.genre_id}
                  onChange={e => setNewBook(prev => ({ ...prev, genre_id: e.target.value }))}
                  required
                >
                  <option value="">Genre...</option>
                  {libraryData.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={addStatus === 'saving'}>
                  {addStatus === 'saving' ? 'Archiving...' : addStatus === 'success' ? 'Added!' : 'Add to Checklist'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="collection-stats">
        <div className="collection-stat-box">
          <div className="collection-stat-val">{stats.owned}</div>
          <div className="collection-stat-label">Owned</div>
        </div>
        <div className="collection-stat-box">
          <div className="collection-stat-val">{stats.total}</div>
          <div className="collection-stat-label">Total</div>
        </div>
        <div className="collection-stat-box collection-stat-box--pct">
          <div className="collection-stat-flex">
            <div className="collection-stat-val">{stats.pct.toFixed(1)}%</div>
            <ProgressRing pct={stats.pct} size={22} stroke={2.5} />
          </div>
          <div className="collection-stat-label">Complete</div>
        </div>
      </div>

      <div className="collection-controls-sticky">
        <input 
          type="search" 
          className="collection-search-bar" 
          placeholder="Search the ledger..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <div className="collection-controls-row">
          <div className="collection-filters">
            {['all', 'missing', 'owned'].map(f => (
              <button 
                key={f}
                className={`collection-filter-btn ${activeFilter === f ? 'active' : ''}`} 
                onClick={() => setActiveFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'missing' ? 'Needed' : 'Owned'}
              </button>
            ))}
          </div>

          <div className="collection-sort-controls">
            <button 
              className={`sort-btn ${categorySort === 'alphabetical' ? 'active' : ''}`}
              onClick={() => setCategorySort('alphabetical')}
            >A-Z</button>
            <button 
              className={`sort-btn ${categorySort === 'count' ? 'active' : ''}`}
              onClick={() => setCategorySort('count')}
            >Size</button>
          </div>
        </div>
      </div>

      <div className="collection-library">
        {sortedLibrary.map(category => {
          const visibleBooks = category.books.map((book) => {
            const isOwned = ownedBooks.has(book.id);
            if (searchQuery) {
              const match = book.t.toLowerCase().includes(lowerSearch) || book.a.toLowerCase().includes(lowerSearch);
              if (!match) return null;
            }
            if (activeFilter === 'missing' && isOwned) return null;
            if (activeFilter === 'owned' && !isOwned) return null;
            return { ...book, isOwned };
          }).filter(Boolean)
          .sort((a, b) => {
            if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1;
            return a.t.localeCompare(b.t);
          });

          if (visibleBooks.length === 0) return null;

          const categoryTotal = category.books.length;
          const categoryOwnedCount = category.books.filter(b => ownedBooks.has(b.id)).length;
          const categoryPct = (categoryOwnedCount / categoryTotal) * 100;
          const isOpen = openGenres.has(category.id) || searchQuery.length > 0;

          return (
            <div key={category.id} className={`collection-genre-section ${isOpen ? 'open' : ''} ${category.isImprint ? 'is-imprint' : ''}`}>
              <div className="collection-genre-header" onClick={() => toggleGenre(category.id)}>
                <div className="collection-genre-title-wrapper">
                  <ProgressRing pct={categoryPct} size={28} stroke={3} color={category.color || 'var(--accent-primary)'} />
                  <div className="collection-genre-text-group">
                    <div className="collection-genre-title">{category.name}</div>
                    {category.badgeLabel && <div className={`collection-spine-badge ${category.badge}`}>{category.badgeLabel}</div>}
                  </div>
                </div>
                <div className="collection-genre-stats">
                  <span>{categoryOwnedCount}/{categoryTotal}</span>
                  <span className="collection-chevron">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </div>
              </div>
              
              <AnimatePresence>
                {isOpen && (
                  <motion.div 
                    className="collection-book-list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    {visibleBooks.map(book => (
                      <div 
                        key={book.id} 
                        className={`collection-book-item ${book.isOwned ? 'owned' : 'unowned'}`}
                        onClick={(e) => toggleBook(book.id, e)}
                      >
                        <div className="collection-checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
                          <div 
                            className={`collection-checkbox ${book.isOwned ? 'checked' : ''}`}
                            onClick={(e) => toggleBook(book.id, e)}
                          >
                            {book.isOwned && (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>
                        
                        <div className="collection-book-details">
                          <div className="collection-book-title">{book.t}</div>
                          <div className="collection-book-author">{book.a}</div>
                        </div>

                        <button 
                          className="collection-view-details-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkId(book.work_id || book.id);
                          }}
                          title="View Details"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <Drawer 
        isOpen={!!selectedWorkId} 
        onClose={() => setSelectedWorkId(null)}
        title="Archival Record"
      >
        {selectedWorkId && <BookDetail id={selectedWorkId} />}
      </Drawer>
    </div>
  );
}

