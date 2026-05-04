import React from 'react';
import { motion } from 'framer-motion';
import './ListeningLog.css';

export default function ListeningLog({ tracks }) {
  if (!tracks || tracks.length === 0) return null;

  const formatTime = (isoString) => {
    const diff = new Date() - new Date(isoString);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <section className="listening-log">
      <h2 className="section-title--left">Listening Log</h2>
      <div className="listening-log__list">
        {tracks.map((item, i) => (
          <motion.div 
            key={item.played_at + i} 
            className="log-item"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="log-item__image">
              <img src={item.track.album?.images?.[0]?.url} alt={item.track.name} />
            </div>
            <div className="log-item__info">
              <div className="log-item__main">
                <span className="log-item__title">{item.track.name}</span>
                <span className="log-item__artist">{item.track.artists?.[0]?.name}</span>
              </div>
              <span className="log-item__time">{formatTime(item.played_at)}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
