import { useState } from 'react';
import CollectionCard from '../components/CollectionCard';
import { books } from '../data/books';
import './Books.css';

const statusLabels = {
  'all': 'All',
  'read': 'Read',
  'currently-reading': 'Currently Reading',
  'want-to-read': 'Want to Read',
};

const statusEmojis = {
  'read': '✓',
  'currently-reading': '📖',
  'want-to-read': '🔖',
};

export default function Books() {
  const [activeStatus, setActiveStatus] = useState('all');

  const filtered = activeStatus === 'all'
    ? books
    : books.filter(b => b.status === activeStatus);

  const statusCounts = {
    'all': books.length,
    'read': books.filter(b => b.status === 'read').length,
    'currently-reading': books.filter(b => b.status === 'currently-reading').length,
    'want-to-read': books.filter(b => b.status === 'want-to-read').length,
  };

  return (
    <div className="books-page">
      <div className="container">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">Book Collection</h1>
          <p className="page-header__subtitle">
            Books that shaped my thinking, and those I can't wait to read.
          </p>
        </header>

        <div className="books-tabs animate-fade-in-up animate-stagger-2" id="book-tabs">
          {Object.entries(statusLabels).map(([key, label]) => (
            <button
              key={key}
              className={`books-tab ${activeStatus === key ? 'books-tab--active' : ''}`}
              onClick={() => setActiveStatus(key)}
              id={`tab-${key}`}
            >
              {statusEmojis[key] && <span className="books-tab__emoji">{statusEmojis[key]}</span>}
              {label}
              <span className="books-tab__count">{statusCounts[key]}</span>
            </button>
          ))}
        </div>

        <div className="books-grid" id="books-grid">
          {filtered.map((book, i) => (
            <CollectionCard
              key={book.id}
              title={book.title}
              subtitle={book.author}
              year={book.year}
              genre={book.genre}
              rating={book.rating}
              coverColor={book.coverColor}
              notes={book.notes}
              index={i}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="books-empty animate-fade-in-up">
            <p>No books in this category yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
