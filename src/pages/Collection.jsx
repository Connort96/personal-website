import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Collection.css';
import { libraryData } from '../data/libraryData.js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Collection() {
  const { user } = useAuth();
  const [ownedBooks, setOwnedBooks] = useState(new Set());
  const [openGenres, setOpenGenres] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'missing', 'owned'
  const [isSyncing, setIsSyncing] = useState(true);
  const isInitialMount = useRef(true);

  // Load from Supabase on mount or user change
  useEffect(() => {
    async function loadData() {
      if (!user) {
        setIsSyncing(false);
        return;
      }
      setIsSyncing(true);
      try {
        const { data, error } = await supabase
          .from('user_books')
          .select('book_id');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Construct set of book IDs (genreId_index format matching our UI)
          // To do this we need to fetch the actual books table to map int IDs back to our string IDs
          // Or simpler: change our string IDs to the database IDs.
          // For this implementation, since we seeded books matching the array order sequentially (1 to 1200+)
          // We can map them.
          
          const { data: bookMeta, error: metaError } = await supabase
            .from('books')
            .select('id, genre_id, book_index');
            
          if (metaError) throw metaError;
          
          // Create map of DB ID -> String ID
          const idMap = {};
          bookMeta.forEach(b => {
            idMap[b.id] = `${b.genre_id}_${b.book_index}`;
          });
          
          const ownedSet = new Set();
          data.forEach(row => {
            if (idMap[row.book_id]) {
              ownedSet.add(idMap[row.book_id]);
            }
          });
          
          setOwnedBooks(ownedSet);
        } else {
          // Migration from localStorage if Supabase is empty
          const localOwned = localStorage.getItem('libraryOwned');
          if (localOwned) {
            const parsedLocal = JSON.parse(localOwned);
            if (parsedLocal.length > 0) {
              setOwnedBooks(new Set(parsedLocal));
              // TODO: Sync up to Supabase in background
              // Note: This requires mapping string IDs to DB IDs for the INSERT.
              // We'll just load the local state for now.
            }
          }
        }
      } catch (err) {
        console.error("Error loading collection:", err);
      } finally {
        setIsSyncing(false);
      }
    }
    loadData();
  }, [user]);

  // Persist open genres to localStorage (UI state only)
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
    
    // Optimistic UI update
    const isAdding = !ownedBooks.has(bookId);
    setOwnedBooks(prev => {
      const next = new Set(prev);
      if (isAdding) next.add(bookId);
      else next.delete(bookId);
      return next;
    });

    if (!user) return; // shouldn't happen due to ProtectedRoute

    try {
      // Find the integer DB ID for this book. bookId is formatted as `${genre_id}_${index}`
      const lastUnderscore = bookId.lastIndexOf('_');
      const genreId = bookId.substring(0, lastUnderscore);
      const bookIndex = parseInt(bookId.substring(lastUnderscore + 1));
      
      const { data: dbBook } = await supabase
        .from('books')
        .select('id')
        .eq('genre_id', genreId)
        .eq('book_index', bookIndex)
        .single();

      if (!dbBook) throw new Error("Book not found in database");

      if (isAdding) {
        await supabase.from('user_books').insert({
          user_id: user.id,
          book_id: dbBook.id
        });
      } else {
        await supabase.from('user_books').delete()
          .eq('user_id', user.id)
          .eq('book_id', dbBook.id);
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
  }, [ownedBooks]);

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
          const visibleBooks = genre.books.map((book, index) => {
            const bookId = `${genre.id}_${index}`;
            const isOwned = ownedBooks.has(bookId);
            
            // Apply search filter
            if (searchQuery) {
              const match = book.t.toLowerCase().includes(lowerSearch) || 
                            book.a.toLowerCase().includes(lowerSearch);
              if (!match) return null;
            }

            // Apply status filter
            if (activeFilter === 'missing' && isOwned) return null;
            if (activeFilter === 'owned' && !isOwned) return null;

            return { ...book, bookId, isOwned, originalIndex: index };
          }).filter(Boolean);

          // If no books match filters in this genre, hide the genre
          if (visibleBooks.length === 0) return null;

          // Genre stats
          const genreTotal = genre.books.length;
          const genreOwnedCount = genre.books.reduce((acc, _, index) => 
            acc + (ownedBooks.has(`${genre.id}_${index}`) ? 1 : 0), 0
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
                    key={book.bookId} 
                    className={`collection-book-item ${book.isOwned ? 'owned' : ''}`}
                    onClick={(e) => toggleBook(book.bookId, e)}
                  >
                    <div className="collection-checkbox"></div>
                    <div className="collection-book-details">
                      <div className="collection-book-title">{book.t}</div>
                      <div className="collection-book-author">{book.a}</div>
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
