import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import CollectionCard from '../components/CollectionCard';
import LibraryHero from '../components/LibraryHero';
import ViewToggle from '../components/ViewToggle';
import ISBNScanner from '../components/ISBNScanner';
import LibraryFilters from '../components/LibraryFilters';
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
const GridList = ({ className, children, style, ...props }) => (
  <div
    className={className}
    {...props}
    style={{
      ...style,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 'var(--space-8)',
      paddingBottom: 'var(--space-20)'
    }}
  >
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
  const [needsReviewFilter, setNeedsReviewFilter] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('library-view');
    if (saved) return saved;
    // Default to list on mobile (< 768px)
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? 'list' : 'grid';
    }
    return 'grid';
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const themeFilter = searchParams.get('theme');
  const vibeFilter = searchParams.get('vibe');

  const isAdmin = user?.email === 'theconison96@gmail.com';

  const handleViewChange = (newMode) => {
    setViewMode(newMode);
    localStorage.setItem('library-view', newMode);
  };

  const loadDataRef = useRef(null);

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
                page_count, isbn, publication_date, translator, format, needs_review,
                works ( id, title, author, synopsis, motifs, vibes, primary_edition_id ) 
              ),
              books (
                id, title, author, cover_url, page_count, genre_name, publisher, color
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
          const legacyBook = row.books;
          const work = edition?.works;
          
          // Use metadata from whichever source is available
          const title = work?.title || legacyBook?.title;
          const author = work?.author || legacyBook?.author;
          
          if (!title) return; // Still skip if absolutely no title found

          const dedupKey = `${title.toLowerCase().trim()}--${author?.toLowerCase().trim() || 'unknown'}`;
          
          const genre = edition?.genre_name || legacyBook?.genre_name;
          if (genre) tags.add(genre);

          if (!workGroups.has(dedupKey)) {
            workGroups.set(dedupKey, {
              id: work?.id || row.book_id || row.edition_id, 
              title: title,
              author: author || 'Unknown Author',
              genres: new Set(),
              status: row.status || 'unread',
              rating: 0,
              review: '',
              owned_at: row.owned_at ? new Date(row.owned_at).getTime() : 0,
              synopsis: work?.synopsis,
              primary_edition_id: work?.primary_edition_id,
              editions: []
            });
          }

          const group = workGroups.get(dedupKey);
          if (edition || legacyBook) {
            const finalEdition = edition || {
              id: `legacy-${row.book_id}`,
              cover_url: legacyBook?.cover_url,
              color: legacyBook?.color,
              publisher: legacyBook?.publisher,
              page_count: legacyBook?.page_count,
              genre_name: legacyBook?.genre_name
            };

            if (finalEdition.genre_name) group.genres.add(finalEdition.genre_name);
            group.editions.push({
              ...finalEdition,
              status: row.status,
              owned_at: row.owned_at,
              rating: row.rating,
              review: row.review
            });

            if (row.review && !group.review) group.review = row.review;
            if (row.rating && !group.rating) group.rating = row.rating;
          }
        });

        const mapped = Array.from(workGroups.values()).map(work => {
          // If an explicit primary edition exists, use it. Otherwise, use priority logic.
          let primary = {};
          if (work.primary_edition_id) {
            primary = work.editions.find(e => e.id === work.primary_edition_id) || {};
          }

          if (!primary.id) {
            const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4, 'Kindle': 4 };
            const sortedEditions = [...work.editions].sort((a, b) => {
              const aHasCover = !!(a.cover_url || a.cover_image_url);
              const bHasCover = !!(b.cover_url || b.cover_image_url);
              if (aHasCover !== bHasCover) return aHasCover ? -1 : 1;
              const aPrio = formatPriority[a.format] || 5;
              const bPrio = formatPriority[b.format] || 5;
              return aPrio - bPrio;
            });
            primary = sortedEditions[0] || {};
          }
          const formats = Array.from(new Set(work.editions.map(e => e.format).filter(Boolean)));
          const latestOwnedAt = Math.max(...work.editions.map(e => e.owned_at ? new Date(e.owned_at).getTime() : 0));

          return {
            ...work,
            id: primary.work_id || work.id, // Ensure we link to the work ID of the primary edition
            coverUrl: primary.cover_url || primary.cover_image_url,
            coverColor: primary.color,
            formats: formats,
            primaryFormat: primary.format,
            pageCount: primary.page_count,
            publisher: primary.publisher,
            isbn: primary.isbn,
            publicationDate: primary.publication_date,
            translator: primary.translator,
            owned_at: latestOwnedAt || work.owned_at,
            editions: work.editions,
            needs_review: work.editions.some(e => e.needs_review === true),
            motifs: primary.works?.motifs || [],
            vibes: primary.works?.vibes || []
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
    loadDataRef.current = loadData;
    loadData();
  }, [user]);

  const filteredBooks = useMemo(() => {
    return allBooks
      .filter(b => {
        if (needsReviewFilter) return b.needs_review === true;
        return activeTab === 'all' || b.status === activeTab;
      })
      .filter(b => selectedTag === 'all' || b.genres.has(selectedTag))
      .filter(b => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s);
      })
      .filter(b => {
        if (!themeFilter) return true;
        return b.motifs.includes(themeFilter);
      })
      .filter(b => {
        if (!vibeFilter) return true;
        return b.vibes.includes(vibeFilter);
      })
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
        return (b.owned_at || 0) - (a.owned_at || 0);
      });
  }, [allBooks, activeTab, sortBy, searchTerm, selectedTag, needsReviewFilter, themeFilter, vibeFilter]);

  const currentlyReading = useMemo(() => allBooks.find(b => b.status === 'reading'), [allBooks]);
  
  const allThemes = useMemo(() => {
    const themes = new Set();
    allBooks.forEach(b => b.motifs?.forEach(m => themes.add(m)));
    return Array.from(themes);
  }, [allBooks]);

  const allVibes = useMemo(() => {
    const vibes = new Set();
    allBooks.forEach(b => b.vibes?.forEach(v => vibes.add(v)));
    return Array.from(vibes);
  }, [allBooks]);

  const RowContent = useCallback((index, book) => (
    <CollectionCard
      key={book.id}
      title={book.title}
      subtitle={book.author}
      genres={Array.from(book.genres)}
      coverColor={book.coverColor}
      coverUrl={book.coverUrl}
      rating={book.rating}
      status={book.status}
      formats={book.formats}
      notes={book.review}
      synopsis={book.synopsis}
      editionCount={book.editions?.length || 1}
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
          <div className="books-control-header">
            {/* ROW 1: OMNI SEARCH & VIEW CONTROLS */}
            <div className="books-omni-row">
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

              <div className="books-view-controls">
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

            {/* ROW 2: STATUS & ADD FILTER */}
            <div className="books-filter-row">
              <div className="books-status-group">
                <div className="books-tabs">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      className={`books-tab ${activeTab === key && !needsReviewFilter ? 'books-tab--active' : ''}`}
                      onClick={() => { setActiveTab(key); setNeedsReviewFilter(false); }}
                    >
                      {STATUS_EMOJIS[key] && <span className="books-tab__emoji">{STATUS_EMOJIS[key]}</span>}
                      {label}
                    </button>
                  ))}
                  <button
                    className={`books-tab books-tab--review ${needsReviewFilter ? 'books-tab--active books-tab--review-active' : ''}`}
                    onClick={() => setNeedsReviewFilter(prev => !prev)}
                  >
                    <span className="books-tab__emoji">⚠</span>
                    Needs Review
                  </button>
                </div>

                <div className="books-filter-actions">
                  <LibraryFilters 
                    themes={allThemes} 
                    vibes={allVibes} 
                    collections={allTags}
                    selectedCollection={selectedTag}
                    onCollectionChange={setSelectedTag}
                  />

                  {/* ACTIVE FILTER PILLS (INLINE) */}
                  {(themeFilter || vibeFilter || selectedTag !== 'all') && (
                    <div className="books-active-pills">
                      {selectedTag !== 'all' && (
                        <div className="active-filter-pill">
                          <span>{selectedTag}</span>
                          <button onClick={() => setSelectedTag('all')}>✕</button>
                        </div>
                      )}
                      {themeFilter && (
                        <div className="active-filter-pill">
                          <span>{themeFilter}</span>
                          <button onClick={() => {
                            const newParams = new URLSearchParams(searchParams);
                            newParams.delete('theme');
                            setSearchParams(newParams);
                          }}>✕</button>
                        </div>
                      )}
                      {vibeFilter && (
                        <div className="active-filter-pill">
                          <span>{vibeFilter}</span>
                          <button onClick={() => {
                            const newParams = new URLSearchParams(searchParams);
                            newParams.delete('vibe');
                            setSearchParams(newParams);
                          }}>✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}



        {error && (
          <div className="books-error">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        <div className="books-content">
          {loading ? (
            <div className="books-loading">
              <div className="books-loading__spinner" />
              <p>Consulting the archives...</p>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="books-empty">
              <p>No volumes match your inquiry.</p>
            </div>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <VirtuosoGrid
                  key="grid"
                  data={filteredBooks}
                  totalCount={filteredBooks.length}
                  components={{ List: GridList, Item: GridItem }}
                  itemContent={(index, book) => RowContent(index, book)}
                  useWindowScroll
                  overscan={800}
                />
              ) : (
                <Virtuoso
                  key="list"
                  data={filteredBooks}
                  totalCount={filteredBooks.length}
                  useWindowScroll
                  itemContent={(index, book) => (
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      {RowContent(index, book)}
                    </div>
                  )}
                />
              )}
            </>
          )}
        </div>

        {/* Floating Action Button for Scanner */}
        {isAdmin && (
          <motion.button
            className="books-fab"
            whileHover={{ scale: 1.05, boxShadow: '0 10px 25px rgba(200, 168, 75, 0.4)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsScannerOpen(true)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            aria-label="Scan ISBN Barcode"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5v14" />
              <path d="M21 5v14" />
              <path d="M7 5v14" />
              <path d="M12 5v14" />
              <path d="M17 5v14" />
              <path d="M3 5h2" />
              <path d="M3 19h2" />
              <path d="M19 5h2" />
              <path d="M19 19h2" />
            </svg>
            <span className="books-fab__label">Scan</span>
          </motion.button>
        )}

        <ISBNScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onComplete={() => {
            // Refresh library data after a successful batch scan
            if (loadDataRef.current) loadDataRef.current();
          }}
        />
      </div>
    </div>
  );
}
