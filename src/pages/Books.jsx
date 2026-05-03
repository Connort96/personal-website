import { useState, useEffect } from 'react';
import CollectionCard from '../components/CollectionCard';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Books.css';

export default function Books() {
  const { user } = useAuth();
  const [displayBooks, setDisplayBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (!user) {
          // Unauthenticated: Fetch catalog and filter by local storage
          const localOwned = localStorage.getItem('libraryOwned');
          if (!localOwned) {
            setDisplayBooks([]);
            setLoading(false);
            return;
          }
          
          const parsedLocal = JSON.parse(localOwned);
          if (parsedLocal.length === 0) {
            setDisplayBooks([]);
            setLoading(false);
            return;
          }

          // Fetch full catalog (handling the 1,000 row limit via pagination)
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
          
          // Map local storage items (which might be legacy strings) to integer IDs
          const stringToIdMap = {};
          booksData.forEach(b => {
             stringToIdMap[`${b.genre_id}_${b.book_index}`] = b.id;
          });

          const ownedSet = new Set();
          parsedLocal.forEach(item => {
            if (typeof item === 'string' && stringToIdMap[item]) {
              ownedSet.add(stringToIdMap[item]);
            } else if (typeof item === 'number') {
              ownedSet.add(item);
            }
          });

          // Map books
          const mapped = booksData
            .filter(b => ownedSet.has(b.id))
            .map(b => ({
              id: b.id,
              title: b.title,
              author: b.author,
              genre: b.genre_name,
              coverColor: b.color,
              notes: b.note,
            }));
            
          setDisplayBooks(mapped);
          setLoading(false);
          return;
        }
        
        // Authenticated: Efficient SQL Join!
        const { data, error } = await supabase
          .from('user_books')
          .select(`
            book_id,
            books (
              id,
              title,
              author,
              genre_name,
              color,
              note
            )
          `)
          .eq('user_id', user.id);
          
        if (error) throw error;
        
        if (data) {
          // Supabase join syntax nests the joined table under its table name
          const mapped = data.map(row => ({
            id: row.books.id,
            title: row.books.title,
            author: row.books.author,
            genre: row.books.genre_name,
            coverColor: row.books.color,
            notes: row.books.note,
          }));
          
          // Sort by ID to preserve original genre grouping order
          mapped.sort((a, b) => a.id - b.id);
          setDisplayBooks(mapped);
        }
      } catch (err) {
        console.error("Error loading library:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  return (
    <div className="books-page">
      <div className="container">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">My Library</h1>
          <p className="page-header__subtitle">
            Books I have collected and tracked. You currently own {displayBooks.length} books.
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', margin: 'var(--space-12) 0', color: 'var(--text-muted)' }}>
            Loading library...
          </div>
        ) : (
          <div className="books-grid" id="books-grid">
            {displayBooks.map((book, i) => (
              <CollectionCard
                key={book.id}
                title={book.title}
                subtitle={book.author}
                genre={book.genre}
                coverColor={book.coverColor}
                notes={book.notes}
                index={i}
              />
            ))}
          </div>
        )}

        {!loading && displayBooks.length === 0 && (
          <div className="books-empty animate-fade-in-up">
            <p>You haven't added any books to your collection yet. Head over to the Collection tab to start checking them off!</p>
          </div>
        )}
      </div>
    </div>
  );
}
