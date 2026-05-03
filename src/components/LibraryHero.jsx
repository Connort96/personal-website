import './LibraryHero.css';

export default function LibraryHero({ book, onClick, isAdmin }) {
  if (!book) return null;

  const stars = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : null;

  return (
    <div
      className={`library-hero animate-fade-in-up ${onClick ? 'library-hero--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="library-hero__backdrop" style={{
        backgroundImage: book.coverUrl ? `url(${book.coverUrl})` : 'none',
        backgroundColor: book.coverColor || 'var(--bg-tertiary)',
      }} />
      <div className="library-hero__overlay" />

      <div className="library-hero__content">
        <div className="library-hero__cover-wrap">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.title} className="library-hero__cover" />
          ) : (
            <div className="library-hero__cover-placeholder" style={{ backgroundColor: book.coverColor || 'var(--bg-tertiary)' }}>
              {book.title[0]}
            </div>
          )}
        </div>

        <div className="library-hero__info">
          <span className="library-hero__eyebrow">📖 Currently Reading</span>
          <h2 className="library-hero__title">{book.title}</h2>
          <p className="library-hero__author">by {book.author}</p>
          {book.genre && <span className="library-hero__genre">{book.genre}</span>}
          {stars && <div className="library-hero__stars">{stars}</div>}
          {book.review && (
            <p className="library-hero__snippet">"{book.review}"</p>
          )}
          {isAdmin && (
            <span className="library-hero__edit-hint">Click to edit →</span>
          )}
        </div>
      </div>
    </div>
  );
}
