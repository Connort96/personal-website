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
      // We use the Edge Function to get metadata
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify?id=${spotifyId}&type=${type}`, {
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
      });
      
      const meta = await res.json();
      if (meta.error) throw new Error(meta.error);

      const { error } = await supabase.from('featured_music').insert([{
        spotify_id: spotifyId,
        type,
        title: meta.title,
        artist: meta.artist,
        cover_url: meta.cover_url
      }]);

      if (error) throw error;
      setStatus({ type: 'success', message: `Featured "${meta.title}" successfully!` });
      setSpotifyId('');
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to feature music. Make sure the Edge Function is deployed and the Spotify ID is correct.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-sub-tab-container">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-group">
          <label>Spotify ID / URI</label>
          <input 
            type="text" 
            value={spotifyId} 
            onChange={(e) => setSpotifyId(e.target.value.split(':').pop())} 
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
