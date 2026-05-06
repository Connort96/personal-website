import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Collection.css';

// Minimal Circular Progress Component
const ProgressRing = ({ pct, size = 18, stroke = 2 }) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        stroke="rgba(200, 168, 75, 0.1)"
        strokeWidth={stroke}
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        stroke="var(--accent-primary)"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.5s ease' }}
        strokeLinecap="round"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
    </svg>
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
  const [newBook, setNewBook] = useState({ title: '', author: '', genre_id: '' });
  const [addStatus, setAddStatus] = useState(null); // 'saving', 'success', 'error'
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
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

        const genresMap = new Map();
        const seenEditions = new Map(); // Key: title|author|isbn or title|author|publisher

        catalogData.forEach(b => {
          // Create a unique key for deduplication
          const isbnKey = b.isbn ? `isbn:${b.isbn}` : `pub:${b.publisher}`;
          const uniqueKey = `${b.title}|${b.author}|${isbnKey}`.toLowerCase();

          if (seenEditions.has(uniqueKey)) {
            // Already have this edition, but we might need to track multiple IDs for 'owned' check
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
            color: b.color,
            badge: b.badge,
            badgeLabel: b.badge_label
          };

          seenEditions.set(uniqueKey, editionEntry);

          if (!genresMap.has(b.genre_id)) {
            genresMap.set(b.genre_id, {
              id: b.genre_id,
              name: b.genre_name,
              color: b.color,
              badge: b.badge,
              badgeLabel: b.badge_label,
              books: []
            });
          }
          genresMap.get(b.genre_id).books.push(editionEntry);
        });
        
        setLibraryData(Array.from(genresMap.values()));

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
              // Important: Also track the legacy book_id for the checklist mapping
              if (row.book_id) ownedWorkSet.add(row.book_id);
            });
          }
        }

        // Map owned status to our grouped editions
        const ownedGroupIds = new Set();
        seenEditions.forEach(ed => {
          // If ANY of the IDs in this group are owned, the whole group is checked
          for (const id of ed.ids) {
            if (ownedWorkSet.has(id)) {
              ownedGroupIds.add(ed.id);
              break;
            }
          }
        });

        // Final sorting of books within each genre (A-Z)
        const finalGenres = Array.from(genresMap.values()).map(g => ({
          ...g,
          books: g.books.sort((a, b) => a.t.localeCompare(b.t))
        }));

        setLibraryData(finalGenres);
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
          const searchRes = await fetch(`https://openlibrary.org/search.json?q=title:${encodeURIComponent('"' + bookTitle + '"')}+author:${encodeURIComponent('"' + bookAuthor + '"')}&limit=1`);
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
              
              if (Object.keys(updates).length > 0) {
                await supabase.from('editions').update(updates).eq('id', editionId);
              }
            }
          }
        } catch (sErr) {
          console.error("[Saga Scout] Metadata scout failed:", sErr);
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
    libraryData.forEach(genre => total += genre.books.length);
    const owned = ownedBooks.size;
    const pct = total === 0 ? 0 : (owned / total) * 100;
    return { total, owned, pct: pct.toFixed(2) };
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
      
      // Silent Scout: Try to find an existing work for this title/author
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
      }

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
        work_id: workId, // Linked immediately if found
        genre_id: newBook.genre_id,
        genre_name: genre.name,
        color: genre.color,
        badge: genre.badge,
        badge_label: genre.badgeLabel,
        book_index: nextIndex
      }).select().single();

      if (error) throw error;

      setAddStatus('success');
      setNewBook({ title: '', author: '', genre_id: '' });
      
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
      const res = await fetch(`https://openlibrary.org/search.json?q=title:${encodeURIComponent(val)}&limit=5&fields=title,author_name,cover_i,first_publish_year`);
      const data = await res.json();
      setSearchSuggestions(data.docs || []);
    } catch (err) {
      console.error("Autocomplete failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSuggestion = (s) => {
    setNewBook({
      title: s.title,
      author: s.author_name?.[0] || 'Unknown Author',
      genre_id: newBook.genre_id // Keep existing genre if selected
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
            <div className="collection-stat-val">{stats.pct}%</div>
            <ProgressRing pct={stats.pct} size={22} stroke={2.5} />
          </div>
          <div className="collection-stat-label">Complete</div>
        </div>
      </div>

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
              {f === 'all' ? 'All Books' : f === 'missing' ? 'Still Needed' : 'Owned'}
            </button>
          ))}
        </div>

        <div className="collection-sort-controls">
          <span className="sort-label">Sort categories:</span>
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

      <div className="collection-library">
        {sortedLibrary.map(genre => {
          const visibleBooks = genre.books.map((book) => {
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

          const genreTotal = genre.books.length;
          const genreOwnedCount = genre.books.filter(b => ownedBooks.has(b.id)).length;
          const genrePct = (genreOwnedCount / genreTotal) * 100;
          const isOpen = openGenres.has(genre.id) || searchQuery.length > 0;

          return (
            <div key={genre.id} className={`collection-genre-section ${isOpen ? 'open' : ''}`}>
              <div className="collection-genre-header" onClick={() => toggleGenre(genre.id)}>
                <div className="collection-genre-title-wrapper">
                  <div className="collection-genre-color-dot" style={{ backgroundColor: genre.color }}></div>
                  <div className="collection-genre-title">{genre.name}</div>
                  <div className={`collection-spine-badge ${genre.badge}`}>{genre.badgeLabel}</div>
                </div>
                <div className="collection-genre-stats">
                  <span>{genreOwnedCount}/{genreTotal}</span>
                  <span className="collection-chevron">▼</span>
                </div>
                {/* Horizontal Progress Bar */}
                <div className="collection-genre-progress">
                  <div className="collection-genre-progress-fill" style={{ width: `${genrePct}%` }}></div>
                </div>
              </div>
              
              <div className="collection-book-list">
                {visibleBooks.map(book => (
                  <div 
                    key={book.id} 
                    className={`collection-book-item ${book.isOwned ? 'owned' : 'unowned'}`}
                    onClick={(e) => toggleBook(book.id, e)}
                  >
                    <div className="collection-checkbox-wrapper">
                      <motion.div 
                        className={`collection-checkbox ${book.isOwned ? 'checked' : ''}`}
                        animate={{ scale: book.isOwned ? [1, 1.2, 1] : 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        {book.isOwned && (
                          <motion.svg viewBox="0 0 24 24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <path fill="none" stroke="currentColor" strokeWidth="3" d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </motion.svg>
                        )}
                      </motion.div>
                    </div>
                    <div className="collection-book-details">
                      <Link to={`/book/${book.work_id || book.id}`} className="collection-book-link" onClick={(e) => e.stopPropagation()}>
                        <div className="collection-book-title">{book.t}</div>
                      </Link>
                      <div className="collection-book-author">{book.a}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
