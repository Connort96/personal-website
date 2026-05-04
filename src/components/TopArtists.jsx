import React from 'react';
import { motion } from 'framer-motion';
import './TopArtists.css';

export default function TopArtists({ artists }) {
  if (!artists || artists.length === 0) return null;

  return (
    <div className="top-artists">
      <h2 className="section-title">Heavy Rotation</h2>
      <div className="top-artists__bento">
        {artists.slice(0, 10).map((artist, i) => {
          const isLarge = i === 0;
          return (
            <motion.div 
              key={artist.id} 
              className={`artist-bento-card ${isLarge ? 'card--large' : 'card--small'}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ 
                scale: 1.02, 
                rotateY: isLarge ? 5 : 10,
                rotateX: isLarge ? -2 : -5,
                boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
              }}
            >
              <div className="vinyl-wrapper">
                <div className="vinyl-grooves"></div>
                <img src={artist.images?.[0]?.url} alt={artist.name} className="artist-photo" />
                <div className="artist-overlay">
                  <span className="artist-rank">#{i + 1}</span>
                  <h3 className="artist-name">{artist.name}</h3>
                  {isLarge && artist.genres && (
                    <p className="artist-genre">{artist.genres.slice(0, 2).join(', ')}</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
