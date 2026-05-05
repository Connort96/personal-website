import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [isSyncing, setIsSyncing] = useState(true);
  const isInitialMount = useRef(true);

  // Load Catalog and Owned Books
  useEffect(() => {
    async function loadData() {
      setIsSyncing(true);
      try {
        // 1. Fetch all Works & Editions for the catalog
        const { data: worksData, error: worksError } = await supabase
          .from('works')
          .select(`
            *,
            editions (*)
          `)
          .order('title', { ascending: true });
        if (worksError) throw worksError;

        const genresMap = new Map();
        worksData.forEach(w => {
          // Use the first edition's genre info for the checklist grouping
          const primaryEd = w.editions?.[0] || {};
          const gid = primaryEd.genre_id || 'uncategorized';
          
          if (!genresMap.has(gid)) {
            genresMap.set(gid, {
              id: gid,
              name: primaryEd.genre_name || 'Uncategorized',
              color: primaryEd.color || '#1a1a1a',
              badge: primaryEd.badge || 'badge-none',
              badgeLabel: primaryEd.badge_label || 'Other',
              books: []
            });
          }
          
          genresMap.get(gid).books.push({
            id: w.id,
            t: w.title,
            a: w.author,
            editions: w.editions || []
          });
        });
        
        setLibraryData(Array.from(genresMap.values()));

        // 2. Fetch owned editions
        let ownedWorkSet = new Set();
        if (user) {
          const { data: userBooks, error: userError } = await supabase
            .from('user_books')
            .select(`
              edition_id,
              editions (work_id)
            `)
            .eq('user_id', user.id);
          
          if (userError) throw userError;
          if (userBooks) {
            userBooks.forEach(row => {
              if (row.editions?.work_id) ownedWorkSet.add(row.editions.work_id);
            });
          }
        }
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

  const toggleBook = async (workId, e) => {
    e.stopPropagation();
    if (!user) return;
    
    const isAdding = !ownedBooks.has(workId);
    const work = libraryData.flatMap(g => g.books).find(b => b.id === workId);
    if (!work) return;

    // Pick the first edition to link to user_books
    const editionId = work.editions?.[0]?.id;
    if (!editionId) {
      console.error("No edition found for this work to add to archive.");
      return;
    }

    setOwnedBooks(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(workId);
      else next.delete(workId);
      return next;
    });

    try {
      if (isAdding) {
        await supabase.from('user_books').insert({ 
          user_id: user.id, 
          edition_id: editionId,
          status: 'unread',
          owned_at: new Date().toISOString()
        });
      } else {
        // Find the user_book record for this work and delete it
        const { data: ubData } = await supabase
          .from('user_books')
          .select('id, editions!inner(work_id)')
          .eq('user_id', user.id)
          .eq('editions.work_id', workId);
        
        if (ubData && ubData.length > 0) {
          await supabase.from('user_books').delete().eq('id', ubData[0].id);
        }
      }
    } catch (err) {
      console.error("Error syncing book:", err);
      setOwnedBooks(prev => {
        const next = new Set(prev);
        if (isAdding) next.delete(workId);
        else next.add(workId);
        return next;
      });
    }
  };

  const stats = useMemo(() => {
    let total = 0;
    libraryData.forEach(genre => total += genre.books.length);
    const owned = ownedBooks.size;
    // Show 1 decimal place (e.g. 0.5%)
    const pct = total === 0 ? 0 : (owned / total) * 100;
    return { total, owned, pct: pct.toFixed(2) };
  }, [ownedBooks, libraryData]);

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
      </div>

      <div className="collection-library">
        {libraryData.map(genre => {
          const visibleBooks = genre.books.map((book) => {
            const isOwned = ownedBooks.has(book.id);
            if (searchQuery) {
              const match = book.t.toLowerCase().includes(lowerSearch) || book.a.toLowerCase().includes(lowerSearch);
              if (!match) return null;
            }
            if (activeFilter === 'missing' && isOwned) return null;
            if (activeFilter === 'owned' && !isOwned) return null;
            return { ...book, isOwned };
          }).filter(Boolean);

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
                      <div className="collection-book-title">{book.t}</div>
                      <div className="collection-book-author">{book.a}</div>
                      {(book.year || book.pages || book.isbn) && (
                        <div className="collection-book-meta">
                          {book.year && <span>{book.year}</span>}
                          {book.pages && <span>{book.pages} pp</span>}
                          {book.isbn && <span>{book.isbn}</span>}
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
