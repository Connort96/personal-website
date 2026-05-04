import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function GearAdmin() {
  const [form, setForm] = useState({ name: '', category: '', description: '', image_url: '', link: '' });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const { error } = await supabase.from('gear').insert([form]);
      if (error) throw error;
      setStatus({ type: 'success', message: 'Gear added successfully.' });
      setForm({ name: '', category: '', description: '', image_url: '', link: '' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-sub-tab-container">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-row">
          <div className="form-group">
            <label>Item Name *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Category</label>
            <input type="text" name="category" value={form.category} onChange={handleChange} placeholder="e.g. Photography" />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input type="text" name="description" value={form.description} onChange={handleChange} />
        </div>
        <div className="admin-form-row">
          <div className="form-group">
            <label>Image URL</label>
            <input type="url" name="image_url" value={form.image_url} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Link</label>
            <input type="url" name="link" value={form.link} onChange={handleChange} />
          </div>
        </div>
        <button type="submit" className="admin-submit-btn" disabled={loading}>
          {loading ? 'Adding...' : 'Add Gear'}
        </button>
        {status.message && <div className={`admin-message ${status.type}`}>{status.message}</div>}
      </form>
    </div>
  );
}
