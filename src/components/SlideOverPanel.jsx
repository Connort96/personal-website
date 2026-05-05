import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SlideOverPanel.css';

const statusLabels = {
  unread: 'Unread',
  reading: 'Currently Reading',
  read: 'Finished',
};

const statusColors = {
  unread: 'var(--text-muted)',
  reading: 'var(--accent-primary)',
  read: 'var(--status-success)',
};

export default function SlideOverPanel({ book, isOpen, onClose, onSave, isAdmin }) {
  if (!book) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="slideover-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="slideover-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <SlideOverContent
              book={book}
              onClose={onClose}
              onSave={onSave}
              isAdmin={isAdmin}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SlideOverContent({ book, onClose, onSave, isAdmin }) {
  const [status, setStatus] = useState(book.status || 'unread');
  const [rating, setRating] = useState(book.rating || 0);
  const [review, setReview] = useState(book.review || '');
  const [coverUrl, setCoverUrl] = useState(book.coverUrl || '');
  const [currentPage, setCurrentPage] = useState(book.currentPage || 0);
  const [saving, setSaving] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  useEffect(() => {
    setStatus(book.status || 'unread');
    setRating(book.rating || 0);
    setReview(book.review || '');
    setCoverUrl(book.coverUrl || '');
    setCurrentPage(book.currentPage || 0);
  }, [book]);

  const handleSave = async () => {
    setSaving(true);
    // The user wants reviews tied to the WORK. 
    // We will update the current edition's user_book record, 
    // and potentially others if the logic requires syncing.
    // For now, we update the primary record passed from Books.jsx.
    await onSave(
      book.id, // work_id
      { 
        status, 
        rating: rating || null, 
        review: review.trim() || null,
        current_page: parseInt(currentPage) || 0 
      }, 
      coverUrl.trim() || null
    );
    setSaving(false);
    onClose();
  };

  const editions = book.editions || [];

  return (
    <div className="slideover-inner">
      {/* Header */}
      <div className="slideover-header">
        <button className="slideover-close" onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="slideover-cover-row">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.title} className="slideover-cover-img" />
          ) : (
            <div className="slideover-cover-placeholder" style={{ backgroundColor: book.coverColor || 'var(--bg-tertiary)' }}>
              <span>{book.title[0]}</span>
            </div>
          )}
          <div className="slideover-meta">
            <h2 className="slideover-title">{book.title}</h2>
            <p className="slideover-author">by {book.author}</p>
            {book.translator && <p className="slideover-translator">Translated by {book.translator}</p>}
            {book.genre && <span className="slideover-genre">{book.genre}</span>}
            <div className="slideover-format-pills">
              {book.formats?.map(f => (
                <span key={f} className="slideover-format-pill">{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="slideover-body">
        {/* Admin/User sync info */}
        <div className="slideover-sync-badge">
          Journaling and reviews apply to all {editions.length} editions of this work.
        </div>

        {/* Status & Progress */}
        {isAdmin && (
          <div className="slideover-section">
            <h3 className="slideover-section-label">Reading Status</h3>
            <select
              className="slideover-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {Object.entries(statusLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            
            {status === 'reading' && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <h3 className="slideover-section-label">Reading Progress</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <input
                    type="number"
                    className="slideover-input"
                    style={{ width: '80px' }}
                    value={currentPage}
                    onChange={e => setCurrentPage(e.target.value)}
                    min="0"
                    max={book.pageCount || 9999}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    of {book.pageCount || '???'} pages
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rating & Review */}
        <div className="slideover-section">
          <h3 className="slideover-section-label">The Archive Reflection</h3>
          {isAdmin ? (
            <>
              <div className="slideover-star-input">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    className={`slideover-star ${star <= (hoverRating || rating) ? 'active' : ''}`}
                    onClick={() => setRating(star === rating ? 0 : star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                className="slideover-textarea"
                rows={5}
                value={review}
                onChange={e => setReview(e.target.value)}
                placeholder="Write your thoughts on this story..."
              />
            </>
          ) : (
            <div className="slideover-public-review">
              <div className="slideover-stars-display">
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </div>
              <p className="slideover-review-text">{review || "No reflection logged yet."}</p>
            </div>
          )}
        </div>

        {/* Editions in Archive */}
        <div className="slideover-section">
          <h3 className="slideover-section-label">Editions in Archive</h3>
          <div className="slideover-editions-list">
            {editions.map((ed, i) => (
              <div key={ed.id || i} className="slideover-edition-item">
                <div className="slideover-edition-art">
                  {ed.cover_url ? (
                    <img src={ed.cover_url} alt={ed.format} />
                  ) : (
                    <div className="slideover-edition-placeholder" style={{ backgroundColor: ed.color || 'var(--bg-tertiary)' }}>
                      {ed.format?.[0] || 'E'}
                    </div>
                  )}
                </div>
                <div className="slideover-edition-info">
                  <span className="slideover-edition-format">{ed.format}</span>
                  <span className="slideover-edition-publisher">{ed.publisher || 'Unknown Publisher'}</span>
                  {ed.isbn && <span className="slideover-edition-isbn">ISBN: {ed.isbn}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cover Control */}
        {isAdmin && (
          <div className="slideover-section">
            <h3 className="slideover-section-label">Display Cover URL</h3>
            <input
              type="url"
              className="slideover-input"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              placeholder="Primary cover URL for the library grid..."
            />
          </div>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="slideover-actions">
            <button className="slideover-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Syncing to Archive...' : 'Sync Review'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


