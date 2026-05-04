import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NowPlaying from '../components/NowPlaying';
import TopArtists from '../components/TopArtists';
import Image from '../components/Image';
import './Music.css';

export default function Music() {
  const [spotifyData, setSpotifyData] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch Spotify data from Edge Function
        const spotifyRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify`, {
          headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
        });
        const spotifyJson = await spotifyRes.json();
        setSpotifyData(spotifyJson);

        // Fetch featured music from Supabase
        const { data: featuredData, error } = await supabase
          .from('featured_music')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setFeatured(featuredData || []);
      } catch (err) {
        console.error('Error loading music data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const openPlaylist = (item) => {
    if (item.type === 'playlist') {
      setSelectedPlaylist(item.spotify_id);
    } else {
      window.open(`https://open.spotify.com/album/${item.spotify_id}`, '_blank');
    }
  };

  return (
    <div className="music-page">
      <div className="container">
        <header className="page-header animate-fade-in-up">
          <div className="page-header__now">
            <NowPlaying />
          </div>
          <h1 className="page-header__title">Music</h1>
          <p className="page-header__subtitle">
            Curated rotations, top stats, and the soundtracks of my life.
          </p>
        </header>

        {loading ? (
          <div className="music-loading">Loading sounds...</div>
        ) : (
          <>
            <TopArtists artists={spotifyData?.top_artists?.items} />

            <section className="music-featured animate-fade-in-up">
              <h2 className="section-title">Featured Rotation</h2>
              <div className="music-grid">
                {featured.map((item, i) => (
                  <div 
                    key={item.id} 
                    className="music-card" 
                    onClick={() => openPlaylist(item)}
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="music-card__cover-wrapper">
                      <Image src={item.cover_url} alt={item.title} className="music-card__cover" />
                      <div className="music-card__overlay">
                        <span className="play-icon">▶</span>
                      </div>
                    </div>
                    <div className="music-card__info">
                      <h3 className="music-card__title">{item.title}</h3>
                      <p className="music-card__artist">{item.artist}</p>
                      <span className="music-card__type">{item.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Playlist Modal */}
      {selectedPlaylist && (
        <div className="playlist-modal" onClick={() => setSelectedPlaylist(null)}>
          <div className="playlist-modal__content" onClick={e => e.stopPropagation()}>
            <button className="playlist-modal__close" onClick={() => setSelectedPlaylist(null)}>&times;</button>
            <iframe 
              src={`https://open.spotify.com/embed/playlist/${selectedPlaylist}?utm_source=generator&theme=0`} 
              width="100%" 
              height="480" 
              frameBorder="0" 
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
              loading="lazy"
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
}
