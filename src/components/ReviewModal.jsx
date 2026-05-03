import React, { useState, useEffect } from 'react';
import './ReviewModal.css';

export default function ReviewModal({ book, isOpen, onClose, onSave }) {
  const [status, setStatus] = useState('unread');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) {
      setStatus(book.status || 'unread');
      setRating(book.rating || 0);
      setReview(book.review || '');
      setCoverUrl(book.coverUrl || '');
    }
  }, [book]);

  if (!isOpen || !book) return null;

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      book.id, 
      {
        status,
        rating: rating > 0 ? rating : null,
        review: review.trim() || null
      },
      coverUrl.trim() || null
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fade-in-up" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        
        <div className="modal-header">
          <h2 className="modal-title">{book.title}</h2>
          <p className="modal-author">by {book.author}</p>
        </div>

        <div className="modal-form">
          <div className="form-group">
            <label>Reading Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="unread">Unread (Owned)</option>
              <option value="reading">Currently Reading</option>
              <option value="read">Finished Reading</option>
            </select>
          </div>

          <div className="form-group">
            <label>Your Rating</label>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <span 
                  key={star}
                  className={`star ${star <= rating ? 'active' : ''}`}
                  onClick={() => setRating(star === rating ? 0 : star)}
                >
                  ★
                </span>
              ))}
            </div>
            <small style={{ color: 'var(--text-muted)' }}>Click a star to rate, click again to clear</small>
          </div>

          <div className="form-group">
            <label>Your Review & Thoughts</label>
            <textarea 
              rows={4} 
              value={review} 
              onChange={e => setReview(e.target.value)}
              placeholder="What did you think of this book? Write your personal notes here..."
            />
          </div>

          <div className="form-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            <label>Global Cover Image URL</label>
            <input 
              type="url" 
              value={coverUrl} 
              onChange={e => setCoverUrl(e.target.value)}
              placeholder="Paste image address here..."
            />
            <small style={{ color: 'var(--text-muted)' }}>Optional: Updating this attaches a cover image to the global catalog.</small>
          </div>

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
