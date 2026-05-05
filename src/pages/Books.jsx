import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CollectionCard from '../components/CollectionCard';
import './Books.css';

export default function Books() {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTag, setActiveTag] = useState('All');
  const [allTags, setAllTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

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
          if (!work) return; // Should not happen after migration

          const workId = work.id;
          if (edition?.genre_name) tags.add(edition.genre_name);

          if (!workGroups.has(workId)) {
            workGroups.set(workId, {
              id: workId,
              title: work.title,
              author: work.author,
              tag: edition?.genre_name || 'Uncategorized',
              status: row.status || 'unread',
              rating: row.rating || 0,
              review: row.review || '',
              owned_at: row.owned_at ? new Date(row.owned_at).getTime() : 0,
              editions: []
            });
          }

          const group = workGroups.get(workId);
          if (edition) {
            group.editions.push({
              ...edition,
              status: row.status,
              owned_at: row.owned_at
            });
          }
        });

        const mapped = Array.from(workGroups.values()).map(work => {
          const formatPriority = { 'Hardcover': 1, 'Paperback': 2, 'Audiobook': 3, 'Digital': 4 };
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
        setBooks(mapped.sort((a, b) => b.owned_at - a.owned_at));
      } catch (err) {
        console.error('Error loading library:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredBooks = books.filter(book => {
    const matchesTag = activeTag === 'All' || book.tag === activeTag;
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         book.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  if (loading) return (
    <div className="books-loading">
      <div className="spinner" />
      <p>Consulting the archives...</p>
    </div>
  );

  if (error) return (
    <div className="books-error">
      <p>Error loading library: {error}</p>
    </div>
  );

  return (
    <div className="books-page">
      <div className="container">
        <header className="books-header">
          <div className="header-content">
            <h1>The Personal Library</h1>
            <p className="library-count">{books.length} volumes in collection</p>
          </div>
          
          <div className="library-controls">
            <div className="search-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input 
                type="text" 
                placeholder="Search collection..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        <div className="tag-filter-container">
          <div className="tag-scroll">
            <button 
              className={`tag-btn ${activeTag === 'All' ? 'active' : ''}`}
              onClick={() => setActiveTag('All')}
            >
              All
            </button>
            {allTags.map(tag => (
              <button 
                key={tag}
                className={`tag-btn ${activeTag === tag ? 'active' : ''}`}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="books-grid">
          {filteredBooks.map(book => (
            <CollectionCard 
              key={book.id} 
              book={book} 
              onClick={() => navigate(`/book/${book.id}`)}
            />
          ))}
        </div>

        {filteredBooks.length === 0 && (
          <div className="empty-search">
            <p>No volumes match your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
