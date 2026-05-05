import React, { useState, useEffect } from 'react';
import './NowPlaying.css';

export default function NowPlaying() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNowPlaying() {
      try {
        // This URL will be the user's Supabase Edge Function URL
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify`, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          }
        });
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Error fetching Spotify data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  const isPlaying = data?.currently_playing?.is_playing;
  const track = isPlaying ? data.currently_playing.item : data?.recently_played?.items?.[0]?.track;

  if (!track) {
    return (
      <div className="now-playing now-playing--offline">
        <div className="now-playing__icon">📡</div>
        <div className="now-playing__info">
          <span className="now-playing__status">Spotify Sync Offline</span>
          <span className="now-playing__track">Check credentials</span>
        </div>
      </div>
    );
  }

  return (
    <div className="now-playing">
      <div className="now-playing__container">
        <div className="now-playing__image">
          <img src={track.album?.images?.[0]?.url} alt={track.name} />
          {isPlaying && (
            <div className="now-playing__equalizer">
              <span className="eq-bar bar-1"></span>
              <span className="eq-bar bar-2"></span>
              <span className="eq-bar bar-3"></span>
            </div>
          )}
        </div>
        <div className="now-playing__info">
          <p className="now-playing__status">
            {isPlaying ? 'Now Playing' : 'Last Played'}
          </p>
          <a href={track.external_urls?.spotify} target="_blank" rel="noreferrer" className="now-playing__title">
            {track.name}
          </a>
          <p className="now-playing__artist">{track.artists?.[0]?.name}</p>
        </div>
      </div>
    </div>
  );
}
