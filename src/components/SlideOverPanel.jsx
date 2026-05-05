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
  const [editingEditionId, setEditingEditionId] = useState(null);
  const [editionEdits, setEditionEdits] = useState({});

  useEffect(() => {
    setStatus(book.status || 'unread');
    setRating(book.rating || 0);
    setReview(book.review || '');
    setCoverUrl(book.coverUrl || '');
    setCurrentPage(book.currentPage || 0);
    setEditingEditionId(null);
    setEditionEdits({});
  }, [book]);

  const fetchISBNImage = async (editionId, isbn) => {
    if (!isbn) return;
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
    const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;
    
    // Test if image exists (Open Library returns a small placeholder if not found)
    // For now, we'll just set it.
    handleEditionChange(editionId, 'cover_image_url', url);
  };

  const handleEditionChange = (id, field, value) => {
    setEditionEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    
    // 1. Save global review/rating
    await onSave(
      book.id,
      { 
        status, 
        rating: rating || null, 
        review: review.trim() || null,
        current_page: parseInt(currentPage) || 0 
      }, 
      coverUrl.trim() || null
    );

    // 2. Save individual edition edits
    for (const [id, updates] of Object.entries(editionEdits)) {
      await supabase.from('editions').update(updates).eq('id', id);
    }

    setSaving(false);
    onClose();
  };

  const editions = book.editions || [];
  const progressPct = book.pageCount ? ((currentPage / book.pageCount) * 100).toFixed(2) : 0;

  return (
    <div className="slideover-inner">
      {/* Header */}
      <div className="slideover-header">
        <button className="slideover-close" onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <h1 className="slideover-parent-title">{book.title}</h1>
        <p className="slideover-author">by {book.author}</p>
      </div>

      <div className="slideover-body">
        {/* Progress Stat */}
        {status === 'reading' && (
          <div className="slideover-progress-stat">
            <div className="stat-row">
              <span className="stat-label">Reading Progress</span>
              <span className="stat-value">{progressPct}% Complete</span>
            </div>
            <div className="stat-bar">
              <div className="stat-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Global Review Section */}
        {isAdmin && (
          <div className="slideover-section">
            <h3 className="slideover-section-label">Archive Reflection</h3>
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
              rows={4}
              value={review}
              onChange={e => setReview(e.target.value)}
              placeholder="Your long-form thoughts on this story..."
            />
          </div>
        )}

        {/* Editions in Archive */}
        <div className="slideover-section">
          <h3 className="slideover-section-label">Editions in Archive</h3>
          <div className="slideover-editions-list">
            {editions.map((ed) => {
              const edits = editionEdits[ed.id] || {};
              const isEditing = editingEditionId === ed.id;
              const displayCover = edits.cover_image_url || ed.cover_image_url || ed.cover_url;

              return (
                <div key={ed.id} className={`edition-card ${isEditing ? 'editing' : ''}`}>
                  <div className="edition-card-main">
                    <div className="edition-card-art">
                      {displayCover ? (
                        <img src={displayCover} alt={ed.format} />
                      ) : (
                        <div className="edition-art-placeholder">{ed.format?.[0]}</div>
                      )}
                    </div>
                    
                    <div className="edition-card-content">
                      <div className="edition-card-top">
                        <span className="edition-publisher">{edits.publisher || ed.publisher || 'Publisher Unknown'}</span>
                        <button 
                          className="edition-edit-trigger"
                          onClick={() => setEditingEditionId(isEditing ? null : ed.id)}
                        >
                          {isEditing ? 'Close' : 'Edit'}
                        </button>
                      </div>
                      
                      <div className="edition-card-meta">
                        <span className="edition-format-tag">{edits.format || ed.format}</span>
                        <span className="edition-mono">{edits.publication_year || ed.publication_year || 'Year?'}</span>
                        <span className="edition-mono">{edits.isbn || ed.isbn || 'No ISBN'}</span>
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <motion.div 
                      className="edition-edit-form"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                    >
                      <div className="form-row">
                        <div className="form-group">
                          <label>Publisher</label>
                          <input 
                            type="text" 
                            value={edits.publisher || ed.publisher || ''} 
                            onChange={e => handleEditionChange(ed.id, 'publisher', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Format</label>
                          <select 
                            value={edits.format || ed.format || ''} 
                            onChange={e => handleEditionChange(ed.id, 'format', e.target.value)}
                          >
                            <option value="Hardcover">Hardcover</option>
                            <option value="Paperback">Paperback</option>
                            <option value="Audiobook">Audiobook</option>
                            <option value="Digital">Digital</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="form-row">
                        <div className="form-group">
                          <label>ISBN</label>
                          <div className="isbn-input-wrapper">
                            <input 
                              type="text" 
                              value={edits.isbn || ed.isbn || ''} 
                              onChange={e => handleEditionChange(ed.id, 'isbn', e.target.value)}
                            />
                            <button 
                              className="isbn-fetch-btn"
                              onClick={() => fetchISBNImage(ed.id, edits.isbn || ed.isbn)}
                            >
                              Fetch Art
                            </button>
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Year</label>
                          <input 
                            type="text" 
                            value={edits.publication_year || ed.publication_year || ''} 
                            onChange={e => handleEditionChange(ed.id, 'publication_year', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Specific Cover Image URL</label>
                        <input 
                          type="text" 
                          value={edits.cover_image_url || ed.cover_image_url || ''} 
                          onChange={e => handleEditionChange(ed.id, 'cover_image_url', e.target.value)}
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Controls */}
        {isAdmin && (
          <div className="slideover-actions">
            <button className="slideover-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Syncing Archive...' : 'Save All Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


