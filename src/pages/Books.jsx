import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import CollectionCard from '../components/CollectionCard';
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

// Virtualized Grid Components
const GridList = ({ className, children, ...props }) => (
  <div className={className} {...props} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-8)' }}>
    {children}
  </div>
);

const GridItem = ({ children, ...props }) => (
  <div {...props} style={{ paddingBottom: 'var(--space-8)' }}>
    {children}
  </div>
);

export default function Books() {
  const { user } = useAuth();
  const [allBooks, setAllBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [allTags, setAllTags] = useState([]);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('library-view') || 'grid');
  const navigate = useNavigate();

  const isAdmin = user?.email === 'theconison96@gmail.com';

  const handleViewChange = (newMode) => {
    setViewMode(newMode);
    localStorage.setItem('library-view', newMode);
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const { data: adminSettings, error: adminErr } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
        if (adminErr || !adminSettings) throw new Error('Could not find admin settings.');
        const adminId = adminSettings.admin_user_id;

        let allRows = [];
        let from = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error: fetchErr } = await supabase
            .from('user_books')
            .select(`
              user_id, book_id, edition_id, status, rating, review, current_page, owned_at,
              editions ( 
                id, work_id, cover_url, cover_image_url, genre_id, genre_name, color, publisher, 
                page_count, isbn, publication_date, translator, format,
                works ( id, title, author ) 
              )
            `)
            .eq('user_id', adminId)
            .range(from, from + pageSize - 1);

          if (fetchErr) throw fetchErr;
          allRows = [...allRows, ...data];
          if (data.length < pageSize) break;
          from += pageSize;
        }

        const workGroups = new Map();
        const tags = new Set();

        allRows.forEach(row => {
          const edition = row.editions;
          const work = edition?.works;
          if (!work) return;

          const workId = work.id;
          if (edition?.genre_name) tags.add(edition.genre_name);

          if (!workGroups.has(workId)) {
            workGroups.set(workId, {
              id: workId,
              title: work.title,
              author: work.author,
              tag: edition?.genre_name || 'Uncategorized',
              status: row.status || 'unread',
              rating: 0,
              review: '',
              owned_at: row.owned_at ? new Date(row.owned_at).getTime() : 0,
              editions: []
            });
          }

          const group = workGroups.get(workId);
          if (edition) {
            group.editions.push({
              ...edition,
              status: row.status,
              owned_at: row.owned_at,
              rating: row.rating,
              review: row.review
            });
            
            // Shared Review/Rating Logic: Use the best one found among editions
            if (row.review && !group.review) group.review = row.review;
            if (row.rating && !group.rating) group.rating = row.rating;
          }
        });

        const mapped = Array.from(workGroups.values()).map(work => {
          const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4, 'Kindle': 4 };
          const sortedEditions = [...work.editions].sort((a, b) => {
            const aHasCover = !!(a.cover_url || a.cover_image_url);
            const bHasCover = !!(b.cover_url || b.cover_image_url);
            if (aHasCover !== bHasCover) return aHasCover ? -1 : 1;
            const aPrio = formatPriority[a.format] || 5;
            const bPrio = formatPriority[b.format] || 5;
            return aPrio - bPrio;
          });

          const primary = sortedEditions[0] || {};
          const formats = Array.from(new Set(work.editions.map(e => e.format).filter(Boolean)));
          const latestOwnedAt = Math.max(...work.editions.map(e => e.owned_at ? new Date(e.owned_at).getTime() : 0));

          return {
            ...work,
            coverUrl: primary.cover_url || primary.cover_image_url,
            coverColor: primary.color,
            formats: formats,
            primaryFormat: primary.format,
            pageCount: primary.page_count,
            publisher: primary.publisher,
            isbn: primary.isbn,
            publicationDate: primary.publication_date,
            translator: primary.translator,
            owned_at: latestOwnedAt || work.owned_at
          };
        });

        setAllTags(Array.from(tags).sort());
        setAllBooks(mapped);
      } catch (err) {
        console.error('Error loading library:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const filteredBooks = useMemo(() => {
    return allBooks
      .filter(b => activeTab === 'all' || b.status === activeTab)
      .filter(b => selectedTag === 'all' || b.tag === selectedTag)
      .filter(b => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
        return (b.owned_at || 0) - (a.owned_at || 0);
      });
  }, [allBooks, activeTab, sortBy, searchTerm, selectedTag]);

  const currentlyReading = useMemo(() => allBooks.find(b => b.status === 'reading'), [allBooks]);

  const RowContent = useCallback((index, book) => (
    <CollectionCard
      key={book.id}
      title={book.title}
      subtitle={book.author}
      genre={book.tag}
      coverColor={book.coverColor}
      coverUrl={book.coverUrl}
      rating={book.rating}
      status={book.status}
      formats={book.formats}
      viewMode={viewMode}
      index={index}
      onClick={() => navigate(`/book/${book.id}`)}
    />
  ), [viewMode, navigate]);

  return (
    <div className="books-page">
      <div className="container">
        <header className="page-header">
          <h1 className="page-header__title">My Library</h1>
          <p className="page-header__subtitle">
            {allBooks.length > 0 ? `${allBooks.length} books in the archive.` : 'Connecting to the scriptorium...'}
          </p>
        </header>

        {!loading && currentlyReading && !searchTerm && selectedTag === 'all' && (
          <LibraryHero book={currentlyReading} isAdmin={isAdmin} onClick={() => navigate(`/book/${currentlyReading.id}`)} />
        )}

        {!loading && (
          <div className="books-omni-search">
            <input
              type="text"
              placeholder="Search by title or author..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="books-search-input"
            />
            <div className="search-icon">🔍</div>
          </div>
        )}

        {!loading && (
          <div className="books-toolbar">
            <div className="books-tabs">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={`books-tab ${activeTab === key ? 'books-tab--active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {STATUS_EMOJIS[key] && <span className="books-tab__emoji">{STATUS_EMOJIS[key]}</span>}
                  {label}
                </button>
              ))}
            </div>

            <div className="books-controls">
              <div className="books-filter-group">
                <label>Collection:</label>
                <select value={selectedTag} onChange={e => setSelectedTag(e.target.value)} className="books-select">
                  <option value="all">All Tags</option>
                  {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>

              <div className="books-filter-group">
                <label>Sort:</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="books-select">
                  <option value="recent">Recent</option>
                  <option value="rating">Rating</option>
                  <option value="title">A-Z</option>
                </select>
              </div>

              <ViewToggle view={viewMode} onChange={handleViewChange} />
            </div>
          </div>
        )}

        <div className="books-content" style={{ height: '70vh', minHeight: '600px' }}>
          {loading ? (
            <div className="books-loading">
              <div className="books-loading__spinner" />
              <p>Consulting the archives...</p>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="books-empty">
              <p>No volumes match your inquiry.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <VirtuosoGrid
              data={filteredBooks}
              totalCount={filteredBooks.length}
              components={{ List: GridList, Item: GridItem }}
              itemContent={(index, book) => RowContent(index, book)}
            />
          ) : (
            <Virtuoso
              data={filteredBooks}
              totalCount={filteredBooks.length}
              itemContent={(index, book) => (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  {RowContent(index, book)}
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
