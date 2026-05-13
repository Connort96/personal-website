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
  title, subtitle, genres, rating, coverColor, coverUrl,
  notes, onClick, index = 0, status, formats, viewMode = 'grid',
  editionCount = 1, synopsis = null
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
        <div className="collection-card__cover collection-card__cover--list">
          {coverUrl ? (
            <img 
              src={coverUrl} 
              alt={title} 
              className="collection-card__image collection-card__image--list"
            />
          ) : (
            <div 
              className="collection-card__placeholder collection-card__placeholder--list" 
              style={{ backgroundColor: coverColor || 'var(--bg-tertiary)' }}
            >
              <div className="collection-card__cover-pattern" />
              <span>{title[0]}</span>
            </div>
          )}
          <FormatBadge formats={formats} />
          {editionCount > 1 && (
            <div className="collection-card__edition-badge collection-card__edition-badge--list" title={`${editionCount} editions owned`}>
              {editionCount}
            </div>
          )}
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
      <div className="collection-card__cover">
        {coverUrl ? (
          <img 
            src={coverUrl} 
            alt={title} 
            className="collection-card__image"
          />
        ) : (
          <div 
            className="collection-card__placeholder" 
            style={{ backgroundColor: coverColor || 'var(--bg-tertiary)' }}
          >
            <div className="collection-card__cover-pattern" />
            <span>{title[0]}</span>
          </div>
        )}
        {status && status !== 'unread' && (
          <div className="collection-card__status-badge">
            {status === 'reading' ? '📖' : '✓'}
          </div>
        )}
        {editionCount > 1 && (
          <div className="collection-card__edition-badge" title={`${editionCount} editions owned`}>
            {editionCount}
          </div>
        )}
        {synopsis && (
          <div className="collection-card__synopsis-badge" title="Archival Synopsis Available">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
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
