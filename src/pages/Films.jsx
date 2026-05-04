import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Image from '../components/Image';
import './Films.css';

export default function Films() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFilms() {
      try {
        const { data, error } = await supabase
          .from('user_films')
          .select(`
            *,
            films ( title, director, release_year, poster_url, backdrop_url )
          `)
          .order('watched_at', { ascending: false });

        if (error) throw error;
        setFilms(data || []);
      } catch (err) {
        console.error('Error fetching films:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchFilms();
  }, []);

  if (loading) {
    return <div className="container" style={{ padding: '4rem 0' }}>Loading films...</div>;
  }

  return (
    <div className="films-page animate-fade-in">
      <div className="container">
        <header className="page-header">
          <h1 className="page-header__title">Films</h1>
          <p className="page-header__subtitle">Movies I've watched and loved.</p>
        </header>

        {films.length === 0 ? (
          <p className="films-empty">No films recorded yet.</p>
        ) : (
          <div className="films-grid">
            {films.map((entry, i) => {
              const film = entry.films;
              const delay = Math.min(i * 0.05, 0.5);
              return (
                <div 
                  key={entry.id} 
                  className="film-card animate-fade-in-up"
                  style={{ animationDelay: `${delay}s` }}
                >
                  <div className="film-card__poster-wrapper">
                    {film.poster_url ? (
                      <Image 
                        src={film.poster_url} 
                        alt={film.title} 
                        className="film-card__poster"
                      />
                    ) : (
                      <div className="film-card__poster-placeholder">
                        {film.title[0]}
                      </div>
                    )}
                    {entry.rating && (
                      <div className="film-card__rating">
                        {'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}
                      </div>
                    )}
                  </div>
                  <div className="film-card__info">
                    <h2 className="film-card__title">{film.title}</h2>
                    <p className="film-card__meta">
                      {film.release_year} · Dir. {film.director}
                    </p>
                    {entry.review && (
                      <p className="film-card__review">"{entry.review}"</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
