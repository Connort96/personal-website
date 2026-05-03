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
  
  // Tabs, Sorting, and Modal state
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('recent'); // 'title', 'rating', 'recent'
  const [selectedBook, setSelectedBook] = useState(null);
  
  const isAdmin = user && user.email === 'theconison96@gmail.com';

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // 1. Get the admin's UUID (so visitors can see the admin's books)
        const { data: adminSettings, error: adminError } = await supabase
          .from('admin_settings')
          .select('admin_user_id')
          .single();
          
        if (adminError || !adminSettings) throw new Error("Could not find admin settings.");
        
        const adminId = adminSettings.admin_user_id;

        // 2. Fetch the admin's books securely with pagination
        let allUserBooks = [];
        let hasMore = true;
        let fromIndex = 0;
        const pageSize = 1000;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from('user_books')
            .select(`
              book_id,
              status,
              rating,
              review,
              owned_at,
              books (
                id,
                title,
                author,
                genre_name,
                color,
                note,
                cover_url
              )
            `)
            .eq('user_id', adminId)
            .range(fromIndex, fromIndex + pageSize - 1);
            
          if (error) throw error;
          
          allUserBooks = [...allUserBooks, ...data];
          
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            fromIndex += pageSize;
          }
        }
        
        if (allUserBooks.length > 0) {
          const mapped = allUserBooks.map(row => ({
            id: row.books.id,
            title: row.books.title,
            author: row.books.author,
            genre: row.books.genre_name,
            coverColor: row.books.color,
            coverUrl: row.books.cover_url,
            notes: row.review || row.books.note, // Prefer personal review over global note
            status: row.status || 'unread',
            rating: row.rating,
            review: row.review,
            owned_at: new Date(row.owned_at).getTime()
          }));
          
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

  const handleSaveReview = async (bookId, updates, globalCoverUrl) => {
    if (!isAdmin) {
      alert("Only the admin can save reviews!");
      return;
    }

    try {
      // 1. Update user_books (status, rating, review)
      const { error } = await supabase
        .from('user_books')
        .update(updates)
        .eq('user_id', user.id)
        .eq('book_id', bookId);

      if (error) throw error;

      // 2. Update global books table if a new cover URL was provided
      if (globalCoverUrl !== undefined) {
        const { error: coverError } = await supabase
          .from('books')
          .update({ cover_url: globalCoverUrl })
          .eq('id', bookId);
          
        if (coverError) {
          console.error("Failed to update global cover:", coverError);
          // Don't throw, we still saved the review successfully
        }
      }

      // Update local state instantly
      setDisplayBooks(prev => prev.map(b => {
        if (b.id === bookId) {
          return {
            ...b,
            ...updates,
            notes: updates.review || b.notes, // Update the note displayed on the card
            coverUrl: globalCoverUrl !== undefined ? globalCoverUrl : b.coverUrl
          };
        }
        return b;
      }));
    } catch (err) {
      console.error("Failed to save review:", err);
      alert("Failed to save review. Please try again.");
    }
  };

  // --- Sorting Logic ---
  const sortBooks = (books) => {
    return [...books].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'rating') {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA; // Highest first
      }
      if (sortBy === 'recent') {
        const timeA = a.owned_at || 0;
        const timeB = b.owned_at || 0;
        return timeB - timeA; // Newest first
      }
      return 0;
    });
  };

  const filteredBooks = sortBooks(
    activeTab === 'all' 
      ? displayBooks 
      : displayBooks.filter(b => b.status === activeTab)
  );

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
            Books I have collected and tracked. 
            {isAdmin && " Click a book to rate and review it!"}
          </p>
        </header>

        {!loading && displayBooks.length > 0 && (
          <div className="books-toolbar animate-fade-in-up animate-stagger-2">
            <div className="books-tabs">
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
            
            <div className="books-sort">
              <label htmlFor="sort-select">Sort by:</label>
              <select 
                id="sort-select" 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="books-sort-select"
              >
                <option value="recent">Recently Added</option>
                <option value="rating">Highest Rated</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>
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
                coverUrl={book.coverUrl}
                notes={book.notes}
                rating={book.rating}
                status={book.status}
                index={i}
                onClick={isAdmin ? () => setSelectedBook(book) : undefined}
              />
            ))}
          </div>
        )}

        {!loading && filteredBooks.length === 0 && (
          <div className="books-empty animate-fade-in-up">
            <p>
              {activeTab === 'all' 
                ? "This library is currently empty."
                : `No books marked as '${statusLabels[activeTab]}' yet.`}
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
