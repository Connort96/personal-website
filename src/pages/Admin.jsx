import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import BlogAdmin from '../components/BlogAdmin';
import TravelAdmin from '../components/TravelAdmin';
import NowAdmin from '../components/NowAdmin';
import GearAdmin from '../components/GearAdmin';
import FilmsAdmin from '../components/FilmsAdmin';
import MusicAdmin from '../components/MusicAdmin';
import { motion, AnimatePresence } from 'framer-motion';
import ISBNScanner from '../components/ISBNScanner';
import './Admin.css';

// ─── Dual-API lookup helper ───────────────────────────────────────────────────
async function lookupBookMetadata(title, author) {
  // Try Google Books first
  try {
    const q = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ''}`);
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
    if (res.status !== 429) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const info = data.items[0].volumeInfo;
        const ids = data.items[0].volumeInfo.industryIdentifiers || [];
        const isbn = ids.find(i => i.type === 'ISBN_13')?.identifier
                  || ids.find(i => i.type === 'ISBN_10')?.identifier
                  || null;
        let coverUrl = info.imageLinks?.thumbnail || null;
        if (coverUrl) coverUrl = coverUrl.replace('http:', 'https:').replace('&edge=curl', '');

        return {
          source: 'Google Books',
          cover_url: coverUrl,
          publisher: info.publisher || null,
          page_count: info.pageCount || null,
          isbn,
          publication_date: info.publishedDate ? info.publishedDate.substring(0, 4) + '-01-01' : null,
          translator: null, // Google Books rarely has this
        };
      }
    }
  } catch (_) {}

  // Fallback: Open Library
  try {
    const q = encodeURIComponent(`${title} ${author || ''}`);
    const res = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=title,author_name,cover_i,isbn,number_of_pages_median,first_publish_year,publisher`);
    const data = await res.json();
    if (data.docs && data.docs.length > 0) {
      const doc = data.docs[0];
      const coverUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : null;
      const isbn = doc.isbn?.[0] || null;
      return {
        source: 'Open Library',
        cover_url: coverUrl,
        publisher: doc.publisher?.[0] || null,
        page_count: doc.number_of_pages_median || null,
        isbn,
        publication_date: doc.first_publish_year ? `${doc.first_publish_year}-01-01` : null,
        translator: null,
      };
    }
  } catch (_) {}

  return null;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  }).filter(r => r.title);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const [genres, setGenres] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('single'); // 'single' | 'batch' | 'backfill'

  // Single book form
  const emptyForm = {
    genre_id: '', title: '', author: '', note: '',
    cover_url: '', publisher: '', page_count: '', isbn: '', publication_date: '', translator: ''
  };
  const [formData, setFormData] = useState(emptyForm);
  const [formStatus, setFormStatus] = useState({ type: '', message: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [lookupSource, setLookupSource] = useState('');

  // Batch import
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [csvText, setCsvText] = useState('');
  const [batchRows, setBatchRows] = useState([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // Backfill
  const [backfillStatus, setBackfillStatus] = useState('');

  // ── Auth setup ──
  useEffect(() => {
    if (user?.email === 'theconison96@gmail.com' || user?.id === 'd01d61f6-334c-4d90-8bce-4b691eebf514') {
      setIsAdmin(true);
    }
    async function loadGenres() {
      const { data, error } = await supabase.from('books').select('genre_id, genre_name, color, badge, badge_label').order('genre_name');
      if (!error && data) {
        const seen = new Set();
        setGenres(data.filter(g => { if (seen.has(g.genre_id)) return false; seen.add(g.genre_id); return true; }));
      }
    }
    loadGenres();
  }, [user]);

  // ── Smart Lookup (single form) ──
  const handleSmartLookup = async () => {
    if (!formData.title) { setFormStatus({ type: 'error', message: 'Enter a title first.' }); return; }
    setFormLoading(true);
    setFormStatus({ type: '', message: 'Searching...' });
    setLookupSource('');
    const result = await lookupBookMetadata(formData.title, formData.author);
    if (result) {
      setFormData(prev => ({
        ...prev,
        cover_url: result.cover_url || prev.cover_url,
        publisher: result.publisher || prev.publisher,
        page_count: result.page_count?.toString() || prev.page_count,
        isbn: result.isbn || prev.isbn,
        publication_date: result.publication_date ? result.publication_date.substring(0, 10) : prev.publication_date,
        translator: result.translator || prev.translator,
      }));
      setLookupSource(result.source);
      setFormStatus({ type: 'success', message: `Metadata pre-filled from ${result.source}. Review and edit before saving.` });
    } else {
      setFormStatus({ type: 'error', message: 'No results found on Google Books or Open Library.' });
    }
    setFormLoading(false);
  };

  // ── Single book submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.genre_id || !formData.title || !formData.author) {
      setFormStatus({ type: 'error', message: 'Genre, Title, and Author are required.' });
      return;
    }
    setFormLoading(true);
    setFormStatus({ type: '', message: '' });
    try {
      // 1. Get genre meta
      const { data: genreBooks, error: fetchError } = await supabase
        .from('books').select('genre_id, color, badge, badge_label, genre_name, book_index')
        .eq('genre_id', formData.genre_id).order('book_index', { ascending: false });
      if (fetchError) throw fetchError;
      const genreMeta = genreBooks?.[0] || { genre_name: 'Uncategorized', color: '#1a1a1a' };
      const nextIndex = (genreBooks?.[0]?.book_index || 0) + 1;

      // 2. SMART WORK LOOKUP (Prevent Duplicates)
      let workId;
      const { data: existingWork } = await supabase
        .from('works')
        .select('id')
        .ilike('title', formData.title)
        .ilike('author', formData.author)
        .maybeSingle();

      if (existingWork) {
        workId = existingWork.id;
      } else {
        const { data: newWork, error: workError } = await supabase
          .from('works')
          .insert({ title: formData.title, author: formData.author })
          .select().single();
        if (workError) throw workError;
        workId = newWork.id;
      }

      // 3. Create Edition
      const { data: editionData, error: editionError } = await supabase.from('editions').insert({
        work_id: workId,
        cover_url: formData.cover_url || null,
        publisher: formData.publisher || null,
        page_count: formData.page_count ? parseInt(formData.page_count) : null,
        isbn: formData.isbn || null,
        publication_date: formData.publication_date || null,
        translator: formData.translator || null,
        genre_id: formData.genre_id,
        genre_name: genreMeta.genre_name,
        color: genreMeta.color,
        badge: genreMeta.badge,
        badge_label: genreMeta.badge_label,
        book_index: nextIndex
      }).select().single();
      if (editionError) throw editionError;

      // 4. Automatically add to User's Archive (prevent phantom records)
      const { error: ubError } = await supabase.from('user_books').insert({
        user_id: user.id,
        edition_id: editionData.id,
        status: 'unread',
        owned_at: new Date().toISOString()
      });
      if (ubError) throw ubError;

      setFormStatus({ type: 'success', message: `"${formData.title}" added to catalog and your archive!` });
      setFormData({ ...emptyForm, genre_id: formData.genre_id });
    } catch (err) {
      setFormStatus({ type: 'error', message: err.message || 'Failed to add book.' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // ── CSV batch parse ──
  const handleParseCsv = () => {
    const rows = parseCsv(csvText);
    setBatchRows(rows.map(r => ({ ...r, _status: 'pending' })));
    setBatchStatus(rows.length > 0 ? `Found ${rows.length} rows. Click "Run Import" to start.` : 'No valid rows found. Check your CSV format.');
  };

  // ── Batch import run ──
  const handleBatchImport = async () => {
    if (!batchRows.length) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: batchRows.length });

    // Get all genre data once
    const { data: allGenreBooks } = await supabase.from('books')
      .select('genre_id, genre_name, color, badge, badge_label, book_index')
      .order('book_index', { ascending: false });

    const genreMaxIndex = {};
    const genreMeta = {};
    (allGenreBooks || []).forEach(b => {
      if (!genreMaxIndex[b.genre_id] || b.book_index > genreMaxIndex[b.genre_id]) {
        genreMaxIndex[b.genre_id] = b.book_index;
        genreMeta[b.genre_id] = b;
      }
    });

    const updated = [...batchRows];

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      const gid = row.genre_id;

      if (!gid || !genreMeta[gid]) {
        updated[i] = { ...row, _status: 'error', _msg: 'Unknown genre_id' };
        setBatchRows([...updated]);
        setBatchProgress({ done: i + 1, total: updated.length });
        continue;
      }

      setBatchStatus(`[${i + 1}/${updated.length}] Importing: ${row.title}…`);

      // Smart lookup
      let meta = {};
      try {
        const result = await lookupBookMetadata(row.title, row.author);
        if (result) meta = result;
      } catch (_) {}

      const nextIndex = (genreMaxIndex[gid] || 0) + 1;
      genreMaxIndex[gid] = nextIndex;

      try {
        // 1. SMART WORK LOOKUP (Prevent Duplicates)
        let workId;
        const { data: existingWork } = await supabase
          .from('works')
          .select('id')
          .ilike('title', row.title)
          .ilike('author', row.author)
          .maybeSingle();

        if (existingWork) {
          workId = existingWork.id;
        } else {
          const { data: newWork, error: workError } = await supabase
            .from('works')
            .insert({ title: row.title, author: row.author })
            .select().single();
          if (workError) throw workError;
          workId = newWork.id;
        }

        // 2. Editions insert
        const { data: editionData, error: editionError } = await supabase.from('editions').insert({
          work_id: workId,
          cover_url: meta.cover_url || null,
          publisher: meta.publisher || null,
          page_count: meta.page_count || null,
          isbn: meta.isbn || null,
          publication_date: meta.publication_date || null,
          translator: meta.translator || null,
          genre_id: gid,
          genre_name: genreMeta[gid].genre_name,
          color: genreMeta[gid].color,
          badge: genreMeta[gid].badge,
          badge_label: genreMeta[gid].badge_label,
          book_index: nextIndex
        }).select().single();

        if (editionError) throw editionError;

        // 3. Automatically add to User's Archive
        await supabase.from('user_books').insert({
          user_id: user.id,
          edition_id: editionData.id,
          status: 'unread',
          owned_at: new Date().toISOString()
        });
        
        updated[i] = { ...row, _status: 'done' };
      } catch (err) {
        updated[i] = { ...row, _status: 'error', _msg: err.message };
      }

      setBatchRows([...updated]);
      setBatchProgress({ done: i + 1, total: updated.length });
      await new Promise(r => setTimeout(r, 300));
    }

    const done = updated.filter(r => r._status === 'done').length;
    const errs = updated.filter(r => r._status === 'error').length;
    setBatchStatus(`Import complete! ${done} added, ${errs} failed.`);
    setBatchRunning(false);
  };

  // ── Backfill (dual API, all metadata) ──
  const handleBackfillCovers = async () => {
    setBackfillStatus('Fetching editions missing covers or metadata…');
    try {
      // Fetch from editions where cover is missing
      let allMissing = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from('editions')
          .select(`
            id, 
            work_id,
            works ( title, author )
          `)
          .is('cover_url', null)
          .range(from, from + 999);
        if (error) throw error;
        allMissing = [...allMissing, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }

      setBackfillStatus(`Found ${allMissing.length} editions. Starting dual-API backfill…`);
      let success = 0, notFound = 0, failed = 0;

      for (let i = 0; i < allMissing.length; i++) {
        const edition = allMissing[i];
        const title = edition.works.title;
        const author = edition.works.author;
        
        setBackfillStatus(`[${i + 1}/${allMissing.length}] "${title}"…`);

        const result = await lookupBookMetadata(title, author);
        if (result) {
          // Update Editions
          const { error: edError } = await supabase.from('editions').update({
            cover_url: result.cover_url,
            publisher: result.publisher,
            page_count: result.page_count,
            isbn: result.isbn,
            publication_date: result.publication_date,
            translator: result.translator,
          }).eq('id', edition.id);

          // Update legacy Books (if ID matches, which it should for 1:1 migration)
          const { error: bkError } = await supabase.from('books').update({
            cover_url: result.cover_url,
            publisher: result.publisher,
            page_count: result.page_count,
            isbn: result.isbn,
            publication_date: result.publication_date,
            translator: result.translator,
          }).eq('id', edition.id);

          if (edError || bkError) {
            console.error('Update failed:', edError || bkError);
            failed++;
          } else {
            success++;
          }
        } else {
          notFound++;
        }

        await new Promise(r => setTimeout(r, 300));
      }

      setBackfillStatus(`Done! ${success} enriched. ${notFound} not found. ${failed} failed to save.`);
    } catch (err) {
      setBackfillStatus(`Error: ${err.message}`);
    }
  };

  // ── Guard renders ──
  if (!user) return <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>Please log in.</div>;
  if (!isAdmin) return (
    <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
      <h1 className="page-header__title">Unauthorized</h1>
      <p>You do not have permission to view this page.</p>
    </div>
  );

  return (
    <div className="admin-page container container--narrow animate-fade-in">
      <div className="admin-identity-badge">
        Logged in as: {user?.email}
      </div>

      <div className="admin-global-actions" style={{ display: 'block !important' }}>
        <button 
          className="admin-action-card scanner-btn"
          onClick={() => setIsScannerOpen(true)}
          style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}
        >
          <div className="action-icon">📷</div>
          <div className="action-label">Start ISBN Scanner</div>
          <div className="action-desc">Tap to digitize books</div>
        </button>
      </div>

      <header className="page-header">
        <h1 className="page-header__title">Admin Dashboard</h1>
        <p className="page-header__subtitle">Manage the global book catalog.</p>
        
        {successMessage && (
          <motion.div 
            className="admin-success-toast"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {successMessage}
          </motion.div>
        )}
      </header>

      {/* Tab nav */}
      <div className="admin-tabs" style={{ flexWrap: 'wrap' }}>
        {[
          ['single', 'Books (Single)'], 
          ['batch', 'Books (Batch)'], 
          ['backfill', 'Books (Meta)'], 
          ['blog', 'Blog'],
          ['travel', 'Travel'],
          ['now', 'Now'],
          ['gear', 'Gear'],
          ['films', 'Films'],
          ['music', 'Music']
        ].map(([key, label]) => (
          <button key={key} type="button"
            className={`admin-tab ${activeTab === key ? 'admin-tab--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >{label}</button>
        ))}
      </div>

      {/* ── Single Book ── */}
      {activeTab === 'single' && (
        <div className="admin-card">
          <form className="admin-form" onSubmit={handleSubmit}>

            <div className="form-group">
              <label htmlFor="genre_id">Genre/Category *</label>
              <select id="genre_id" name="genre_id" value={formData.genre_id} onChange={handleChange} required>
                <option value="">Select a Category…</option>
                {genres.map(g => <option key={g.genre_id} value={g.genre_id}>{g.genre_name}</option>)}
              </select>
            </div>

            <div className="admin-form-row">
              <div className="form-group">
                <label htmlFor="title">Book Title *</label>
                <input type="text" id="title" name="title" value={formData.title} onChange={handleChange} placeholder="e.g. Dune" required />
              </div>
              <div className="form-group">
                <label htmlFor="author">Author *</label>
                <input type="text" id="author" name="author" value={formData.author} onChange={handleChange} placeholder="e.g. Frank Herbert" required />
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-5)' }}>
              <button type="button" className="admin-lookup-btn" onClick={handleSmartLookup} disabled={formLoading || !formData.title}>
                🔍 Smart Lookup
              </button>
              {lookupSource && <span className="admin-source-badge">Source: {lookupSource}</span>}
            </div>

            {/* Metadata fields (pre-filled by lookup, editable) */}
            <div className="admin-meta-grid">
              <div className="form-group">
                <label htmlFor="publisher">Publisher</label>
                <input type="text" id="publisher" name="publisher" value={formData.publisher} onChange={handleChange} placeholder="e.g. Gollancz" />
              </div>
              <div className="form-group">
                <label htmlFor="page_count">Pages</label>
                <input type="number" id="page_count" name="page_count" value={formData.page_count} onChange={handleChange} placeholder="e.g. 412" min="1" />
              </div>
              <div className="form-group">
                <label htmlFor="isbn">ISBN</label>
                <input type="text" id="isbn" name="isbn" value={formData.isbn} onChange={handleChange} placeholder="978-..." />
              </div>
              <div className="form-group">
                <label htmlFor="publication_date">Publication Date</label>
                <input type="date" id="publication_date" name="publication_date" value={formData.publication_date} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="translator">Translator (if applicable)</label>
              <input type="text" id="translator" name="translator" value={formData.translator} onChange={handleChange} placeholder="e.g. Constance Garnett" />
            </div>

            <div className="form-group">
              <label htmlFor="cover_url">Cover Image URL</label>
              <input type="url" id="cover_url" name="cover_url" value={formData.cover_url} onChange={handleChange} placeholder="https://…" />
              {formData.cover_url && <img src={formData.cover_url} alt="Preview" style={{ height: 100, marginTop: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }} />}
            </div>

            <div className="form-group">
              <label htmlFor="note">Notes (Optional)</label>
              <textarea id="note" name="note" value={formData.note} onChange={handleChange} placeholder="Quick thoughts…" rows={2} />
            </div>

            <button type="submit" className="admin-submit-btn" disabled={formLoading}>
              {formLoading ? 'Adding…' : 'Add to Catalog'}
            </button>
          </form>

          {formStatus.message && (
            <div className={`admin-message ${formStatus.type}`}>{formStatus.message}</div>
          )}
        </div>
      )}

      {/* ── Batch Import ── */}
      {activeTab === 'batch' && (
        <div className="admin-card">
          <div className="admin-batch-info">
            <h3>CSV Format</h3>
            <p>Paste a CSV with these headers (title and author are required):</p>
            <code>title,author,genre_id,note</code>
            <p style={{ marginTop: 'var(--space-2)' }}>
              The genre_id must match an existing genre. The Smart Lookup will automatically fetch covers and metadata for each row.
            </p>
          </div>

          <textarea
            className="admin-csv-input"
            rows={8}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={'title,author,genre_id,note\nDune,Frank Herbert,sci-fi,\nFoundation,Isaac Asimov,sci-fi,'}
          />

          <div className="admin-batch-controls">
            <button type="button" className="btn-cancel" onClick={handleParseCsv} disabled={!csvText.trim()}>
              Parse CSV
            </button>
            <button type="button" className="admin-submit-btn"
              onClick={handleBatchImport}
              disabled={batchRunning || batchRows.length === 0}
            >
              {batchRunning ? `Importing… ${batchProgress.done}/${batchProgress.total}` : `Run Import (${batchRows.length} rows)`}
            </button>
          </div>

          {batchStatus && <p className="admin-batch-status">{batchStatus}</p>}

          {batchRows.length > 0 && (
            <div className="admin-batch-table">
              <table>
                <thead>
                  <tr><th>Title</th><th>Author</th><th>Genre</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {batchRows.map((row, i) => (
                    <tr key={i} className={`batch-row batch-row--${row._status || 'pending'}`}>
                      <td>{row.title}</td>
                      <td>{row.author}</td>
                      <td>{row.genre_id}</td>
                      <td>
                        {row._status === 'done' && '✓'}
                        {row._status === 'error' && `✗ ${row._msg || ''}`}
                        {(!row._status || row._status === 'pending') && '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Backfill ── */}
      {activeTab === 'backfill' && (
        <div className="admin-card">
          <h3 style={{ fontFamily: 'var(--font-serif)', marginBottom: 'var(--space-3)' }}>Bulk Metadata Backfill</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)', lineHeight: 1.6 }}>
            For every book missing a cover, this will automatically query <strong>Google Books</strong> (then fall back to <strong>Open Library</strong> if rate-limited) 
            and save: cover image, publisher, page count, ISBN, publication date, and translator. Takes ~10–15 minutes for 1,800 books.
          </p>
          <button type="button" className="admin-submit-btn" onClick={handleBackfillCovers}>
            Start Dual-API Backfill
          </button>
          {backfillStatus && (
            <p style={{ marginTop: 'var(--space-4)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent-secondary)', lineHeight: 1.8 }}>
              {backfillStatus}
            </p>
          )}
        </div>
      )}

      {/* ── Blog Admin ── */}
      {activeTab === 'blog' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Create New Post</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>Write and publish directly to the website.</p>
          </div>
          <BlogAdmin />
        </div>
      )}

      {/* ── Travel Admin ── */}
      {activeTab === 'travel' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Travel</h3>
          </div>
          <TravelAdmin />
        </div>
      )}

      {/* ── Now Admin ── */}
      {activeTab === 'now' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Now</h3>
          </div>
          <NowAdmin />
        </div>
      )}

      {/* ── Gear Admin ── */}
      {activeTab === 'gear' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Gear (About)</h3>
          </div>
          <GearAdmin />
        </div>
      )}

      {/* ── Films Admin ── */}
      {activeTab === 'films' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Films</h3>
          </div>
          <FilmsAdmin />
        </div>
      )}

      {/* ── Music Admin ── */}
      {activeTab === 'music' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)' }}>Music</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>Feature albums and playlists from Spotify.</p>
          </div>
          <MusicAdmin />
        </div>
      )}
      {/* ISBN Scanner Modal */}
      <ISBNScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)}
        onComplete={(book) => {
          setSuccessMessage(`Successfully archived: ${book.title}`);
          setTimeout(() => setSuccessMessage(''), 5000);
        }}
      />
    </div>
  );
}
