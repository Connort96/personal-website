import { useState, useEffect } from 'react';
import CollectionCard from '../components/CollectionCard';
import { libraryData } from '../data/libraryData';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Books.css';

export default function Books() {
  const { user } = useAuth();
  const [ownedBooks, setOwnedBooks] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      if (!user) {
        // Load from local storage
        const localOwned = localStorage.getItem('libraryOwned');
        if (localOwned) {
          setOwnedBooks(new Set(JSON.parse(localOwned)));
        }
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('user_books')
          .select('book_id');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const { data: bookMeta, error: metaError } = await supabase
            .from('books')
            .select('id, genre_id, book_index');
            
          if (metaError) throw metaError;
          
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
          // Fallback to local storage if empty
          const localOwned = localStorage.getItem('libraryOwned');
          if (localOwned) {
            setOwnedBooks(new Set(JSON.parse(localOwned)));
          }
        }
      } catch (err) {
        console.error("Error loading collection:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  // Map owned books to array for display
  const displayBooks = [];
  libraryData.forEach(genre => {
    genre.books.forEach((book, index) => {
      if (ownedBooks.has(`${genre.id}_${index}`)) {
        displayBooks.push({
          id: `${genre.id}_${index}`,
          title: book.t,
          author: book.a,
          genre: genre.name,
          coverColor: genre.color,
          notes: book.n,
        });
      }
    });
  });

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
