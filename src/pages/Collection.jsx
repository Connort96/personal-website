import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Collection.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Collection() {
  const { user } = useAuth();
  const [libraryData, setLibraryData] = useState([]);
  const [ownedBooks, setOwnedBooks] = useState(new Set());
  const [openGenres, setOpenGenres] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'missing', 'owned'
  const [isSyncing, setIsSyncing] = useState(true);
  const [adminId, setAdminId] = useState(null);
  const isInitialMount = useRef(true);

  // Load Catalog and Owned Books
  useEffect(() => {
    async function loadData() {
      setIsSyncing(true);
      try {
        // 1. Fetch entire catalog (handling the 1,000 row limit via pagination)
        let booksData = [];
        let hasMore = true;
        let fromIndex = 0;
        const pageSize = 1000;
        
        while (hasMore) {
          const { data: pageData, error: catalogError } = await supabase
            .from('books')
            .select('*')
            .order('id', { ascending: true })
            .range(fromIndex, fromIndex + pageSize - 1);
            
          if (catalogError) throw catalogError;
          
          booksData = [...booksData, ...pageData];
          
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            fromIndex += pageSize;
          }
        }

        // Get Shared Admin ID
        const { data: adminSettings } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
        const aId = adminSettings?.admin_user_id;
        setAdminId(aId);

        // 2. Group into genres
        const genresMap = new Map();
        const stringToIdMap = {}; // For local storage migration

        booksData.forEach(b => {
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
          genresMap.get(b.genre_id).books.push({
            id: b.id,
            t: b.title,
            a: b.author,
            n: b.note,
            year: b.publication_date ? new Date(b.publication_date).getFullYear() : null,
            pages: b.page_count || null,
            isbn: b.isbn || null,
          });
          
          stringToIdMap[`${b.genre_id}_${b.book_index}`] = b.id;
        });
        
        const dynamicLibraryData = Array.from(genresMap.values());
        setLibraryData(dynamicLibraryData);

        // 3. Load owned books (Supabase or LocalStorage)
        let ownedSet = new Set();
        
        if (user) {
          // Authorized users always fetch the shared admin's books
          const isAuth = user.email === 'theconison96@gmail.com' || user.email === 'your-second-email@example.com';
          const fetchId = isAuth ? aId : user.id;

          const { data: userBooks, error: userError } = await supabase
            .from('user_books')
            .select('book_id')
            .eq('user_id', fetchId);
            
          if (userError) throw userError;
          
          if (userBooks && userBooks.length > 0) {
            userBooks.forEach(row => ownedSet.add(row.book_id));
          } else {
            // Migration: User just logged in but has no cloud data. Try local storage.
            const localOwned = localStorage.getItem('libraryOwned');
            if (localOwned) {
              const parsedLocal = JSON.parse(localOwned);
              parsedLocal.forEach(item => {
                if (typeof item === 'string' && stringToIdMap[item]) {
                  ownedSet.add(stringToIdMap[item]);
                } else if (typeof item === 'number') {
                  ownedSet.add(item);
                }
              });
            }
          }
        } else {
          // Unauthenticated: Load from local storage
          const localOwned = localStorage.getItem('libraryOwned');
          if (localOwned) {
            const parsedLocal = JSON.parse(localOwned);
            parsedLocal.forEach(item => {
              // Convert legacy string format to integer ID
              if (typeof item === 'string' && stringToIdMap[item]) {
                ownedSet.add(stringToIdMap[item]);
              } else if (typeof item === 'number') {
                ownedSet.add(item);
              }
            });
          }
        }
        
        setOwnedBooks(ownedSet);
        
      } catch (err) {
        console.error("Error loading collection:", err);
      } finally {
        setIsSyncing(false);
      }
    }
    loadData();
  }, [user]);

  // Persist ownedBooks to localStorage (for unauthenticated users and migration)
  useEffect(() => {
    if (isInitialMount.current) return;
    localStorage.setItem('libraryOwned', JSON.stringify(Array.from(ownedBooks)));
  }, [ownedBooks]);

  // UI Local Storage
  useEffect(() => {
    const localGenres = localStorage.getItem('libraryOpenGenres');
    if (localGenres) {
      setOpenGenres(new Set(JSON.parse(localGenres)));
    }
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
      if (next.has(genreId)) {
        next.delete(genreId);
      } else {
        next.add(genreId);
      }
      return next;
    });
  };

  const toggleBook = async (bookId, e) => {
    e.stopPropagation();
    
    // Optimistic UI update (using integer ID)
    const isAdding = !ownedBooks.has(bookId);
    setOwnedBooks(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(bookId);
      else next.delete(bookId);
      return next;
    });

    if (!user) return;

    const isAuth = user.email === 'theconison96@gmail.com' || user.email === 'your-second-email@example.com';
    const targetUserId = isAuth ? adminId : user.id;

    try {
      if (isAdding) {
        await supabase.from('user_books').insert({
          user_id: targetUserId,
          book_id: bookId
        });
      } else {
        await supabase.from('user_books').delete()
          .eq('user_id', targetUserId)
          .eq('book_id', bookId);
      }
    } catch (err) {
      console.error("Error syncing book:", err);
      // Revert optimistic update on error
      setOwnedBooks(prev => {
        const next = new Set(prev);
        if (isAdding) next.delete(bookId);
        else next.add(bookId);
        return next;
      });
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    let total = 0;
    let owned = ownedBooks.size;
    libraryData.forEach(genre => {
      total += genre.books.length;
    });
    return {
      total,
      owned,
      pct: total === 0 ? 0 : Math.round((owned / total) * 100)
    };
  }, [ownedBooks, libraryData]);

  // Render variables
  const lowerSearch = searchQuery.toLowerCase();

  return (
    <div className="collection-page container container--narrow animate-fade-in">
      <div className="collection-header-container">
        <h1 className="collection-title">The <em>Collector's</em> Checklist</h1>
        
        {isSyncing && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>Syncing with cloud...</div>}
        
        <div className="collection-stats">
          <div className="collection-stat-box">
            <div className="collection-stat-val">{stats.owned}</div>
            <div className="collection-stat-label">Owned</div>
          </div>
          <div className="collection-stat-box">
            <div className="collection-stat-val">{stats.total}</div>
            <div className="collection-stat-label">Total</div>
          </div>
          <div className="collection-stat-box">
            <div className="collection-stat-val">{stats.pct}%</div>
            <div className="collection-stat-label">Complete</div>
          </div>
        </div>

        <input 
          type="search" 
          className="collection-search-bar" 
          placeholder="Search titles or authors..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off" 
          autoCorrect="off" 
          spellCheck="false"
        />
        
        <div className="collection-filters">
          <button 
            className={`collection-filter-btn ${activeFilter === 'all' ? 'active' : ''}`} 
            onClick={() => setActiveFilter('all')}
          >
            All Books
          </button>
          <button 
            className={`collection-filter-btn ${activeFilter === 'missing' ? 'active' : ''}`} 
            onClick={() => setActiveFilter('missing')}
          >
            Still Needed
          </button>
          <button 
            className={`collection-filter-btn ${activeFilter === 'owned' ? 'active' : ''}`} 
            onClick={() => setActiveFilter('owned')}
          >
            Owned
          </button>
        </div>
      </div>

      <div className="collection-library">
        {libraryData.map(genre => {
          // Filter books within genre
          const visibleBooks = genre.books.map((book) => {
            const isOwned = ownedBooks.has(book.id);
            
            // Apply search filter
            if (searchQuery) {
              const match = book.t.toLowerCase().includes(lowerSearch) || 
                            book.a.toLowerCase().includes(lowerSearch);
              if (!match) return null;
            }

            // Apply status filter
            if (activeFilter === 'missing' && isOwned) return null;
            if (activeFilter === 'owned' && !isOwned) return null;

            return { ...book, isOwned };
          }).filter(Boolean);

          // If no books match filters in this genre, hide the genre
          if (visibleBooks.length === 0) return null;

          // Genre stats
          const genreTotal = genre.books.length;
          const genreOwnedCount = genre.books.reduce((acc, book) => 
            acc + (ownedBooks.has(book.id) ? 1 : 0), 0
          );

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
              </div>
              
              <div className="collection-book-list">
                {visibleBooks.map(book => (
                  <div 
                    key={book.id} 
                    className={`collection-book-item ${book.isOwned ? 'owned' : ''}`}
                    onClick={(e) => toggleBook(book.id, e)}
                  >
                    <div className="collection-checkbox"></div>
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
                      {book.n && <div className="collection-book-note">{book.n}</div>}
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
