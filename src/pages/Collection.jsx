import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  const [viewMode, setViewMode] = useState('category'); // 'category' | 'imprint'
  const [categorySort, setCategorySort] = useState('alphabetical'); // 'alphabetical' | 'count'
  const [isSyncing, setIsSyncing] = useState(true);
  const isInitialMount = useRef(true);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newBook, setNewBook] = useState({ title: '', author: '', genre_id: '', isbn: '' });
  const [addStatus, setAddStatus] = useState(null); // null, 'saving', 'success', 'error'
  const [fulfillmentData, setFulfillmentData] = useState(null); // { bookId, workId, title, author }
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
            .select('*, works(themes)')
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
            themes: b.works?.themes || [],
            imprint: b.collection_imprint || b.imprint_collection,
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
              editions (
                work_id,
                collection_imprint,
                imprint_collection,
                works!editions_work_id_fkey (themes)
              )
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

        // Final grouping and sorting
        const finalCategories = Array.from(collectionsMap.values());
        setLibraryData(finalCategories);
        setOwnedBooks(ownedWorkSet);
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
    if (!user) {
      console.warn("[Checklist] User not logged in, cannot toggle.");
      return;
    }
    
    const isAdding = !ownedBooks.has(id);
    console.log(`[Checklist] Toggling book ${id}. Action: ${isAdding ? 'Adding' : 'Removing'}`);

    // 1. Optimistic UI update
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
          throw new Error(`Could not find book record for ID ${id}`);
        }

        bookTitle = legacyRef.title;
        bookAuthor = legacyRef.author;

        // Prioritize existing work_id from books table
        if (legacyRef?.work_id) {
          workId = legacyRef.work_id;
          const { data: edMatch } = await supabase
            .from('editions')
            .select('id, isbn')
            .eq('work_id', workId)
            .not('isbn', 'is', null)
            .maybeSingle();
          if (edMatch) editionId = edMatch.id;
        }

        // INTERCEPT: If no physical edition exists (ISBN-less), trigger fulfillment
        if (!editionId) {
          setFulfillmentData({ 
            bookId: id, 
            title: bookTitle, 
            author: bookAuthor, 
            workId: workId,
            legacyRef 
          });
          // Reset optimistic UI for now, we'll re-apply on fulfillment
          setOwnedBooks(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }

        // 3. Sync to user_books
        const { error: upsertError } = await supabase.from('user_books').upsert({ 
          user_id: user.id, 
          book_id: id,
          edition_id: editionId,
          status: 'unread',
          owned_at: new Date().toISOString()
        }, { onConflict: 'user_id, book_id' });

        if (upsertError) throw upsertError;
        console.log(`[Checklist] Successfully added ${bookTitle} to owned shelf.`);

      } else {
        // Removing
        const { error: deleteError } = await supabase
          .from('user_books')
          .delete()
          .match({ user_id: user.id, book_id: id });
        
        if (deleteError) throw deleteError;
        console.log(`[Checklist] Successfully removed book ${id} from owned shelf.`);
      }
    } catch (err) {
      console.error("[Checklist] Sync failed:", err);
      // Rollback UI on error
      setOwnedBooks(prev => {
        const next = new Set(prev);
        if (isAdding) next.delete(id);
        else next.add(id);
        return next;
      });
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
    // 1. Determine groupings based on viewMode
    const groupings = new Map();

    libraryData.forEach(cat => {
      cat.books.forEach(book => {
        let groupId, groupName;
        
        if (viewMode === 'imprint') {
          groupId = book.imprint || 'Standalone';
          groupName = book.imprint || 'Standalone Editions';
        } else {
          // View by Category (Prioritize Themes, then Genre)
          const primaryTheme = book.themes?.[0];
          groupName = primaryTheme || book.genre_name;
          // Use name as ID for merging categories with same name
          groupId = groupName;
        }

        if (!groupings.has(groupId)) {
          groupings.set(groupId, {
            id: groupId,
            name: groupName,
            isImprint: viewMode === 'imprint',
            color: book.color || 'var(--accent-primary)',
            badge: book.badge,
            badgeLabel: book.badgeLabel,
            books: []
          });
        }
        groupings.get(groupId).books.push(book);
      });
    });

    const categories = Array.from(groupings.values());

    return categories.sort((a, b) => {
      if (categorySort === 'alphabetical') {
        return a.name.localeCompare(b.name);
      } else {
        return b.books.length - a.books.length;
      }
    });
  }, [libraryData, categorySort, viewMode]);
  
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!newBook.title) return;

    const targetAuthor = newBook.author || 'Unknown Author';
    const targetGenreId = newBook.genre_id || 'modern_post2000';
    
    setAddStatus('saving');
    try {
      const genre = GENRE_META[targetGenreId];
      
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
        if (g.id === targetGenreId) {
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
    const detected = detectGenre(s.title, subjects, []);
    
    setNewBook({
      title: s.title,
      author: s.author_name?.[0] || 'Unknown Author',
      genre_id: detected?.genre_id || newBook.genre_id, // Use detected genre, or keep existing
      isbn: s.isbn ? s.isbn[0] : ''
    });
    setSearchSuggestions([]);
  };

  const handleFulfill = async (edition) => {
    const { bookId, workId, legacyRef, title, author } = fulfillmentData;
    const isbn = edition.isbn?.[0];
    
    try {
      setAddStatus('saving');
      
      let finalWorkId = workId;
      
      // Deduplication: Ensure we don't create a new work if one exists
      if (!finalWorkId) {
        console.log(`[Fulfillment] No workId provided, checking for existing work: "${title}"`);
        const { data: existingWork } = await supabase
          .from('works')
          .select('id')
          .ilike('title', title)
          .ilike('author', author)
          .maybeSingle();
        
        if (existingWork) {
          finalWorkId = existingWork.id;
          console.log(`[Fulfillment] Found existing work ID: ${finalWorkId}`);
        } else {
          const { data: newWork, error: nwErr } = await supabase.from('works').insert({ 
            title: title, 
            author: author,
            in_collection: true
          }).select().single();
          if (nwErr) throw nwErr;
          finalWorkId = newWork.id;
          console.log(`[Fulfillment] Created new work ID: ${finalWorkId}`);
        }
      } else {
        // Mark existing work as in collection
        await supabase.from('works').update({ in_collection: true }).eq('id', finalWorkId);
      }

      const coverUrl = edition.coverUrl || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      const storageUrl = await processAndUploadCover(coverUrl, isbn);

      const { data: newEd, error: neErr } = await supabase.from('editions').insert({
        work_id: finalWorkId,
        isbn: isbn,
        cover_url: storageUrl,
        cover_image_url: storageUrl,
        publisher: edition.publisher?.[0] || legacyRef?.publisher || 'Unknown Publisher',
        format: 'Hardcover',
        genre_id: legacyRef?.genre_id,
        genre_name: legacyRef?.genre_name,
        color: legacyRef?.color || '#1a1a1a',
        badge: legacyRef?.badge,
        badge_label: legacyRef?.badge_label
      }).select().single();

      if (neErr) throw neErr;

      await supabase.from('books').update({ work_id: finalWorkId }).eq('id', bookId);

      await supabase.from('user_books').upsert({
        user_id: user.id,
        book_id: bookId,
        edition_id: newEd.id,
        status: 'unread',
        owned_at: new Date().toISOString()
      }, { onConflict: 'user_id, edition_id' });

      setOwnedBooks(prev => {
        const next = new Set(prev);
        next.add(bookId);
        return next;
      });

      // 6. AI Enrichment (Background)
      (async () => {
        try {
          const targetTitle = title.trim();
          const targetAuthor = author.trim();

          setAddStatus('enriching'); 
          console.log(`[Fulfillment] Triggering AI Enrichment for "${targetTitle}" (Work ID: ${finalWorkId})`);
          
          // 1. Fetch and Rank Taxonomy (Top 40 Frequency)
          const { data: tagPool } = await supabase.from('works').select('vibes, motifs');
          const vibeCounts = {};
          const motifCounts = {};
          (tagPool || []).forEach(w => {
            (w.vibes || []).forEach(v => vibeCounts[v] = (vibeCounts[v] || 0) + 1);
            (w.motifs || []).forEach(m => motifCounts[m] = (motifCounts[m] || 0) + 1);
          });

          const topVibes = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1]).slice(0, 40).map(e => e[0]);
          const topMotifs = Object.entries(motifCounts).sort((a, b) => b[1] - a[1]).slice(0, 40).map(e => e[0]);

          const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
            body: { 
              title: targetTitle, 
              author: targetAuthor, 
              existing_vibes: topVibes,
              existing_motifs: topMotifs
            }
          });

          if (aiError) throw aiError;
          if (!aiData) throw new Error("No AI data returned");

          console.log(`[Fulfillment] AI metadata synthesized for "${targetTitle}"`);

          // 2. Update Master Work
          await supabase.from('works').update({
            vibes: aiData.vibes || [],
            motifs: aiData.motifs || [],
            setting_era: aiData.setting_era || null,
            setting_location: aiData.setting_location || null,
            synopsis: aiData.synopsis || null,
            ai_enriched: true,
            series_name: aiData.series_name || null
          }).eq('id', finalWorkId);

          // 3. Series Discovery & Saga Scouting
          if (aiData.is_series && aiData.series_name) {
            let { data: series } = await supabase.from('series').select('id').ilike('name', aiData.series_name).maybeSingle();
            let sId = series?.id;
            if (!sId) {
              const { data: newS } = await supabase.from('series').insert({ name: aiData.series_name }).select('id').single();
              sId = newS.id;
            }

            const sequence = parseInt(aiData.series_index || 1);
            await supabase.from('series_works').upsert({
              series_id: sId,
              work_id: finalWorkId,
              sequence_order: sequence
            }, { onConflict: 'series_id, work_id' });

            console.log(`[Fulfillment] Series linked: ${aiData.series_name} (Vol ${sequence})`);
            await runSagaScout(supabase, sId, aiData.series_name, sequence, targetAuthor).catch(e => console.warn(e));
          }
          
          setAddStatus('success');
          setTimeout(() => setAddStatus(null), 2000);
        } catch (bgErr) {
          console.error(`[Fulfillment] Background enrichment failed:`, bgErr.message);
          setAddStatus('success'); // Revert to success so UI doesn't hang
          setTimeout(() => setAddStatus(null), 2000);
        }
      })();

      setFulfillmentData(null);
      setAddStatus('success');
      setTimeout(() => setAddStatus(null), 2000);
    } catch (err) {
      console.error("[Fulfillment] Failed:", err);
      setAddStatus('error');
    }
  };

  const handleDeleteFromChecklist = async (bookId, e) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to remove this book from the checklist?")) return;

    try {
      const { error } = await supabase.from('books').delete().eq('id', bookId);
      if (error) throw error;

      setLibraryData(prev => prev.map(cat => ({
        ...cat,
        books: cat.books.filter(b => b.id !== bookId)
      })));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to remove book: " + err.message);
    }
  };

  const lowerSearch = searchQuery.toLowerCase();

  return (
    <>
      {fulfillmentData && (
        <FulfillmentModal 
          data={fulfillmentData} 
          onFulfill={handleFulfill} 
          onClose={() => setFulfillmentData(null)} 
          isFulfilling={addStatus === 'saving'}
        />
      )}

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
          <div className="collection-quick-add-container">
            <form className="quick-add-form" onSubmit={handleQuickAdd}>
              <div className="autocomplete-wrapper">
                <input 
                  type="text" 
                  className="smart-search-input"
                  placeholder="Enter book title or ISBN to search and add..."
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
              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={addStatus === 'saving'}>
                  {addStatus === 'saving' ? 'Archiving...' : addStatus === 'success' ? 'Added!' : 'Add to Checklist'}
                </button>
              </div>
            </form>
          </div>
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

      <div className="collection-view-toggle-container">
        <div className="segmented-toggle">
          <button 
            className={`toggle-btn ${viewMode === 'category' ? 'active' : ''}`}
            onClick={() => setViewMode('category')}
          >
            View by Category
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'imprint' ? 'active' : ''}`}
            onClick={() => setViewMode('imprint')}
          >
            View by Imprint
          </button>
        </div>
      </div>

      <div className="collection-controls-sticky">
        <input 
          type="text" 
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
            <div 
              key={category.id} 
              className={`collection-genre-section ${isOpen ? 'open' : ''} ${category.isImprint ? 'is-imprint' : ''}`}
              style={{ '--cat-color': category.color || 'var(--accent-primary)' }}
            >
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

                        <div className="collection-item-actions">
                          {isAdmin && (
                            <button 
                              className="collection-delete-btn"
                              onClick={(e) => handleDeleteFromChecklist(book.id, e)}
                              title="Remove from Checklist"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          )}
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
        {selectedWorkId && (
          <BookDetail 
            id={selectedWorkId} 
            onDelete={(deletedId) => {
              setSelectedWorkId(null);
              setLibraryData(prev => prev.map(cat => ({
                ...cat,
                books: cat.books.filter(b => b.work_id !== deletedId && b.id !== deletedId)
              })));
            }} 
          />
        )}
      </Drawer>
    </div>
    </>
  );
}

const FulfillmentModal = ({ data, onFulfill, onClose, isFulfilling }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualIsbn, setManualIsbn] = useState('');
  const [isSearchingIsbn, setIsSearchingIsbn] = useState(false);

  const fetchResults = useCallback(async (queryIsbn = null) => {
    setLoading(true);
    if (queryIsbn) setIsSearchingIsbn(true);
    
    try {
      let url = `https://openlibrary.org/search.json?title=${encodeURIComponent(data.title)}&author=${encodeURIComponent(data.author)}&limit=12&fields=title,isbn,publisher,cover_i`;
      if (queryIsbn) {
        url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(queryIsbn)}&fields=title,isbn,publisher,cover_i`;
      }

      const res = await fetch(url);
      const json = await res.json();
      
      const mapped = (json.docs || []).map(doc => ({
        title: doc.title,
        isbn: doc.isbn && doc.isbn.length > 0 ? [doc.isbn[0]] : null,
        publisher: [doc.publisher?.[0] || 'Unknown Publisher'],
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null
      })).filter(r => r.isbn && r.coverUrl);

      if (queryIsbn && mapped.length > 0) {
        setResults(mapped);
      } else if (!queryIsbn) {
        setResults(mapped.slice(0, 6));
      } else if (queryIsbn && mapped.length === 0) {
        // If ISBN search returns nothing, we still keep the original results or show empty
        setResults([]);
      }
    } catch (err) {
      console.error("Fulfillment search failed:", err);
    } finally {
      setLoading(false);
      setIsSearchingIsbn(false);
    }
  }, [data.title, data.author]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleIsbnSearch = (e) => {
    e.preventDefault();
    if (!manualIsbn || isFulfilling) return;
    const cleanIsbn = manualIsbn.replace(/[-\s]/g, '');
    fetchResults(cleanIsbn);
  };

  return (
    <div className="fulfillment-overlay">
      <div className="fulfillment-modal">
        <div className="fulfillment-modal-header">
          <h3>Archive "{data.title}"</h3>
          <button className="fulfillment-close-top" onClick={onClose} disabled={isFulfilling}>✕</button>
        </div>

        <form className="fulfillment-isbn-search" onSubmit={handleIsbnSearch}>
          <input 
            type="text" 
            placeholder="Search by specific ISBN..." 
            value={manualIsbn}
            onChange={(e) => setManualIsbn(e.target.value)}
            disabled={isFulfilling}
          />
          <button type="submit" disabled={isSearchingIsbn || isFulfilling}>
            {isSearchingIsbn ? 'Searching...' : 'Find'}
          </button>
        </form>

        <p className="fulfillment-subtitle">Or select from discovered editions below</p>
        
        {(loading && !isSearchingIsbn && !isFulfilling) ? (
          <div className="fulfillment-loading">
            <div className="fulfillment-spinner"></div>
            <span>Scouting editions...</span>
          </div>
        ) : (
          <>
            {isFulfilling ? (
              <div className="fulfillment-loading">
                <div className="fulfillment-spinner"></div>
                <span>Archiving to Library...</span>
              </div>
            ) : (
              <div className="fulfillment-grid">
                {results.map((r, i) => (
                  <div 
                    key={i} 
                    className="fulfillment-card" 
                    onClick={() => onFulfill(r)}
                  >
                    <div className="fulfillment-cover-wrapper">
                      <img src={r.coverUrl} alt="Cover" />
                    </div>
                    <div className="fulfillment-card-info">
                      <span className="fulfillment-publisher">{r.publisher[0]}</span>
                      <span className="fulfillment-isbn">{r.isbn[0]}</span>
                    </div>
                  </div>
                ))}
                {results.length === 0 && (
                  <div className="fulfillment-empty">
                    {manualIsbn ? 'No matches found for this ISBN.' : 'No editions found with covers.'}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <button className="fulfillment-cancel" onClick={onClose} disabled={isFulfilling}>Cancel</button>
      </div>
    </div>
  );
};
