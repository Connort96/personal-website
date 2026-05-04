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
    await onSave(
      book.bookId, // Use bookId for user_books table
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
            <span
              className="slideover-status-pill"
              style={{ backgroundColor: statusColors[book.status] + '22', color: statusColors[book.status] }}
            >
              {statusLabels[book.status] || 'Unread'}
            </span>
          </div>
        </div>

        {/* Edition Details (public) */}
        {(book.publisher || book.pageCount || book.isbn || book.publicationDate) && (
          <div className="slideover-edition-details">
            {book.publisher && <span>{book.publisher}</span>}
            {book.publicationDate && <span>{new Date(book.publicationDate).getFullYear()}</span>}
            {book.pageCount && <span>{book.pageCount} pages</span>}
            {book.isbn && <span className="slideover-isbn">{book.isbn}</span>}
          </div>
        )}
      </div>

      <div className="slideover-body">
        {/* Public review display (non-admin) */}
        {!isAdmin && (
          <>
            {book.rating > 0 && (
              <div className="slideover-section">
                <h3 className="slideover-section-label">Rating</h3>
                <div className="slideover-stars-display">
                  {'★'.repeat(book.rating)}{'☆'.repeat(5 - book.rating)}
                </div>
              </div>
            )}
            {book.review && (
              <div className="slideover-section">
                <h3 className="slideover-section-label">Review</h3>
                <p className="slideover-review-text">{book.review}</p>
              </div>
            )}
            {!book.review && !book.rating && (
              <p className="slideover-empty">No review written yet.</p>
            )}
          </>
        )}

        {/* Admin edit form */}
        {isAdmin && (
          <div className="slideover-section">
            <h3 className="slideover-section-label">Reading Status</h3>
            <select
              className="slideover-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="unread">Unread (Owned)</option>
              <option value="reading">Currently Reading</option>
              <option value="read">Finished Reading</option>
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

            <h3 className="slideover-section-label" style={{ marginTop: 'var(--space-5)' }}>Rating</h3>
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

            <h3 className="slideover-section-label" style={{ marginTop: 'var(--space-5)' }}>Review</h3>
            <textarea
              className="slideover-textarea"
              rows={5}
              value={review}
              onChange={e => setReview(e.target.value)}
              placeholder="Write your thoughts on this book..."
            />

            <h3 className="slideover-section-label" style={{ marginTop: 'var(--space-5)' }}>Cover Image URL</h3>
            <input
              type="url"
              className="slideover-input"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              placeholder="https://..."
            />
            {coverUrl && (
              <img src={coverUrl} alt="Preview" style={{ height: 80, marginTop: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }} />
            )}
          </div>
        )}

        {/* Editions owned (if multiple) */}
        {editions.length > 1 && (
          <div className="slideover-section">
            <h3 className="slideover-section-label">Editions Owned ({editions.length})</h3>
            <div className="slideover-editions-row">
              {editions.map((ed, i) => (
                <div key={ed.id || i} className="slideover-edition-thumb">
                  {ed.cover_url ? (
                    <img src={ed.cover_url} alt={`Edition ${i + 1}`} />
                  ) : (
                    <div className="slideover-edition-placeholder" style={{ backgroundColor: ed.color || 'var(--bg-tertiary)' }}>
                      {i + 1}
                    </div>
                  )}
                  {ed.publisher && <small>{ed.publisher}</small>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save button (admin only) */}
        {isAdmin && (
          <div className="slideover-actions">
            <button className="slideover-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


