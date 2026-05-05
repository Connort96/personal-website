import './CollectionCard.css';

const FormatBadge = ({ formats }) => {
  if (!formats || formats.length === 0) return null;
  
  const hasAudio = formats.some(f => f.toLowerCase().includes('audio'));
  const hasPhysical = formats.some(f => !f.toLowerCase().includes('audio') && !f.toLowerCase().includes('digital'));

  return (
    <div className="collection-card__format-badges">
      {hasPhysical && (
        <div className="format-badge" title="Physical Edition">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
      )}
      {hasAudio && (
        <div className="format-badge" title="Audiobook">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default function CollectionCard({
  title, subtitle, year, genres, rating, coverColor, coverUrl,
  notes, onClick, index = 0, status, formats, viewMode = 'grid'
}) {
  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : null;
  const delay = Math.min(index * 0.04, 0.4);

  if (viewMode === 'list') {
    return (
      <article
        className={`collection-card collection-card--list animate-fade-in-up ${onClick ? 'clickable' : ''}`}
        style={{ animationDelay: `${delay}s`, cursor: onClick ? 'pointer' : 'default' }}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div
          className="collection-card__cover collection-card__cover--list"
          style={{
            backgroundColor: coverColor || '#2a2a3a',
            backgroundImage: coverUrl ? `url(${coverUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!coverUrl && <div className="collection-card__cover-pattern" />}
          <FormatBadge formats={formats} />
        </div>
        <div className="collection-card__list-info">
          <div className="collection-card__list-top">
            <h3 className="collection-card__title">{title}</h3>
            <p className="collection-card__subtitle">{subtitle}</p>
          </div>
          
          <p className="collection-card__notes collection-card__notes--list">
            {notes || ""}
          </p>
          
          <div className="collection-card__list-bottom">
            <div className="collection-card__genres">
              {genres && genres.length > 0 ? (
                genres.map(g => <span key={g} className="collection-card__genre" title={g}>{g}</span>)
              ) : (
                <span className="collection-card__genre" style={{ opacity: 0 }}>Empty</span>
              )}
            </div>
            <div className="collection-card__rating-row">
              {stars && <span className="collection-card__rating">{stars}</span>}
              {status && status !== 'unread' && (
                <span className="collection-card__status-inline">
                  {status === 'reading' ? '📖 Reading' : '✓ Read'}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Grid mode (default)
  return (
    <article
      className={`collection-card animate-fade-in-up ${onClick ? 'clickable' : ''}`}
      style={{ animationDelay: `${delay}s`, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div
        className="collection-card__cover"
        style={{
          backgroundColor: coverColor || '#2a2a3a',
          backgroundImage: coverUrl ? `url(${coverUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {!coverUrl && <div className="collection-card__cover-pattern" />}
        {status && status !== 'unread' && (
          <div className="collection-card__status-badge">
            {status === 'reading' ? '📖' : '✓'}
          </div>
        )}
        <FormatBadge formats={formats} />
      </div>
      <div className="collection-card__info">
        <h3 className="collection-card__title">{title}</h3>
        <p className="collection-card__subtitle">{subtitle}</p>
        
        <p className="collection-card__notes">
          {notes || ""}
        </p>
        
        <div className="collection-card__meta">
          <div className="collection-card__genres">
            {genres && genres.length > 0 ? (
              genres.map(g => <span key={g} className="collection-card__genre" title={g}>{g}</span>)
            ) : (
              <span className="collection-card__genre" style={{ opacity: 0 }}>Empty</span>
            )}
          </div>
          <div className="collection-card__rating-row">
            {stars && <span className="collection-card__rating" aria-label={`${rating} out of 5 stars`}>{stars}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
