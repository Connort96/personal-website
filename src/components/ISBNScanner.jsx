import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import './ISBNScanner.css';

const ISBNScanner = ({ isOpen, onClose, onComplete }) => {
  const { user } = useAuth();
  const [scanner, setScanner] = useState(null);
  const [scannedIsbn, setScannedIsbn] = useState('');
  const [bookData, setBookData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('scanning'); // scanning, confirming, saving
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('uncategorized');

  useEffect(() => {
    async function loadGenres() {
      const { data } = await supabase.from('books').select('genre_id, genre_name, color').order('genre_name');
      if (data) {
        const seen = new Set();
        setGenres(data.filter(g => { 
          if (seen.has(g.genre_id)) return false; 
          seen.add(g.genre_id); 
          return true; 
        }));
      }
    }
    loadGenres();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const html5QrCode = new Html5Qrcode("reader");
      setScanner(html5QrCode);
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess
      ).catch(err => {
        console.error("Camera start error:", err);
        setError("Could not access camera. Please check permissions.");
      });

      return () => {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(e => console.log("Stop error", e));
        }
      };
    }
  }, [isOpen]);

  const onScanSuccess = async (decodedText) => {
    // Basic ISBN validation (10 or 13 digits)
    const isbn = decodedText.replace(/[-\s]/g, '');
    if (isbn.length !== 10 && isbn.length !== 13) return;

    setScannedIsbn(isbn);
    setStatus('confirming');
    
    // Stop scanner once found
    if (scanner) {
      await scanner.stop();
    }

    fetchBookMetadata(isbn);
  };

  const fetchBookMetadata = async (isbn) => {
    setLoading(true);
    setError('');
    try {
      // Parallel fetch from Open Library and Google Books for better cover/metadata coverage
      const [olRes, gbRes] = await Promise.all([
        fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
        fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
      ]);

      const olData = await olRes.json();
      const gbData = await gbRes.json();
      
      const olInfo = olData[`ISBN:${isbn}`];
      const gbInfo = gbData.items?.[0]?.volumeInfo;

      if (!olInfo && !gbInfo) {
        throw new Error("Book not found in primary archives.");
      }

      // Prefer Google Books for cover art
      const gbCover = gbInfo?.imageLinks?.extraLarge || gbInfo?.imageLinks?.large || gbInfo?.imageLinks?.medium || gbInfo?.imageLinks?.thumbnail;
      const olCover = olInfo?.cover?.large || olInfo?.cover?.medium || '';
      
      let bestCover = (gbCover || olCover || '').replace('http://', 'https://');

      // TRIPLE-HUNT FALLBACK: If no cover found in primary APIs, try the Search API (more aggressive)
      if (!bestCover) {
        console.log("[Art Hunt] Primary failed, launching Search API fallback...");
        const searchRes = await fetch(`https://openlibrary.org/search.json?isbn=${isbn}`);
        const searchData = await searchRes.json();
        const coverI = searchData.docs?.[0]?.cover_i;
        if (coverI) {
          bestCover = `https://covers.openlibrary.org/b/id/${coverI}-L.jpg`;
          console.log("[Art Hunt] Search API Success!", bestCover);
        }
      }

      setBookData({
        title: olInfo?.title || gbInfo?.title || searchData?.docs?.[0]?.title || 'Unknown Title',
        subtitle: olInfo?.subtitle || gbInfo?.subtitle || '',
        author: olInfo?.authors?.[0]?.name || gbInfo?.authors?.[0] || searchData?.docs?.[0]?.author_name?.[0] || 'Unknown Author',
        publisher: olInfo?.publishers?.[0]?.name || gbInfo?.publisher || 'Unknown Publisher',
        year: olInfo?.publish_date || gbInfo?.publishedDate || 'Unknown',
        full_date: (olInfo?.publish_date || gbInfo?.publishedDate)?.match(/\d{4}/) 
          ? `${(olInfo?.publish_date || gbInfo?.publishedDate).match(/\d{4}/)[0]}-01-01` 
          : null,
        cover: bestCover,
        pages: olInfo?.number_of_pages || gbInfo?.pageCount || 0,
        isbn: isbn,
        description: olInfo?.description || gbInfo?.description || olInfo?.notes || '',
        format: 'Hardcover' // Default starting point
      });
    } catch (err) {
      console.error("Fetch error:", err);
      setError(err.message || "Could not retrieve book details.");
      setStatus('scanning');
      // Restart scanner on error
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      scanner?.start({ facingMode: "environment" }, config, onScanSuccess);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToArchive = async () => {
    if (!bookData || !user) return;
    setStatus('saving');
    setLoading(true);

    try {
      // 0. Prevent Duplicate ISBNs
      if (bookData.isbn) {
        const { data: existingEd } = await supabase
          .from('editions')
          .select('id')
          .eq('isbn', bookData.isbn.trim())
          .maybeSingle();
        
        if (existingEd) {
          setError("This edition is already in your archive.");
          setLoading(false);
          setStatus('confirming');
          return;
        }
      }

      // 1. Fetch the Admin ID to ensure visibility in the library grid
      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('admin_user_id')
        .single();
      
      const targetUserId = adminSettings?.admin_user_id || user.id;

      const genreMeta = genres.find(g => g.genre_id === selectedGenre) || { genre_name: 'Uncategorized', color: '#1a1a1a' };
      const safeGenreId = selectedGenre === 'uncategorized' ? null : selectedGenre;

      // 1. Get or Create Work
      let workId;
      const { data: existingWork } = await supabase
        .from('works')
        .select('id')
        .ilike('title', bookData.title)
        .ilike('author', bookData.author)
        .maybeSingle();

      if (existingWork) {
        workId = existingWork.id;
      } else {
        const { data: newWork } = await supabase
          .from('works')
          .insert({ title: bookData.title, author: bookData.author })
          .select().single();
        workId = newWork.id;
      }

      // 2. Create Edition
      const { data: newEdition } = await supabase
        .from('editions')
        .insert({
          work_id: workId,
          isbn: bookData.isbn,
          publisher: bookData.publisher,
          cover_image_url: bookData.cover,
          format: bookData.format || 'Hardcover',
          page_count: bookData.pages,
          genre_id: safeGenreId,
          genre_name: genreMeta.genre_name,
          color: genreMeta.color,
          publication_date: bookData.full_date
        })
        .select().single();

      // 3. Sync to legacy 'books' table
      const { data: genreBooks } = await supabase.from('books')
        .select('book_index')
        .eq('genre_name', genreMeta.genre_name)
        .order('book_index', { ascending: false })
        .limit(1);
      const nextIndex = (genreBooks?.[0]?.book_index || 0) + 1;

      const { data: legacyBook } = await supabase.from('books').insert({
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn,
        genre_id: safeGenreId,
        genre_name: genreMeta.genre_name,
        color: genreMeta.color,
        page_count: bookData.pages,
        book_index: nextIndex,
        publication_date: bookData.full_date,
        note: bookData.description
      }).select().single();

      // 4. Link to User Archive (Ensuring it's marked as Owned)
      const { data: workEds } = await supabase.from('editions').select('id').eq('work_id', workId);
      const wEdIds = (workEds || []).map(e => e.id);
      
      const { data: wReview } = await supabase
        .from('user_books')
        .select('rating, review, status')
        .eq('user_id', targetUserId)
        .in('edition_id', wEdIds)
        .order('review', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: saveErr } = await supabase.from('user_books').insert({
        user_id: targetUserId,
        edition_id: newEdition.id,
        book_id: legacyBook?.id,
        status: wReview?.status || 'unread',
        rating: wReview?.rating || null, // Use null instead of 0 to avoid check constraint violations
        review: wReview?.review || '',
        owned_at: new Date().toISOString()
      });

      if (saveErr) throw saveErr;

      if (onComplete) onComplete(bookData);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError(`Failed to save to archive: ${err.message}`);
      setStatus('confirming');
    } finally {
      setLoading(false);
    }
  };

  const restartScanner = () => {
    setBookData(null);
    setError('');
    setStatus('scanning');
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    scanner?.start({ facingMode: "environment" }, config, onScanSuccess);
  };

  if (!isOpen) return null;

  return (
    <div className="isbn-scanner-overlay">
      <div className="scanner-container">
        <div className="scanner-header">
          <button className="scanner-close" onClick={onClose}>×</button>
          <h2>Digitize Volume</h2>
        </div>

        <div className="scanner-viewport">
          <div id="reader" className="scanner-reader"></div>
          
          {status === 'scanning' && (
            <div className="scanner-ui-overlay">
              <div className="scanner-target">
                <div className="scanner-laser"></div>
              </div>
              <p className="scanner-hint">Align barcode within the gold frame</p>
            </div>
          )}

          {status === 'confirming' && (
            <motion.div 
              className="scanner-confirmation-card"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              {loading ? (
                <div className="scanner-loading">
                  <div className="spinner"></div>
                  <span>Identifying Book...</span>
                </div>
              ) : error ? (
                <div className="scanner-error">
                  <p>{error}</p>
                  <button onClick={restartScanner} className="scanner-btn-retry">Try Again</button>
                </div>
              ) : (
                  <div className="confirmation-content">
                    <div className="book-preview-grid">
                      <div className="book-preview-art">
                        {bookData.cover ? (
                          <img src={bookData.cover} alt="Cover" />
                        ) : (
                          <div className="cover-placeholder">No Cover Found</div>
                        )}
                      </div>
                      
                      <div className="book-preview-form">
                        <div className="scanner-field-group">
                          <label>Title</label>
                          <input 
                            type="text" 
                            value={bookData.title}
                            onChange={(e) => setBookData({ ...bookData, title: e.target.value })}
                          />
                        </div>

                        <div className="scanner-field-row">
                          <div className="scanner-field-group">
                            <label>Author</label>
                            <input 
                              type="text" 
                              value={bookData.author}
                              onChange={(e) => setBookData({ ...bookData, author: e.target.value })}
                            />
                          </div>
                          <div className="scanner-field-group">
                            <label>Publisher</label>
                            <input 
                              type="text" 
                              value={bookData.publisher}
                              onChange={(e) => setBookData({ ...bookData, publisher: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="scanner-field-row">
                          <div className="scanner-field-group">
                            <label>Format</label>
                            <select 
                              value={bookData.format || 'Hardcover'}
                              onChange={(e) => setBookData({ ...bookData, format: e.target.value })}
                            >
                              <option value="Hardcover">Hardcover</option>
                              <option value="Paperback">Paperback</option>
                              <option value="Audiobook">Audiobook</option>
                              <option value="Digital">Digital</option>
                              <option value="Kindle">Kindle</option>
                            </select>
                          </div>
                          <div className="scanner-field-group">
                            <label>Pages</label>
                            <input 
                              type="number" 
                              value={bookData.pages}
                              onChange={(e) => setBookData({ ...bookData, pages: parseInt(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        <div className="scanner-field-group">
                          <label>Primary Category</label>
                          <select 
                            value={selectedGenre} 
                            onChange={(e) => setSelectedGenre(e.target.value)}
                            className="genre-select"
                          >
                            <option value="uncategorized">Uncategorized</option>
                            {genres.map(g => (
                              <option key={g.genre_id} value={g.genre_id}>{g.genre_name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="confirmation-actions">
                      <button onClick={handleAddToArchive} className="scanner-btn-add">Archive Volume</button>
                      <button onClick={restartScanner} className="scanner-btn-cancel">Rescan</button>
                    </div>
                  </div>
              )}
            </motion.div>
          )}

          {status === 'saving' && (
            <div className="scanner-saving-overlay">
              <div className="spinner"></div>
              <span>Archiving to Library...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ISBNScanner;
