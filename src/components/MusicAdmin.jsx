import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function MusicAdmin() {
  const [spotifyId, setSpotifyId] = useState('');
  const [type, setType] = useState('album');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!spotifyId) return;
    setLoading(true);
    setStatus({ type: '', message: 'Fetching metadata from Spotify...' });

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify?id=${spotifyId}&type=${type}`, {
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
      });
      
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP Error ${res.status}`);
      }

      const { error } = await supabase.from('featured_music').insert([{
        spotify_id: spotifyId,
        type,
        title: data.title,
        artist: data.artist,
        cover_url: data.cover_url
      }]);

      if (error) throw error;
      setStatus({ type: 'success', message: `Featured "${data.title}" successfully!` });
      setSpotifyId('');
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: `Error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleIdChange = (val) => {
    // Robust parsing for IDs, URIs, and URLs
    let id = val.trim();
    if (id.includes('spotify.com/')) {
      id = id.split('/').pop().split('?')[0];
    } else if (id.includes('spotify:')) {
      id = id.split(':').pop();
    }
    setSpotifyId(id);
  };

  return (
    <div className="admin-sub-tab-container">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-group">
          <label>Spotify ID / URI</label>
          <input 
            type="text" 
            value={spotifyId} 
            onChange={(e) => handleIdChange(e.target.value)} 
            placeholder="e.g. 4aawyAB9vmqN3u97EE7Z9y"
            required 
          />
          <p className="form-help">Paste the Spotify ID or URI (from Share -&gt; Copy Spotify URI).</p>
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="album">Album</option>
            <option value="playlist">Playlist</option>
          </select>
        </div>
        <button type="submit" className="admin-submit-btn" disabled={loading}>
          {loading ? 'Processing...' : 'Feature on Music Page'}
        </button>
        {status.message && <div className={`admin-message ${status.type}`}>{status.message}</div>}
      </form>
    </div>
  );
}
