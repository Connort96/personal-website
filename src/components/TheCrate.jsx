import React from 'react';
import { motion } from 'framer-motion';
import './TheCrate.css';

export default function TheCrate({ playlists }) {
  if (!playlists || playlists.length === 0) return null;

  return (
    <section className="the-crate">
      <h2 className="section-title">The Crate</h2>
      <div className="crate-grid">
        {playlists.map((playlist, i) => (
          <motion.div 
            key={playlist.id} 
            className="crate-item"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="record-stack">
              <div className="record-vinyl">
                <div className="vinyl-center"></div>
              </div>
              <div className="record-sleeve">
                <img src={playlist.images?.[0]?.url} alt={playlist.name} />
              </div>
            </div>
            <div className="playlist-meta">
              <h3 className="playlist-name">{playlist.name}</h3>
              <p className="playlist-description" dangerouslySetInnerHTML={{ __html: playlist.description }}></p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
