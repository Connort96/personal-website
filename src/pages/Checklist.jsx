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

  // Universal Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState([]);
  const [isSearchingAdd, setIsSearchingAdd] = useState(false);
  const [selectedAddBook, setSelectedAddBook] = useState(null);
  const [addMode, setAddMode] = useState(null); // 'existing' | 'new'
  const [selectedExistingTracker, setSelectedExistingTracker] = useState('');
  const [newTrackerInput, setNewTrackerInput] = useState('');
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [addError, setAddError] = useState('');

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

  // Universal Add Smart Search Handler
  async function handleSmartSearch(e) {
    e.preventDefault();
    if (!addSearchQuery) return;
    setIsSearchingAdd(true);
    setAddSearchResults([]);
    setSelectedAddBook(null);
    setAddMode(null);
    setAddError('');

    try {
      const res = await fetch(`${GOOGLE_BOOKS_API}${encodeURIComponent(addSearchQuery)}&maxResults=10`);
      const data = await res.json();

      const results = data.items?.map(item => ({
        title: item.volumeInfo?.title || 'Unknown Title',
        author: item.volumeInfo?.authors?.[0] || 'Unknown Author',
        cover: item.volumeInfo?.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        isbn: item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || 
              item.volumeInfo?.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier || null
      })) || [];

      setAddSearchResults(results);
    } catch (err) {
      console.error('Smart search failed:', err);
      setAddError('Failed to search Google Books.');
    } finally {
      setIsSearchingAdd(false);
    }
  }

  // Universal Add Commit Handler
  async function commitUniversalAdd(e) {
    e.preventDefault();
    if (!selectedAddBook) return;

    const targetTracker = addMode === 'existing' ? selectedExistingTracker : newTrackerInput.trim();
    if (!targetTracker) {
      setAddError('Please specify a tracker name.');
      return;
    }

    setIsAddingBook(true);
    setAddError('');

    try {
      // Step 1: Upsert Work
      const { data: workData, error: workErr } = await supabase
        .from('works')
        .upsert(
          { title: selectedAddBook.title, author: selectedAddBook.author },
          { onConflict: 'title, author' }
        )
        .select('id')
        .single();

      if (workErr) throw workErr;
      const work_id = workData.id;

      // Step 2: Insert Edition
      const { error: edErr } = await supabase
        .from('editions')
        .insert({
          work_id: work_id,
          collection_imprint: targetTracker,
          cover_url: selectedAddBook.cover || null,
          cover_image_url: selectedAddBook.cover || null,
          isbn: selectedAddBook.isbn || null,
          status: 'Wanted',
          publisher: 'Unknown Publisher'
        });

      if (edErr) throw edErr;

      console.log('[Universal Add] Successfully added book to tracker:', targetTracker);
      setShowAddModal(false);
      setAddSearchQuery('');
      setAddSearchResults([]);
      setSelectedAddBook(null);
      setAddMode(null);
      setSelectedExistingTracker('');
      setNewTrackerInput('');
      await fetchChecklist();
    } catch (err) {
      console.error('[Universal Add] Error:', err);
      setAddError(err.message || 'Failed to add book to tracker.');
    } finally {
      setIsAddingBook(false);
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

      {/* Floating Add Button */}
      <button 
        className="floating-add-btn" 
        onClick={() => {
          setShowAddModal(true);
          setAddSearchQuery('');
          setAddSearchResults([]);
          setSelectedAddBook(null);
          setAddMode(null);
          setAddError('');
        }}
        title="Universal Add Modal"
      >
        +
      </button>

      {/* Universal Add Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <header className="modal-header">
              <h2>Universal Add Modal</h2>
              <p>Smart search Google Books to add new volumes or create new trackers.</p>
            </header>

            {addError && <div className="ai-error-msg">{addError}</div>}

            <form onSubmit={handleSmartSearch}>
              <div className="ai-form-group">
                <label htmlFor="smartSearch">Smart Search (Title, Author, or ISBN)</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    id="smartSearch"
                    type="text" 
                    placeholder="e.g., The Odyssey Homer..." 
                    value={addSearchQuery}
                    onChange={(e) => setAddSearchQuery(e.target.value)}
                    required
                    disabled={isSearchingAdd || isAddingBook}
                  />
                  <button 
                    type="submit" 
                    className="fulfill-btn" 
                    style={{ marginTop: '12px', padding: '0 24px' }}
                    disabled={isSearchingAdd || isAddingBook || !addSearchQuery}
                  >
                    {isSearchingAdd ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </form>

            {addSearchResults.length > 0 && (
              <div className="smart-search-results">
                {addSearchResults.map((book, i) => (
                  <div 
                    key={i} 
                    className={`smart-search-item ${selectedAddBook === book ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedAddBook(book);
                      setAddMode(null);
                      setAddError('');
                    }}
                  >
                    <img src={book.cover || 'https://via.placeholder.com/40x60?text=?'} alt="" className="smart-search-cover" />
                    <div className="smart-search-info">
                      <div className="smart-search-title">{book.title}</div>
                      <div className="smart-search-author">{book.author}</div>
                    </div>
                    {selectedAddBook === book && <div className="status-indicator owned">✓</div>}
                  </div>
                ))}
              </div>
            )}

            {selectedAddBook && (
              <div className="add-mode-container animate-fade-in">
                <div className="add-mode-actions">
                  <button 
                    type="button" 
                    className={`add-mode-btn ${addMode === 'existing' ? 'active' : ''}`}
                    onClick={() => {
                      setAddMode('existing');
                      if (trackerList.length > 0) setSelectedExistingTracker(trackerList[0].name);
                    }}
                    disabled={isAddingBook}
                  >
                    Add to Existing Tracker
                  </button>
                  <button 
                    type="button" 
                    className={`add-mode-btn ${addMode === 'new' ? 'active' : ''}`}
                    onClick={() => {
                      setAddMode('new');
                      setNewTrackerInput('');
                    }}
                    disabled={isAddingBook}
                  >
                    Create New Tracker
                  </button>
                </div>

                {addMode === 'existing' && (
                  <form onSubmit={commitUniversalAdd} className="ai-form-group animate-fade-in">
                    <label htmlFor="selectTracker">Select Existing Tracker</label>
                    <select 
                      id="selectTracker"
                      value={selectedExistingTracker}
                      onChange={(e) => setSelectedExistingTracker(e.target.value)}
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        border: '1px solid rgba(255, 255, 255, 0.1)', 
                        padding: '16px', 
                        borderRadius: '16px', 
                        color: '#fff', 
                        fontSize: '1rem',
                        width: '100%',
                        marginTop: '8px'
                      }}
                      disabled={isAddingBook}
                      required
                    >
                      {trackerList.map(t => (
                        <option key={t.name} value={t.name} style={{ background: '#111', color: '#fff' }}>
                          {t.name} ({t.owned}/{t.total})
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="ai-generate-btn" style={{ marginTop: '24px' }} disabled={isAddingBook}>
                      {isAddingBook ? 'Adding Book...' : 'Confirm Add to Tracker'}
                    </button>
                  </form>
                )}

                {addMode === 'new' && (
                  <form onSubmit={commitUniversalAdd} className="ai-form-group animate-fade-in">
                    <label htmlFor="newTrackerName">New Tracker Name</label>
                    <input 
                      id="newTrackerName"
                      type="text" 
                      placeholder="e.g., Vintage (Japanese Literature)" 
                      value={newTrackerInput}
                      onChange={(e) => setNewTrackerInput(e.target.value)}
                      required
                      disabled={isAddingBook}
                    />
                    <button type="submit" className="ai-generate-btn" style={{ marginTop: '24px' }} disabled={isAddingBook || !newTrackerInput}>
                      {isAddingBook ? 'Creating Tracker & Adding Book...' : 'Confirm Create & Add'}
                    </button>
                  </form>
                )}
              </div>
            )}

            <button 
              className="back-button" 
              style={{ marginTop: '40px', width: '100%', justifyContent: 'center', marginBottom: 0 }}
              onClick={() => setShowAddModal(false)}
              disabled={isSearchingAdd || isAddingBook}
            >
              Close
            </button>
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
