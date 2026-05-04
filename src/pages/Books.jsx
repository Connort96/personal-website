import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CollectionCard from '../components/CollectionCard';
import SlideOverPanel from '../components/SlideOverPanel';
import LibraryHero from '../components/LibraryHero';
import ViewToggle from '../components/ViewToggle';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Books.css';

const STATUS_LABELS = {
  all: 'All',
  unread: 'Unread',
  reading: 'Currently Reading',
  read: 'Read',
};

const STATUS_EMOJIS = {
  unread: '📚',
  reading: '📖',
  read: '✓',
};

// Group "Read" books by the year they were added/finished
function groupByYear(books) {
  const groups = {};
  for (const book of books) {
    const year = book.owned_at
      ? new Date(book.owned_at).getFullYear().toString()
      : 'Unknown';
    if (!groups[year]) groups[year] = [];
    groups[year].push(book);
  }
  // Sort years descending
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function Books() {
  const { user } = useAuth();
  const [allBooks, setAllBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('library-view') || 'grid');
  const [selectedBook, setSelectedBook] = useState(null);

  const isAdmin = user?.email === 'theconison96@gmail.com';

  // Persist view mode preference
  const handleViewChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('library-view', mode);
  };

  // ─── Data Loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        // Get admin UUID
        const { data: adminSettings, error: adminErr } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
        if (adminErr || !adminSettings) throw new Error('Could not find admin settings.');
        // Always show the master admin collection
        const adminId = adminSettings.admin_user_id;

        // Fetch user_books joined with editions → works, paginated
        let allRows = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error: fetchErr } = await supabase
            .from('user_books')
            .select(`
              user_id,
              book_id,
              edition_id,
              status,
              rating,
              review,
              current_page,
              owned_at,
              editions (
                id,
                work_id,
                cover_url,
                genre_id,
                genre_name,
                color,
                publisher,
                page_count,
                isbn,
                publication_date,
                translator,
                works (
                  id,
                  title,
                  author
                )
              ),
              books (
                id,
                title,
                author,
                genre_name,
                color,
                cover_url,
                publisher,
                page_count,
                isbn,
                publication_date,
                translator
              )
            `)
            .eq('user_id', adminId)
            .range(from, from + pageSize - 1);

          if (fetchErr) throw fetchErr;
          allRows = [...allRows, ...data];
          if (data.length < pageSize) break;
          from += pageSize;
        }

        // Map rows — prefer editions/works data, fall back to legacy books table
        const mapped = allRows.map(row => {
          const edition = row.editions;
          const work = edition?.works;
          const legacy = row.books;

          return {
            id: work?.id || legacy?.id || row.book_id,
            bookId: row.book_id,
            editionId: row.edition_id || row.book_id,
            title: work?.title || legacy?.title || '(Unknown)',
            author: work?.author || legacy?.author || '',
            genre: edition?.genre_name || legacy?.genre_name || '',
            coverColor: edition?.color || legacy?.color,
            coverUrl: edition?.cover_url || legacy?.cover_url,
            status: row.status || 'unread',
            rating: row.rating || 0,
            review: row.review || '',
            notes: row.review || '',
            currentPage: row.current_page || 0,
            owned_at: row.owned_at ? new Date(row.owned_at).getTime() : 0,
            user_id: row.user_id,
            editions: edition ? [edition] : [],
            // New metadata fields
            publisher: edition?.publisher || legacy?.publisher || null,
            pageCount: edition?.page_count || legacy?.page_count || null,
            isbn: edition?.isbn || legacy?.isbn || null,
            publicationDate: edition?.publication_date || legacy?.publication_date || null,
            translator: edition?.translator || legacy?.translator || null,
          };
        });

        // Group by work: if multiple editions of same work, merge
        const workMap = new Map();
        for (const book of mapped) {
          if (workMap.has(book.id)) {
            const existing = workMap.get(book.id);
            existing.editions = [...(existing.editions || []), ...(book.editions || [])];
          } else {
            workMap.set(book.id, { ...book });
          }
        }

        setAllBooks(Array.from(workMap.values()));
      } catch (err) {
        console.error('Error loading library:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  // ─── Save review (any authorized admin can edit their own entry) ──────────────────
  const handleSaveReview = async (bookId, updates, globalCoverUrl) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('user_books')
        .update(updates)
        .eq('user_id', user.id)
        .eq('book_id', bookId);
      if (error) throw error;

      if (globalCoverUrl !== undefined) {
        // Update editions table first, fall back to books
        await supabase.from('editions').update({ cover_url: globalCoverUrl }).eq('work_id', bookId);
        await supabase.from('books').update({ cover_url: globalCoverUrl }).eq('id', bookId);
      }

      setAllBooks(prev => prev.map(b => b.id === bookId
        ? { ...b, ...updates, notes: updates.review || b.notes, coverUrl: globalCoverUrl !== undefined ? globalCoverUrl : b.coverUrl }
        : b
      ));
    } catch (err) {
      console.error('Failed to save review:', err);
      alert('Failed to save. Please try again.');
    }
  };

  // ─── Derived state ─────────────────────────────────────────────────────────
  const currentlyReading = allBooks.find(b => b.status === 'reading');

  const sortFn = (a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return (b.owned_at || 0) - (a.owned_at || 0); // recent
  };

  const tabBooks = useMemo(() => {
    const base = activeTab === 'all' ? allBooks : allBooks.filter(b => b.status === activeTab);
    return [...base].sort(sortFn);
  }, [allBooks, activeTab, sortBy]);

  const counts = {
    all: allBooks.length,
    unread: allBooks.filter(b => b.status === 'unread').length,
    reading: allBooks.filter(b => b.status === 'reading').length,
    read: allBooks.filter(b => b.status === 'read').length,
  };

  // For Read tab — group by year
  const readGroups = useMemo(() => {
    if (activeTab !== 'read') return null;
    return groupByYear(tabBooks);
  }, [tabBooks, activeTab]);

  // ─── Render helpers ─────────────────────────────────────────────────────────
  const renderCard = (book, i) => (
    <CollectionCard
      key={book.id}
      title={book.title}
      subtitle={book.author}
      genre={book.genre}
      coverColor={book.coverColor}
      coverUrl={book.coverUrl}
      notes={book.notes}
      rating={book.rating}
      status={book.status}
      editionCount={book.editions?.length || 1}
      viewMode={viewMode}
      index={i}
      onClick={() => setSelectedBook(book)}
    />
  );

  return (
    <div className="books-page">
      <div className="container">
        {/* Page Header */}
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">My Library</h1>
          <p className="page-header__subtitle">
            {allBooks.length > 0
              ? `${allBooks.length} books collected.${isAdmin ? ' Click any book to edit.' : ''}`
              : 'Books I have collected and tracked.'}
          </p>
        </header>

        {/* Currently Reading Hero */}
        {!loading && currentlyReading && (
          <LibraryHero
            book={currentlyReading}
            isAdmin={isAdmin}
            onClick={() => setSelectedBook(currentlyReading)}
          />
        )}

        {/* Toolbar */}
        {!loading && allBooks.length > 0 && (
          <div className="books-toolbar animate-fade-in-up animate-stagger-2">
            {/* Status tabs */}
            <div className="books-tabs">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={`books-tab ${activeTab === key ? 'books-tab--active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {STATUS_EMOJIS[key] && <span className="books-tab__emoji">{STATUS_EMOJIS[key]}</span>}
                  {label}
                  <span className="books-tab__count">{counts[key]}</span>
                </button>
              ))}
            </div>

            {/* Right controls */}
            <div className="books-controls">
              <div className="books-sort">
                <label htmlFor="sort-select">Sort:</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="books-sort-select"
                >
                  <option value="recent">Recently Added</option>
                  <option value="rating">Highest Rated</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>
              <ViewToggle view={viewMode} onChange={handleViewChange} />
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="books-loading">
            <div className="books-loading__spinner" />
            <p>Loading library…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="books-empty">
            <p>Could not load library: {error}</p>
          </div>
        )}

        {/* Books — Read tab: grouped by year */}
        {!loading && !error && readGroups && (
          <div className={`books-list ${viewMode === 'list' ? 'books-list--list' : 'books-grid'}`}>
            {readGroups.map(([year, books]) => (
              <div key={year} className="books-year-group">
                <div className="books-year-header">
                  <span className="books-year-label">{year}</span>
                  <span className="books-year-count">{books.length} books</span>
                </div>
                <div className={viewMode === 'list' ? 'books-list-inner' : 'books-grid-inner'}>
                  {books.map((book, i) => renderCard(book, i))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Books — non-Read tabs: flat grid/list */}
        {!loading && !error && !readGroups && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${viewMode}`}
              className={viewMode === 'list' ? 'books-list-inner' : 'books-grid'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {tabBooks.map((book, i) => renderCard(book, i))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Empty state */}
        {!loading && !error && tabBooks.length === 0 && (
          <div className="books-empty animate-fade-in-up">
            <p>
              {activeTab === 'all'
                ? 'This library is currently empty.'
                : `No books marked as '${STATUS_LABELS[activeTab]}' yet.`}
            </p>
          </div>
        )}
      </div>

      {/* Slide-Over Review Panel */}
      <SlideOverPanel
        book={selectedBook}
        isOpen={!!selectedBook}
        onClose={() => setSelectedBook(null)}
        onSave={handleSaveReview}
        isAdmin={isAdmin}
      />
    </div>
  );
}
