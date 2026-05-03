import { useState, useEffect } from 'react';
import CollectionCard from '../components/CollectionCard';
import ReviewModal from '../components/ReviewModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Books.css';

const statusLabels = {
  'all': 'All',
  'unread': 'Unread',
  'reading': 'Currently Reading',
  'read': 'Read',
};

const statusEmojis = {
  'unread': '📚',
  'reading': '📖',
  'read': '✓',
};

export default function Books() {
  const { user } = useAuth();
  const [displayBooks, setDisplayBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Tabs and Modal state
  const [activeTab, setActiveTab] = useState('all');
  const [selectedBook, setSelectedBook] = useState(null);

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

          // Unauthenticated users don't have reviews saved, default to unread
          const mapped = booksData
            .filter(b => ownedSet.has(b.id))
            .map(b => ({
              id: b.id,
              title: b.title,
              author: b.author,
              genre: b.genre_name,
              coverColor: b.color,
              notes: b.note,
              status: 'unread',
              rating: null,
              review: null
            }));
            
          setDisplayBooks(mapped);
          setLoading(false);
          return;
        }
        
        // Authenticated: SQL Join with the new review columns!
        const { data, error } = await supabase
          .from('user_books')
          .select(`
            book_id,
            status,
            rating,
            review,
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
          const mapped = data.map(row => ({
            id: row.books.id,
            title: row.books.title,
            author: row.books.author,
            genre: row.books.genre_name,
            coverColor: row.books.color,
            notes: row.review || row.books.note, // Prefer personal review over global note
            status: row.status || 'unread',
            rating: row.rating,
            review: row.review
          }));
          
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

  const handleSaveReview = async (bookId, updates) => {
    if (!user) {
      alert("You must be logged in to save reviews!");
      return;
    }

    try {
      const { error } = await supabase
        .from('user_books')
        .update(updates)
        .eq('user_id', user.id)
        .eq('book_id', bookId);

      if (error) throw error;

      // Update local state instantly
      setDisplayBooks(prev => prev.map(b => {
        if (b.id === bookId) {
          return {
            ...b,
            ...updates,
            notes: updates.review || b.notes // Update the note displayed on the card
          };
        }
        return b;
      }));
    } catch (err) {
      console.error("Failed to save review:", err);
      alert("Failed to save review. Please try again.");
    }
  };

  const filteredBooks = activeTab === 'all' 
    ? displayBooks 
    : displayBooks.filter(b => b.status === activeTab);

  const statusCounts = {
    'all': displayBooks.length,
    'unread': displayBooks.filter(b => b.status === 'unread').length,
    'reading': displayBooks.filter(b => b.status === 'reading').length,
    'read': displayBooks.filter(b => b.status === 'read').length,
  };

  return (
    <div className="books-page">
      <div className="container">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">My Library</h1>
          <p className="page-header__subtitle">
            Books I have collected and tracked. Click a book to rate and review it!
          </p>
        </header>

        {!loading && displayBooks.length > 0 && (
          <div className="books-tabs animate-fade-in-up animate-stagger-2">
            {Object.entries(statusLabels).map(([key, label]) => (
              <button
                key={key}
                className={`books-tab ${activeTab === key ? 'books-tab--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {statusEmojis[key] && <span className="books-tab__emoji">{statusEmojis[key]}</span>}
                {label}
                <span className="books-tab__count">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', margin: 'var(--space-12) 0', color: 'var(--text-muted)' }}>
            Loading library...
          </div>
        ) : (
          <div className="books-grid">
            {filteredBooks.map((book, i) => (
              <CollectionCard
                key={book.id}
                title={book.title}
                subtitle={book.author}
                genre={book.genre}
                coverColor={book.coverColor}
                notes={book.notes}
                rating={book.rating}
                status={book.status}
                index={i}
                onClick={() => setSelectedBook(book)}
              />
            ))}
          </div>
        )}

        {!loading && filteredBooks.length === 0 && (
          <div className="books-empty animate-fade-in-up">
            <p>
              {activeTab === 'all' 
                ? "You haven't added any books to your collection yet. Head over to the Collection tab to start checking them off!"
                : `You don't have any books marked as '${statusLabels[activeTab]}' yet.`}
            </p>
          </div>
        )}
      </div>

      <ReviewModal 
        book={selectedBook} 
        isOpen={!!selectedBook} 
        onClose={() => setSelectedBook(null)}
        onSave={handleSaveReview}
      />
    </div>
  );
}
