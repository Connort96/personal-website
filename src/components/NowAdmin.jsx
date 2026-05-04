import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NowAdmin() {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content) return;
    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const { error } = await supabase.from('status').insert([{ content }]);
      if (error) throw error;
      setStatus({ type: 'success', message: 'Status updated successfully.' });
      setContent('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-sub-tab-container">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-group">
          <label>Current Status</label>
          <textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            rows="4" 
            placeholder="What are you focused on right now?"
            required 
          />
        </div>
        <button type="submit" className="admin-submit-btn" disabled={loading}>
          {loading ? 'Posting...' : 'Post Status'}
        </button>
        {status.message && <div className={`admin-message ${status.type}`}>{status.message}</div>}
      </form>
    </div>
  );
}
