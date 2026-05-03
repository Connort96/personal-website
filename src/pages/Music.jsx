import { useState } from 'react';
import CollectionCard from '../components/CollectionCard';
import { albums } from '../data/music';
import './Music.css';

export default function Music() {
  const genres = ['All', ...new Set(albums.map(a => a.genre))];
  const [activeGenre, setActiveGenre] = useState('All');

  const filtered = activeGenre === 'All'
    ? albums
    : albums.filter(a => a.genre === activeGenre);

  return (
    <div className="music-page">
      <div className="container">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">Music Collection</h1>
          <p className="page-header__subtitle">
            Albums that shaped my listening. Each one has a story.
          </p>
        </header>

        <div className="music-filters animate-fade-in-up animate-stagger-2" id="music-filters">
          {genres.map(genre => (
            <button
              key={genre}
              className={`music-filter ${activeGenre === genre ? 'music-filter--active' : ''}`}
              onClick={() => setActiveGenre(genre)}
              id={`filter-${genre.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {genre}
              {genre !== 'All' && (
                <span className="music-filter__count">
                  {albums.filter(a => a.genre === genre).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="music-stats animate-fade-in-up animate-stagger-3">
          <div className="music-stat">
            <span className="music-stat__number">{filtered.length}</span>
            <span className="music-stat__label">{filtered.length === 1 ? 'Album' : 'Albums'}</span>
          </div>
          <div className="music-stat">
            <span className="music-stat__number">
              {filtered.reduce((sum, a) => sum + (a.tracks?.length || 0), 0)}
            </span>
            <span className="music-stat__label">Tracks</span>
          </div>
          <div className="music-stat">
            <span className="music-stat__number">
              {new Set(filtered.map(a => a.artist)).size}
            </span>
            <span className="music-stat__label">{new Set(filtered.map(a => a.artist)).size === 1 ? 'Artist' : 'Artists'}</span>
          </div>
        </div>

        <div className="music-grid" id="music-grid">
          {filtered.map((album, i) => (
            <CollectionCard
              key={album.id}
              title={album.title}
              subtitle={album.artist}
              year={album.year}
              genre={album.genre}
              rating={album.rating}
              coverColor={album.coverColor}
              notes={album.notes}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
