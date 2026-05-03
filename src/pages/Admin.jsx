import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

export default function Admin() {
  const { user } = useAuth();
  const [genres, setGenres] = useState([]);
  const [formData, setFormData] = useState({
    genre_id: '',
    title: '',
    author: '',
    note: '',
    cover_url: ''
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState('');

  const handleBackfillCovers = async () => {
    if (!window.confirm("Are you sure you want to backfill 1,200 covers? This will take ~15 minutes and you must leave this page open.")) return;
    
    setBackfillStatus('Fetching missing books...');
    try {
      let allMissing = [];
      let hasMore = true;
      let from = 0;
      const limit = 1000;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('books')
          .select('id, title, author')
          .is('cover_url', null)
          .range(from, from + limit - 1);
          
        if (error) throw error;
        
        allMissing = [...allMissing, ...data];
        if (data.length < limit) hasMore = false;
        else from += limit;
      }
      
      setBackfillStatus(`Found ${allMissing.length} books. Starting backfill...`);
      
      let success = 0;
      let notFound = 0;
      
      for (let i = 0; i < allMissing.length; i++) {
        const book = allMissing[i];
        setBackfillStatus(`[${i+1}/${allMissing.length}] Processing: ${book.title}...`);
        
        try {
          const query = encodeURIComponent(`intitle:${book.title} ${book.author ? `inauthor:${book.author}` : ''}`);
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
          const apiData = await res.json();
          
          if (apiData.items && apiData.items.length > 0 && apiData.items[0].volumeInfo.imageLinks) {
            let coverUrl = apiData.items[0].volumeInfo.imageLinks.thumbnail;
            coverUrl = coverUrl.replace('http:', 'https:').replace('&edge=curl', '');
            
            await supabase.from('books').update({ cover_url: coverUrl }).eq('id', book.id);
            success++;
          } else {
            notFound++;
          }
        } catch (err) {
          console.error(err);
        }
        
        // Wait 500ms to avoid Google Rate Limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      setBackfillStatus(`Done! Successfully added ${success} covers. ${notFound} not found on Google Books.`);
    } catch (err) {
      setBackfillStatus(`Error: ${err.message}`);
    }
  };

  useEffect(() => {
    // Check if they are admin
    if (user && user.email === 'theconison96@gmail.com') {
      setIsAdmin(true);
    }
    
    // Fetch unique genres from books
    async function loadGenres() {
      const { data, error } = await supabase
        .from('books')
        .select('genre_id, genre_name, color, badge, badge_label')
        .order('genre_name');
        
      if (!error && data) {
        // De-duplicate genres
        const uniqueGenres = [];
        const seen = new Set();
        data.forEach(g => {
          if (!seen.has(g.genre_id)) {
            seen.add(g.genre_id);
            uniqueGenres.push(g);
          }
        });
        setGenres(uniqueGenres);
      }
    }
    loadGenres();
  }, [user]);

  const handleAutoFetchCover = async (e) => {
    e.preventDefault();
    if (!formData.title) {
      setStatus({ type: 'error', message: 'Please enter a title to search for a cover.' });
      return;
    }
    
    setLoading(true);
    setStatus({ type: '', message: 'Searching Google Books for cover...' });
    
    try {
      const query = encodeURIComponent(`intitle:${formData.title} ${formData.author ? `inauthor:${formData.author}` : ''}`);
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
      const data = await res.json();
      
      if (data.items && data.items.length > 0 && data.items[0].volumeInfo.imageLinks) {
        let coverUrl = data.items[0].volumeInfo.imageLinks.thumbnail;
        coverUrl = coverUrl.replace('http:', 'https:').replace('&edge=curl', ''); // remove edge curl if present
        
        setFormData(prev => ({ ...prev, cover_url: coverUrl }));
        setStatus({ type: 'success', message: 'Cover found successfully!' });
      } else {
        setStatus({ type: 'error', message: 'Could not find a cover image for this book.' });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Error communicating with Google Books API.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.genre_id || !formData.title || !formData.author) {
      setStatus({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      // 1. Get genre metadata and calculate next book_index
      const { data: genreBooks, error: fetchError } = await supabase
        .from('books')
        .select('book_index, color, badge, badge_label, genre_name')
        .eq('genre_id', formData.genre_id)
        .order('book_index', { ascending: false });

      if (fetchError) throw fetchError;
      
      if (!genreBooks || genreBooks.length === 0) {
        throw new Error('Selected genre does not exist in database.');
      }

      // Max index is the first one since we ordered descending
      const nextIndex = genreBooks[0].book_index + 1;
      const genreMeta = genreBooks[0];

      // 2. Insert into books table
      // Let the database handle the ID generation because we reset the sequence!
      const { error: insertError } = await supabase
        .from('books')
        .insert({
          genre_id: formData.genre_id,
          genre_name: genreMeta.genre_name,
          color: genreMeta.color,
          badge: genreMeta.badge,
          badge_label: genreMeta.badge_label,
          book_index: nextIndex,
          title: formData.title,
          author: formData.author,
          note: formData.note || null,
          cover_url: formData.cover_url || null
        });

      if (insertError) throw insertError;

      setStatus({ type: 'success', message: `Successfully added "${formData.title}" to the catalog!` });
      setFormData({ ...formData, title: '', author: '', note: '', cover_url: '' }); // Clear text inputs
      
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Failed to add book.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (!user) {
    return <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>Please log in to access this page.</div>;
  }

  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
        <h1 className="page-header__title">Unauthorized</h1>
        <p>You do not have permission to view the admin dashboard.</p>
      </div>
    );
  }

  return (
    <div className="admin-page container container--narrow animate-fade-in">
      <header className="page-header">
        <h1 className="page-header__title">Admin Dashboard</h1>
        <p className="page-header__subtitle">Add new books to the global catalog.</p>
        
        <div style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: 'var(--space-2)' }}>Bulk Cover Backfill</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Automatically ping the Google Books API to find and download covers for all 1,200+ books in your library that don't have one yet.
          </p>
          <button 
            type="button"
            className="btn-cancel" 
            onClick={(e) => {
              e.preventDefault();
              handleBackfillCovers();
            }}
            style={{ background: 'var(--bg-primary)' }}
          >
            Start Backfill Migration
          </button>
          {backfillStatus && (
            <p style={{ marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent-secondary)' }}>
              {backfillStatus}
            </p>
          )}
        </div>
      </header>

      <div className="admin-card">
        <form className="admin-form" onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label htmlFor="genre_id">Genre/Category *</label>
            <select 
              id="genre_id" 
              name="genre_id" 
              value={formData.genre_id} 
              onChange={handleChange}
              required
            >
              <option value="">Select a Category...</option>
              {genres.map(g => (
                <option key={g.genre_id} value={g.genre_id}>
                  {g.genre_name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="title">Book Title *</label>
            <input 
              type="text" 
              id="title" 
              name="title" 
              value={formData.title} 
              onChange={handleChange}
              placeholder="e.g. Moby Dick"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="author">Author *</label>
            <input 
              type="text" 
              id="author" 
              name="author" 
              value={formData.author} 
              onChange={handleChange}
              placeholder="e.g. Herman Melville"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="note">Notes (Optional)</label>
            <textarea 
              id="note" 
              name="note" 
              value={formData.note} 
              onChange={handleChange}
              placeholder="Any quick thoughts or reviews..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="cover_url">Cover Image URL (Optional)</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input 
                type="url" 
                id="cover_url" 
                name="cover_url" 
                value={formData.cover_url} 
                onChange={handleChange}
                placeholder="https://..."
                style={{ flex: 1 }}
              />
              <button 
                type="button"
                className="btn-cancel"
                onClick={handleAutoFetchCover}
                disabled={loading || !formData.title}
                style={{ whiteSpace: 'nowrap', marginTop: 0 }}
              >
                ✨ Auto-Fetch
              </button>
            </div>
            {formData.cover_url && (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <img src={formData.cover_url} alt="Cover Preview" style={{ height: '100px', borderRadius: 'var(--radius-sm)' }} />
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="admin-submit-btn"
            disabled={loading}
          >
            {loading ? 'Adding Book...' : 'Add to Catalog'}
          </button>

        </form>
        
        {status.message && (
          <div className={`admin-message ${status.type}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
