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
        // 1. Get the correct Work ID and existing Edition ID for this catalog entry
        // We look in 'editions' first because that's our source of truth
        let editionId;
        let workId;

        const { data: edMatch } = await supabase
          .from('editions')
          .select('id, work_id')
          .or(`id.eq.${id},isbn.eq.${id}`)
          .maybeSingle();

        if (edMatch) {
          editionId = edMatch.id;
          workId = edMatch.work_id;
        } else {
          // If no edition found, find the book in the legacy catalog to get its metadata
          const book = libraryData.flatMap(g => g.books).find(b => b.id === id);
          
          // Check if this book title/author already has a Work entry
          const { data: workMatch } = await supabase
            .from('works')
            .select('id')
            .ilike('title', book?.t || '')
            .ilike('author', book?.a || '')
            .maybeSingle();
          
          if (workMatch) {
            workId = workMatch.id;
          } else {
            // Create a new Work if it's truly unique
            const { data: newWork } = await supabase
              .from('works')
              .insert({ title: book?.t, author: book?.a })
              .select().single();
            workId = newWork.id;
          }

          // Create the edition
          const { data: newEd } = await supabase.from('editions').insert({
            work_id: workId,
            publisher: book?.publisher || 'Unknown Publisher',
            format: 'Hardcover'
          }).select().single();
          editionId = newEd.id;
        }

        await supabase.from('user_books').insert({ 
          user_id: user.id, 
          edition_id: editionId,
          book_id: id,
          status: 'unread',
          owned_at: new Date().toISOString()
        });
      } else {
        // Delete from user_books using all possible ID links to be safe
        await supabase.from('user_books')
          .delete()
          .eq('user_id', user.id)
          .or(`book_id.eq.${id},edition_id.eq.${id}`);
      }
    } catch (err) {
      console.error("Error syncing book:", err);
      // Rollback UI
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

  const lowerSearch = searchQuery.toLowerCase();

  return (
    <div className="collection-page container container--narrow animate-fade-in">
      <div className="collection-header-container">
        <h1 className="collection-title">Collection Checklist</h1>
        
        {isSyncing && <div className="collection-sync-badge">Syncing with scriptorium...</div>}
        
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
                      <Link to={`/book/${book.id}`} className="collection-book-link" onClick={(e) => e.stopPropagation()}>
                        <div className="collection-book-title">{book.t}</div>
                      </Link>
                      <div className="collection-book-author">{book.a}</div>
                      {book.editions?.[0] && (
                        <div className="collection-book-meta">
                          {book.editions[0].publisher && <span>{book.editions[0].publisher}</span>}
                          {book.editions[0].page_count && <span>{book.editions[0].page_count} pp</span>}
                        </div>
                      )}
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
