import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Image from '../components/Image';
import './Travel.css';

export default function Travel() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrips() {
      try {
        const { data, error } = await supabase
          .from('trips')
          .select(`
            *,
            trip_photos ( id, url, caption, width, height )
          `)
          .order('start_date', { ascending: false });

        if (error) throw error;
        setTrips(data || []);
      } catch (err) {
        console.error('Error fetching trips:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrips();
  }, []);

  if (loading) {
    return <div className="container" style={{ padding: '4rem 0' }}>Loading journeys...</div>;
  }

  return (
    <div className="travel-page animate-fade-in">
      <div className="container">
        <header className="page-header">
          <h1 className="page-header__title">Travel</h1>
          <p className="page-header__subtitle">Places I've been, things I've seen.</p>
        </header>

        {trips.length === 0 ? (
          <p className="travel-empty">No trips recorded yet.</p>
        ) : (
          <div className="trips-list">
            {trips.map(trip => (
              <section key={trip.id} className="trip-section">
                <div className="trip-header">
                  <h2 className="trip-title">{trip.title}</h2>
                  <div className="trip-meta">
                    <span className="trip-location">{trip.location}</span>
                    <span className="trip-date">
                      {new Date(trip.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {trip.notes && <p className="trip-notes">{trip.notes}</p>}
                </div>

                {trip.trip_photos && trip.trip_photos.length > 0 && (
                  <div className="trip-gallery">
                    {trip.trip_photos.map(photo => (
                      <div key={photo.id} className="trip-photo-wrapper">
                        <Image 
                          src={photo.url} 
                          alt={photo.caption || trip.location} 
                          className="trip-photo"
                        />
                        {photo.caption && <p className="trip-photo-caption">{photo.caption}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
