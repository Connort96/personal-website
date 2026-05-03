import './CollectionCard.css';

export default function CollectionCard({ title, subtitle, year, genre, rating, coverColor, notes, onClick, index = 0, status }) {
  const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : null;
  const delay = Math.min(index * 0.05, 0.4);

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
        style={{ backgroundColor: coverColor || '#2a2a3a' }}
      >
        <div className="collection-card__cover-pattern"></div>
        {status && status !== 'unread' && (
          <div className="collection-card__status-badge">
            {status === 'reading' ? '📖' : '✓'}
          </div>
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
