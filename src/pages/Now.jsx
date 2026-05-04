import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Now.css';

export default function Now() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const { data, error } = await supabase
          .from('status')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // Ignore no rows found
        setStatus(data);
      } catch (err) {
        console.error('Error fetching status:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  if (loading) {
    return <div className="container" style={{ padding: '4rem 0' }}>Loading status...</div>;
  }

  return (
    <div className="now-page animate-fade-in">
      <div className="container container--narrow">
        <header className="page-header">
          <h1 className="page-header__title">Now</h1>
          <p className="page-header__subtitle">What I'm focused on right now.</p>
        </header>

        <section className="now-content animate-fade-in-up">
          {status ? (
            <>
              <div className="now-status">
                <p>{status.content}</p>
              </div>
              <time className="now-meta">
                Last updated: {new Date(status.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </time>
            </>
          ) : (
            <p className="now-empty">No current status available.</p>
          )}
        </section>
      </div>
    </div>
  );
}
