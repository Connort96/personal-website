import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './FilmsAdmin.css';

export default function FilmsAdmin() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, review: '' });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);

  const searchTMDB = async (e) => {
    e.preventDefault();
    if (!query) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN}`
        }
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'TMDB search failed.' });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectFilm = async (film) => {
    setSelectedFilm(film);
    setReviewForm({ rating: 0, review: '' });
    setStatus({ type: '', message: '' });
  };

  const handleSave = async () => {
    if (!selectedFilm || !user) return;
    setSaving(true);
    setStatus({ type: '', message: '' });

    try {
      // 1. Upsert film into `films` table
      const { data: filmData, error: filmError } = await supabase
        .from('films')
        .upsert({
          tmdb_id: selectedFilm.id,
          title: selectedFilm.title,
          release_year: selectedFilm.release_date ? parseInt(selectedFilm.release_date.substring(0, 4)) : null,
          poster_url: selectedFilm.poster_path ? `https://image.tmdb.org/t/p/w500${selectedFilm.poster_path}` : null,
          backdrop_url: selectedFilm.backdrop_path ? `https://image.tmdb.org/t/p/w1280${selectedFilm.backdrop_path}` : null,
        }, { onConflict: 'tmdb_id' })
        .select()
        .single();

      if (filmError) throw filmError;

      // 2. Insert into `user_films`
      const { error: userFilmError } = await supabase
        .from('user_films')
        .insert({
          film_id: filmData.id,
          user_id: user.id, // Note: must match auth.users id
          rating: reviewForm.rating > 0 ? reviewForm.rating : null,
          review: reviewForm.review || null,
        });

      if (userFilmError) throw userFilmError;

      setStatus({ type: 'success', message: `Added "${selectedFilm.title}" to your films.` });
      setSelectedFilm(null);
      setQuery('');
      setResults([]);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-sub-tab-container films-admin">
      {!selectedFilm ? (
        <>
          <form onSubmit={searchTMDB} className="films-search-form">
            <input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Search movies on TMDB..." 
            />
            <button type="submit" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {results.length > 0 && (
            <div className="films-results">
              {results.map(film => (
                <div key={film.id} className="film-result-card" onClick={() => handleSelectFilm(film)}>
                  {film.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w200${film.poster_path}`} alt={film.title} />
                  ) : (
                    <div className="film-result-placeholder">No Image</div>
                  )}
                  <div className="film-result-info">
                    <h4>{film.title}</h4>
                    <p>{film.release_date ? film.release_date.substring(0,4) : 'Unknown Year'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="film-review-form">
          <button className="btn-cancel" onClick={() => setSelectedFilm(null)}>← Back to search</button>
          
          <div className="film-review-header">
            {selectedFilm.poster_path && (
              <img src={`https://image.tmdb.org/t/p/w200${selectedFilm.poster_path}`} alt={selectedFilm.title} />
            )}
            <div>
              <h3>{selectedFilm.title}</h3>
              <p>{selectedFilm.release_date}</p>
            </div>
          </div>

          <div className="admin-form">
            <div className="form-group">
              <label>Rating (1-5)</label>
              <input 
                type="number" 
                min="0" max="5" 
                value={reviewForm.rating} 
                onChange={(e) => setReviewForm({...reviewForm, rating: parseInt(e.target.value)})} 
              />
            </div>
            <div className="form-group">
              <label>Review (Optional)</label>
              <textarea 
                rows="4" 
                value={reviewForm.review} 
                onChange={(e) => setReviewForm({...reviewForm, review: e.target.value})} 
              />
            </div>
            <button className="admin-submit-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Add to collection'}
            </button>
          </div>
        </div>
      )}
      {status.message && <div className={`admin-message ${status.type}`} style={{marginTop: 'var(--space-4)'}}>{status.message}</div>}
    </div>
  );
}
