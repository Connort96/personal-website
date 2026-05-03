import './CollectionCard.css';

export default function CollectionCard({
  title, subtitle, year, genre, rating, coverColor, coverUrl,
  notes, onClick, index = 0, status, editionCount = 1, viewMode = 'grid'
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
          {editionCount > 1 && (
            <div className="collection-card__edition-badge">+{editionCount - 1}</div>
          )}
        </div>
        <div className="collection-card__list-info">
          <div className="collection-card__list-top">
            <h3 className="collection-card__title">{title}</h3>
            <p className="collection-card__subtitle">{subtitle}</p>
          </div>
          <div className="collection-card__list-bottom">
            {genre && <span className="collection-card__genre">{genre}</span>}
            {stars && <span className="collection-card__rating">{stars}</span>}
            {status && status !== 'unread' && (
              <span className="collection-card__status-inline">
                {status === 'reading' ? '📖 Reading' : '✓ Read'}
              </span>
            )}
          </div>
          {notes && <p className="collection-card__notes collection-card__notes--list">{notes}</p>}
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
        {editionCount > 1 && (
          <div className="collection-card__edition-badge">+{editionCount - 1}</div>
        )}
      </div>
      <div className="collection-card__info">
        <h3 className="collection-card__title">{title}</h3>
        <p className="collection-card__subtitle">{subtitle}</p>
        <div className="collection-card__meta">
          {genre && <span className="collection-card__genre">{genre}</span>}
          {stars && <span className="collection-card__rating" aria-label={`${rating} out of 5 stars`}>{stars}</span>}
        </div>
        {notes && <p className="collection-card__notes">{notes}</p>}
      </div>
    </article>
  );
}
