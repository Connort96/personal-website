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
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const data = await res.json();
      const bookInfo = data[`ISBN:${isbn}`];

      if (!bookInfo) {
        throw new Error("Book not found in Open Library archive.");
      }

      setBookData({
        title: bookInfo.title,
        subtitle: bookInfo.subtitle || '',
        author: bookInfo.authors?.[0]?.name || 'Unknown Author',
        publisher: bookInfo.publishers?.[0]?.name || 'Unknown Publisher',
        year: bookInfo.publish_date || 'Unknown',
        full_date: bookInfo.publish_date ? (bookInfo.publish_date.match(/\d{4}/) ? `${bookInfo.publish_date.match(/\d{4}/)[0]}-01-01` : null) : null,
        cover: bookInfo.cover?.large || bookInfo.cover?.medium || '',
        pages: bookInfo.number_of_pages || 0,
        isbn: isbn,
        description: bookInfo.description || bookInfo.notes || ''
      });
    } catch (err) {
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
      const genreMeta = genres.find(g => g.genre_id === selectedGenre) || { genre_name: 'Uncategorized', color: '#1a1a1a' };

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

      // 2. Create Edition with selected genre
      const { data: newEdition } = await supabase
        .from('editions')
        .insert({
          work_id: workId,
          isbn: bookData.isbn,
          publisher: bookData.publisher,
          cover_image_url: bookData.cover,
          format: bookData.format || 'Hardcover',
          page_count: bookData.pages,
          genre_id: selectedGenre,
          genre_name: genreMeta.genre_name,
          color: genreMeta.color,
          publication_date: bookData.full_date
        })
        .select().single();

      // 3. Sync to legacy 'books' table for visibility in current library UI
      const { data: genreBooks } = await supabase.from('books')
        .select('book_index')
        .eq('genre_id', selectedGenre)
        .order('book_index', { ascending: false })
        .limit(1);
      const nextIndex = (genreBooks?.[0]?.book_index || 0) + 1;

      const { data: legacyBook } = await supabase.from('books').insert({
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        cover_url: bookData.cover,
        isbn: bookData.isbn,
        genre_id: selectedGenre,
        genre_name: genreMeta.genre_name,
        color: genreMeta.color,
        page_count: bookData.pages,
        book_index: nextIndex,
        publication_date: bookData.full_date,
        note: bookData.description
      }).select().single();

      // 4. Link to User Archive (using legacy book_id for dual support)
      // Inherit existing review for this work if it exists
      const { data: workEds } = await supabase.from('editions').select('id').eq('work_id', workId);
      const wEdIds = (workEds || []).map(e => e.id);
      
      const { data: wReview } = await supabase
        .from('user_books')
        .select('rating, review, status')
        .eq('user_id', user.id)
        .in('edition_id', wEdIds)
        .order('review', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.from('user_books').insert({
        user_id: user.id,
        edition_id: newEdition.id,
        book_id: legacyBook.id,
        status: wReview?.status || 'unread',
        rating: wReview?.rating || 0,
        review: wReview?.review || '',
        owned_at: new Date().toISOString()
      });

      if (onComplete) onComplete(bookData);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save to archive.");
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
