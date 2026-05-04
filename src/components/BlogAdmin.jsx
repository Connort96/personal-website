import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import TipTapEditor from './TipTapEditor';
import './BlogAdmin.css';

export default function BlogAdmin() {
  const emptyForm = {
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featured_image: '',
    work_id: '',
  };

  const [formData, setFormData] = useState(emptyForm);
  const [works, setWorks] = useState([]);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadWorks() {
      const { data, error } = await supabase
        .from('works')
        .select('id, title, author')
        .order('title');
      if (!error && data) {
        setWorks(data);
      }
    }
    loadWorks();
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const generateSlug = () => {
    if (formData.title) {
      const slug = formData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleEditorChange = (html) => {
    setFormData(prev => ({ ...prev, content: html }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `featured/${fileName}`;

      setStatus({ type: '', message: 'Uploading image...' });

      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      
      setFormData(prev => ({ ...prev, featured_image: data.publicUrl }));
      setStatus({ type: 'success', message: 'Featured image uploaded.' });
    } catch (err) {
      setStatus({ type: 'error', message: 'Image upload failed: ' + err.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.slug || !formData.content) {
      setStatus({ type: 'error', message: 'Title, Slug, and Content are required.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        excerpt: formData.excerpt || null,
        content: formData.content,
        featured_image: formData.featured_image || null,
        work_id: formData.work_id ? parseInt(formData.work_id) : null,
      };

      const { error } = await supabase.from('posts').insert(payload);
      if (error) {
        if (error.code === '23505') {
          throw new Error('A post with this slug already exists.');
        }
        throw error;
      }

      setStatus({ type: 'success', message: `Post "${formData.title}" published successfully!` });
      setFormData(emptyForm);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="blog-admin">
      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-group">
          <label htmlFor="title">Post Title *</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            onBlur={generateSlug}
            placeholder="e.g. My Thoughts on The Overstory"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="slug">Slug (URL) *</label>
          <input
            type="text"
            id="slug"
            name="slug"
            value={formData.slug}
            onChange={handleChange}
            placeholder="e.g. thoughts-on-overstory"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="excerpt">Excerpt</label>
          <textarea
            id="excerpt"
            name="excerpt"
            value={formData.excerpt}
            onChange={handleChange}
            placeholder="A short summary of the post..."
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Post Content *</label>
          <TipTapEditor content={formData.content} onChange={handleEditorChange} />
        </div>

        <div className="form-group">
          <label htmlFor="work_id">Link a Book (Optional)</label>
          <select id="work_id" name="work_id" value={formData.work_id} onChange={handleChange}>
            <option value="">-- No book linked --</option>
            {works.map(w => (
              <option key={w.id} value={w.id}>{w.title} (by {w.author})</option>
            ))}
          </select>
          <p className="form-help">If selected, the book's cover and details will be appended to the bottom of the post.</p>
        </div>

        <div className="form-group">
          <label>Featured Image</label>
          <div className="featured-image-upload">
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            {formData.featured_image && (
              <img src={formData.featured_image} alt="Featured" className="featured-preview" />
            )}
          </div>
        </div>

        <button type="submit" className="admin-submit-btn" disabled={loading}>
          {loading ? 'Publishing...' : 'Publish Post'}
        </button>
      </form>

      {status.message && (
        <div className={`admin-message ${status.type}`}>{status.message}</div>
      )}
    </div>
  );
}
