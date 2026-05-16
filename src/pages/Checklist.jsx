import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Checklist.css';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes?q=';

export default function Checklist() {
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTrackerName, setActiveTrackerName] = useState(null);
  const [fulfillmentTarget, setFulfillmentTarget] = useState(null);
  const [coverOptions, setCoverOptions] = useState([]);
  const [manualIsbn, setManualIsbn] = useState('');
  const [isFulfilling, setIsFulfilling] = useState(false);

  // AI Ingestion State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTrackerName, setAiTrackerName] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    fetchChecklist();
  }, []);

  async function fetchChecklist() {
    setLoading(true);
    let allEditions = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('editions')
        .select(`
          *,
          works!editions_work_id_fkey (
            title,
            author
          )
        `)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('collection_imprint', { ascending: true });

      if (error) {
        console.error('Error fetching checklist page:', error);
        break;
      }

      if (!data || data.length === 0) {
        break;
      }

      allEditions = allEditions.concat(data);
      if (data.length < pageSize) {
        break; // Reached the last page
      }
      page++;
    }

    console.log('[Checklist] Total Data fetched:', allEditions.length);
    setEditions(allEditions);
    setLoading(false);
  }

  // Grouping logic
  const trackers = editions.reduce((acc, ed) => {
    const name = ed.collection_imprint || 'General Wishlist';
    if (!acc[name]) {
      acc[name] = { name, books: [], owned: 0, total: 0 };
    }
    acc[name].books.push(ed);
    acc[name].total += 1;
    if (ed.status === 'Owned') acc[name].owned += 1;
    return acc;
  }, {});

  const trackerList = Object.values(trackers).sort((a, b) => b.total - a.total);
  const activeTracker = activeTrackerName ? trackerList.find(t => t.name === activeTrackerName) : null;

  // Fulfillment logic
  async function openFulfillmentModal(book) {
    setFulfillmentTarget(book);
    setCoverOptions([]);
    setManualIsbn('');
    
    try {
      const query = `intitle:${encodeURIComponent(book.works?.title || '')}+inauthor:${encodeURIComponent(book.works?.author || '')}`;
      const res = await fetch(`${GOOGLE_BOOKS_API}${query}&maxResults=6`);
      const data = await res.json();
      
      const options = data.items?.map(item => ({
        isbn: item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || 
              item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier,
        thumbnail: item.volumeInfo?.imageLinks?.thumbnail?.replace('http:', 'https:')
      })).filter(opt => opt.thumbnail) || [];
      
      setCoverOptions(options);
    } catch (err) {
      console.error('Fulfillment search failed:', err);
    }
  }

  async function commitFulfillment(isbn, coverUrl) {
    if (!fulfillmentTarget) return;
    setIsFulfilling(true);
    
    const { error } = await supabase
      .from('editions')
      .update({
        isbn: isbn || null,
        cover_url: coverUrl || null,
        cover_image_url: coverUrl || null,
        status: 'Owned'
      })
      .eq('id', fulfillmentTarget.id);

    if (error) {
      console.error('Fulfillment commit failed:', error);
      alert('Failed to update record. Check if "status" column exists.');
    } else {
      await fetchChecklist();
      setFulfillmentTarget(null);
    }
    setIsFulfilling(false);
  }

  // AI Generation Handler
  async function handleAiGeneration(e) {
    e.preventDefault();
    if (!aiTrackerName || !aiPrompt) return;
    setIsAiGenerating(true);
    setAiError('');

    try {
      const { data: funcData, error: funcErr } = await supabase.functions.invoke('v2_bulk_ingest', {
        body: { tracker_name: aiTrackerName, ai_prompt: aiPrompt }
      });

      if (funcErr) {
        throw new Error(funcErr.message || 'Failed to invoke AI ingest function');
      }

      if (funcData?.error) {
        throw new Error(funcData.error);
      }

      console.log('[Bulk Ingest AI] Success:', funcData);
      setAiTrackerName('');
      setAiPrompt('');
      setShowAiModal(false);
      await fetchChecklist();
    } catch (err) {
      console.error('[Bulk Ingest AI] Error:', err);
      setAiError(err.message || 'An error occurred during AI generation.');
    } finally {
      setIsAiGenerating(false);
    }
  }

  if (loading) return <div className="checklist-container"><p>Loading your roadmap...</p></div>;

  return (
    <div className="checklist-container">
      <header className="checklist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Tracker Dashboard</h1>
          <p>Curated archival roadmap & physical collection progress.</p>
        </div>
        {!activeTracker && (
          <button className="ai-generate-btn" onClick={() => setShowAiModal(true)}>
            ✨ Generate Tracker with AI
          </button>
        )}
      </header>

      {!activeTracker ? (
        <div className="tracker-grid">
          {trackerList.map(tracker => (
            <TrackerCard 
              key={tracker.name} 
              tracker={tracker} 
              onClick={() => setActiveTrackerName(tracker.name)}
            />
          ))}
        </div>
      ) : (
        <div className="drill-down-container">
          <button className="back-button" onClick={() => setActiveTrackerName(null)}>
            ← Back to Dashboard
          </button>
          
          <div className="checklist-header">
            <h1>{activeTracker.name}</h1>
            <p>{activeTracker.owned} of {activeTracker.total} collected</p>
          </div>

          <div className="tracker-books-list">
            {activeTracker.books.map(book => (
              <div key={book.id} className={`book-row ${book.status?.toLowerCase() || 'wanted'}`}>
                <img 
                  src={book.cover_image_url || book.cover_url || 'https://via.placeholder.com/50x75?text=?'} 
                  alt="" 
                  className="book-cover-mini"
                />
                <div className="book-info">
                  <div className="book-title">{book.works?.title || 'Unknown Title'}</div>
                  <div className="book-author">{book.works?.author || 'Unknown Author'}</div>
                  {book.isbn && <div className="book-meta">ISBN: {book.isbn}</div>}
                </div>
                
                {book.status === 'Owned' ? (
                  <div className="status-indicator owned">✓</div>
                ) : (
                  <div className="fulfillment-actions">
                    <div className="status-indicator wanted" title="Wanted - Not Owned"></div>
                    <button 
                      className="fulfill-btn"
                      onClick={() => openFulfillmentModal(book)}
                      disabled={isFulfilling}
                    >
                      Fulfill
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Ingestion Modal */}
      {showAiModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <header className="modal-header">
              <h2>✨ Generate Tracker with AI</h2>
              <p>Harness LLM knowledge to automatically build massive collection roadmaps.</p>
            </header>

            {aiError && <div className="ai-error-msg">{aiError}</div>}

            <form onSubmit={handleAiGeneration}>
              <div className="ai-form-group">
                <label htmlFor="trackerName">Tracker Name</label>
                <input 
                  id="trackerName"
                  type="text" 
                  placeholder="e.g., Penguin Classics: The Ancient World" 
                  value={aiTrackerName}
                  onChange={(e) => setAiTrackerName(e.target.value)}
                  required
                  disabled={isAiGenerating}
                />
              </div>

              <div className="ai-form-group">
                <label htmlFor="aiPrompt">AI Prompt & Curation Rules</label>
                <textarea 
                  id="aiPrompt"
                  placeholder="e.g., List 50 essential Ancient Greek books featured in The Penguin Classics Book. Return only canonical titles and authors." 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  required
                  disabled={isAiGenerating}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button 
                  type="button" 
                  className="back-button" 
                  style={{ margin: 0, flex: 1, justifyContent: 'center' }}
                  onClick={() => setShowAiModal(false)}
                  disabled={isAiGenerating}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="ai-generate-btn" 
                  style={{ flex: 2 }}
                  disabled={isAiGenerating || !aiTrackerName || !aiPrompt}
                >
                  {isAiGenerating ? '✨ Generating & Building...' : 'Generate & Build Tracker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fulfillment Modal */}
      {fulfillmentTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <header className="modal-header">
              <h2>Fulfill: {fulfillmentTarget.works?.title}</h2>
              <p>Select the correct edition to mark as Owned.</p>
            </header>

            <div className="cover-selection-grid">
              {coverOptions.length > 0 ? coverOptions.map((opt, i) => (
                <div 
                  key={i} 
                  className="cover-option"
                  onClick={() => commitFulfillment(opt.isbn, opt.thumbnail)}
                >
                  <img src={opt.thumbnail} alt="Book cover" />
                </div>
              )) : (
                <p>Searching for editions...</p>
              )}
            </div>

            <div className="manual-override">
              <h3>Manual ISBN Override</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Enter ISBN-13..." 
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                />
                <button 
                  className="fulfill-btn" 
                  style={{ marginTop: '12px' }}
                  onClick={() => commitFulfillment(manualIsbn, null)}
                  disabled={!manualIsbn || isFulfilling}
                >
                  {isFulfilling ? 'Saving...' : 'Confirm Manual'}
                </button>
              </div>
            </div>

            <button 
              className="back-button" 
              style={{ marginTop: '40px', width: '100%', justifyContent: 'center' }}
              onClick={() => setFulfillmentTarget(null)}
              disabled={isFulfilling}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerCard({ tracker, onClick }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = tracker.total > 0 ? (tracker.owned / tracker.total) : 0;
  const offset = circumference - progress * circumference;

  return (
    <div className="tracker-card" onClick={onClick}>
      <div className="progress-container">
        <svg className="progress-ring" width="120" height="120">
          <circle
            className="progress-ring-bg"
            strokeWidth="8"
            fill="transparent"
            r={radius}
            cx="60"
            cy="60"
          />
          <circle
            className="progress-ring-circle"
            strokeWidth="8"
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset: offset }}
            fill="transparent"
            r={radius}
            cx="60"
            cy="60"
          />
        </svg>
        <div className="progress-text">
          <span className="progress-percentage">{Math.round(progress * 100)}%</span>
          <span className="progress-label">Owned</span>
        </div>
      </div>
      <h3 className="tracker-name">{tracker.name}</h3>
      <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
        {tracker.owned} / {tracker.total} Volumes
      </p>
    </div>
  );
}
