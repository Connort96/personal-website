import React from 'react';
import './TopArtists.css';

export default function TopArtists({ artists }) {
  if (!artists || artists.length === 0) return null;

  return (
    <div className="top-artists">
      <h2 className="section-title">Heavy Rotation</h2>
      <div className="top-artists__grid">
        {artists.slice(0, 10).map((artist, i) => (
          <div key={artist.id} className="artist-vinyl-card" style={{ '--delay': `${i * 0.1}s` }}>
            <div className="vinyl-wrapper">
              <div className="vinyl-grooves"></div>
              <img src={artist.images?.[0]?.url} alt={artist.name} className="artist-photo" />
            </div>
            <div className="artist-info">
              <span className="artist-rank">#{i + 1}</span>
              <h3 className="artist-name">{artist.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
