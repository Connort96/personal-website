import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { runSagaScout } from '../lib/sagaScout';
import './Enrichment.css';

export default function Enrichment() {
  const { user } = useAuth();
  const isAdmin = user?.email === 'theconison96@gmail.com' || user?.id === 'd01d61f6-334c-4d90-8bce-4b691eebf514';
  
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState([]);

  useEffect(() => {
    if (isAdmin) {
      loadPendingWorks();
    }
  }, [isAdmin]);

  const loadPendingWorks = async () => {
    setLoading(true);

    try {
      // 1. Fetch all user books to get owned work IDs
      const { data: userBooks, error: userError } = await supabase
        .from('user_books')
        .select(`
          editions (work_id),
          books (work_id)
        `)
        .eq('user_id', user.id);

      if (userError) throw userError;

      // Extract unique work IDs
      const ownedWorkIds = [...new Set(
        (userBooks || []).map(ub => ub.editions?.work_id || ub.books?.work_id).filter(Boolean)
      )];

      if (ownedWorkIds.length === 0) {
        setWorks([]);
        setLoading(false);
        return;
      }

      // 2. Fetch works that are owned and not enriched
      const { data, error } = await supabase
        .from('works')
        .select('id, title, author')
        .in('id', ownedWorkIds)
        .eq('ai_enriched', false)
        .order('id', { ascending: false });
      
      if (!error && data) {
        setWorks(data.map(w => ({ ...w, status: 'pending' })));
      }
    } catch (err) {
      console.error('Failed to load pending works:', err);
    }

    setLoading(false);
  };

  const addLog = (msg, type = 'info') => {
    setLog(prev => [{ id: Date.now() + Math.random(), msg, type }, ...prev].slice(0, 50));
  };

  const runBatch = async () => {
    if (works.length === 0 || enriching) return;
    
    setEnriching(true);
    setProgress({ done: 0, total: works.length });
    addLog(`Starting batch enrichment for ${works.length} works...`, 'info');

    const updatedWorks = [...works];
    let completedCount = 0;

    // Process in batches of 5 to avoid hammering the Edge Function immediately, but
    // we also enforce a delay between calls.
    const batchSize = 5;
    
    for (let i = 0; i < updatedWorks.length; i += batchSize) {
      const batch = updatedWorks.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (work) => {
        const index = updatedWorks.findIndex(w => w.id === work.id);
        updatedWorks[index].status = 'processing';
        setWorks([...updatedWorks]);

        try {
          const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
            body: { title: work.title, author: work.author, provenance_string: null } // No provenance retroactively
          });

          if (aiError) throw aiError;

          if (aiData) {
            // Write literary metadata to works
            const updates = { ai_enriched: true };
            if (aiData.vibes?.length) updates.vibes = aiData.vibes;
            if (aiData.motifs?.length) updates.motifs = aiData.motifs;
            if (aiData.setting_era) updates.setting_era = aiData.setting_era;
            if (aiData.setting_location) updates.setting_location = aiData.setting_location;

            await supabase.from('works').update(updates).eq('id', work.id);

            // Series detection
            if (aiData.is_series && aiData.series_name) {
              let { data: existingSeries } = await supabase
                .from('series').select('id').ilike('name', aiData.series_name).maybeSingle();
              let sId = existingSeries?.id;
              if (!sId) {
                const { data: newS } = await supabase.from('series')
                  .insert({ name: aiData.series_name }).select('id').single();
                sId = newS?.id;
              }
              if (sId) {
                await supabase.from('series_works').upsert({
                  series_id: sId, work_id: work.id,
                  sequence_order: aiData.series_index || 1
                }, { onConflict: 'series_id, work_id' });
                // Run auto-saga scout non-blocking so it populates missing books
                runSagaScout(supabase, sId, aiData.series_name, aiData.series_index || 1, work.author).catch(e => console.warn(e));
              }
            }

            updatedWorks[index].status = 'success';
            addLog(`Enriched "${work.title}"`, 'success');
          } else {
            updatedWorks[index].status = 'error';
            addLog(`Failed to enrich "${work.title}": No data`, 'error');
          }
        } catch (err) {
          updatedWorks[index].status = 'error';
          addLog(`Error on "${work.title}": ${err.message}`, 'error');
        }

        completedCount++;
        setProgress({ done: completedCount, total: works.length });
        setWorks([...updatedWorks]);
      }));

      // Delay between batches to respect rate limits
      if (i + batchSize < updatedWorks.length) {
        addLog(`Cooling down for 3 seconds...`, 'warning');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    addLog('Batch enrichment complete!', 'success');
    setEnriching(false);
  };

  if (!isAdmin) {
    return <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>Unauthorized</div>;
  }

  return (
    <div className="enrichment-page container container--narrow animate-fade-in">
      <div className="admin-identity-badge">
        <Link to="/admin">← Back to Admin</Link>
      </div>

      <header className="page-header">
        <h1 className="page-header__title">AI Enrichment</h1>
        <p className="page-header__subtitle">Retroactively enrich the literary metadata for your entire catalog.</p>
      </header>

      <div className="admin-card">
        <div className="enrichment-header">
          <div>
            <h3>Pending Backlog</h3>
            <p>{works.length} works waiting for AI enrichment.</p>
          </div>
          <button 
            className="admin-submit-btn" 
            onClick={runBatch} 
            disabled={enriching || works.length === 0}
            style={{ width: 'auto' }}
          >
            {enriching ? 'Enriching...' : 'Run Enrichment Batch'}
          </button>
        </div>

        {enriching && (
          <div className="enrichment-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              ></div>
            </div>
            <p>{progress.done} / {progress.total} processed</p>
          </div>
        )}

        <div className="enrichment-content">
          <div className="enrichment-list">
            {loading ? (
              <p>Loading...</p>
            ) : works.length === 0 ? (
              <p>All caught up! No works require enrichment.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map(w => (
                    <tr key={w.id} className={`status-${w.status}`}>
                      <td>{w.title}</td>
                      <td>{w.author}</td>
                      <td>
                        {w.status === 'pending' && '⏳ Pending'}
                        {w.status === 'processing' && '🔄 Processing'}
                        {w.status === 'success' && '✅ Enriched'}
                        {w.status === 'error' && '❌ Error'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          <div className="enrichment-log">
            <h4>Live Log</h4>
            <div className="log-container">
              {log.map(l => (
                <div key={l.id} className={`log-entry log-${l.type}`}>
                  {l.msg}
                </div>
              ))}
              {log.length === 0 && <span className="log-empty">Waiting to start...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
