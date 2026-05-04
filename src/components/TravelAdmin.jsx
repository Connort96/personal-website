import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import './AdminTabs.css';

export default function TravelAdmin() {
  const [trips, setTrips] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('trip'); // 'trip' | 'photo'

  // Trip form
  const [tripForm, setTripForm] = useState({ title: '', slug: '', location: '', start_date: '', end_date: '', notes: '' });
  const [tripStatus, setTripStatus] = useState({ type: '', message: '' });

  // Photo form
  const [photoForm, setPhotoForm] = useState({ trip_id: '', caption: '', file: null });
  const [photoStatus, setPhotoStatus] = useState({ type: '', message: '' });
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    fetchTrips();
  }, []);

  async function fetchTrips() {
    const { data } = await supabase.from('trips').select('*').order('start_date', { ascending: false });
    if (data) setTrips(data);
  }

  const handleTripChange = (e) => setTripForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  
  const generateSlug = () => {
    if (tripForm.title) {
      const slug = tripForm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setTripForm(prev => ({ ...prev, slug }));
    }
  };

  const handleTripSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('trips').insert([tripForm]);
      if (error) throw error;
      setTripStatus({ type: 'success', message: 'Trip added successfully.' });
      setTripForm({ title: '', slug: '', location: '', start_date: '', end_date: '', notes: '' });
      fetchTrips();
    } catch (err) {
      setTripStatus({ type: 'error', message: err.message });
    }
  };

  const handlePhotoSubmit = async (e) => {
    e.preventDefault();
    if (!photoForm.file || !photoForm.trip_id) return;
    setPhotoLoading(true);
    setPhotoStatus({ type: '', message: 'Compressing image to WebP...' });

    try {
      // 1. Compress image to WebP and resize to max 1600px width
      const { file: webpFile, width, height } = await compressImage(photoForm.file, 1600, 0.8);
      
      setPhotoStatus({ type: '', message: 'Uploading WebP image...' });
      
      // 2. Upload to Supabase Storage
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage.from('travel-images').upload(fileName, webpFile);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('travel-images').getPublicUrl(fileName);

      // 3. Insert into DB
      const { error: dbError } = await supabase.from('trip_photos').insert([{
        trip_id: photoForm.trip_id,
        url: data.publicUrl,
        caption: photoForm.caption,
        width,
        height
      }]);
      if (dbError) throw dbError;

      setPhotoStatus({ type: 'success', message: 'Photo uploaded successfully!' });
      setPhotoForm({ ...photoForm, file: null, caption: '' });
    } catch (err) {
      setPhotoStatus({ type: 'error', message: err.message });
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <div className="admin-sub-tab-container">
      <div className="admin-sub-tabs">
        <button className={activeSubTab === 'trip' ? 'active' : ''} onClick={() => setActiveSubTab('trip')}>Add Trip</button>
        <button className={activeSubTab === 'photo' ? 'active' : ''} onClick={() => setActiveSubTab('photo')}>Add Photo</button>
      </div>

      {activeSubTab === 'trip' && (
        <form onSubmit={handleTripSubmit} className="admin-form">
          <div className="form-group">
            <label>Title</label>
            <input type="text" name="title" value={tripForm.title} onChange={handleTripChange} onBlur={generateSlug} required />
          </div>
          <div className="form-group">
            <label>Slug</label>
            <input type="text" name="slug" value={tripForm.slug} onChange={handleTripChange} required />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input type="text" name="location" value={tripForm.location} onChange={handleTripChange} />
          </div>
          <div className="admin-form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" name="start_date" value={tripForm.start_date} onChange={handleTripChange} />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="date" name="end_date" value={tripForm.end_date} onChange={handleTripChange} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" value={tripForm.notes} onChange={handleTripChange} rows="3" />
          </div>
          <button type="submit" className="admin-submit-btn">Save Trip</button>
          {tripStatus.message && <div className={`admin-message ${tripStatus.type}`}>{tripStatus.message}</div>}
        </form>
      )}

      {activeSubTab === 'photo' && (
        <form onSubmit={handlePhotoSubmit} className="admin-form">
          <div className="form-group">
            <label>Select Trip</label>
            <select value={photoForm.trip_id} onChange={(e) => setPhotoForm({ ...photoForm, trip_id: e.target.value })} required>
              <option value="">-- Choose Trip --</option>
              {trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Photo File</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoForm({ ...photoForm, file: e.target.files[0] })} required />
            <p className="form-help">Image will be automatically converted to WebP and resized to 1600px width.</p>
          </div>
          <div className="form-group">
            <label>Caption</label>
            <input type="text" value={photoForm.caption} onChange={(e) => setPhotoForm({ ...photoForm, caption: e.target.value })} />
          </div>
          <button type="submit" className="admin-submit-btn" disabled={photoLoading}>
            {photoLoading ? 'Processing...' : 'Upload Photo'}
          </button>
          {photoStatus.message && <div className={`admin-message ${photoStatus.type}`}>{photoStatus.message}</div>}
        </form>
      )}
    </div>
  );
}
