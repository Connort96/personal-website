import './LibraryHero.css';

export default function LibraryHero({ book, onClick, isAdmin }) {
  if (!book) return null;

  const progress = book.pageCount > 0 
    ? Math.min(Math.round((book.currentPage / book.pageCount) * 100), 100) 
    : 0;

  return (
    <div
      className={`library-hero animate-fade-in-up ${onClick ? 'library-hero--clickable' : ''}`}
      onClick={onClick}
    >
      {/* Glass Backdrop */}
      <div className="library-hero__glass" />
      
      {/* Accent: Blurred Cover on the right */}
      <div 
        className="library-hero__accent" 
        style={{ backgroundImage: `url(${book.coverUrl})` }} 
      />

      <div className="library-hero__content">
        <div className="library-hero__cover-column">
          <div className="library-hero__cover-3d">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="library-hero__cover" />
            ) : (
              <div className="library-hero__cover-placeholder" style={{ backgroundColor: book.coverColor || 'var(--bg-tertiary)' }}>
                {book.title[0]}
              </div>
            )}
          </div>
        </div>

        <div className="library-hero__info-column">
          <span className="library-hero__label">Currently Reading</span>
          <h2 className="library-hero__title">{book.title}</h2>
          <p className="library-hero__author">by {book.author}</p>
          
          <div className="library-hero__progress-section">
            <div className="library-hero__progress-meta">
              <span className="library-hero__progress-text">Progress</span>
              <span className="library-hero__progress-percent">{progress}%</span>
            </div>
            <div className="library-hero__progress-track">
              <div 
                className="library-hero__progress-bar" 
                style={{ width: `${progress}%` }} 
              />
            </div>
            <p className="library-hero__progress-pages">
              {book.currentPage} / {book.pageCount} pages
            </p>
          </div>

          {isAdmin && (
            <span className="library-hero__edit-hint">Click to update progress →</span>
          )}
        </div>
      </div>
    </div>
  );
}
