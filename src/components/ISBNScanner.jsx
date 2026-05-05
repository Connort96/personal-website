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
        author: bookInfo.authors?.[0]?.name || 'Unknown Author',
        publisher: bookInfo.publishers?.[0]?.name || 'Unknown Publisher',
        year: bookInfo.publish_date || 'Unknown',
        cover: bookInfo.cover?.large || bookInfo.cover?.medium || '',
        pages: bookInfo.number_of_pages || 0,
        isbn: isbn
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
          format: 'Hardcover',
          page_count: bookData.pages
        })
        .select().single();

      // 3. Link to User Archive
      await supabase.from('user_books').insert({
        user_id: user.id,
        edition_id: newEdition.id,
        status: 'unread',
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
                  <div className="book-preview">
                    {bookData.cover && <img src={bookData.cover} alt="Cover" />}
                    <div className="book-info">
                      <h3>{bookData.title}</h3>
                      <p className="author">{bookData.author}</p>
                      <p className="meta">{bookData.publisher} • {bookData.year}</p>
                    </div>
                  </div>
                  <div className="confirmation-actions">
                    <button onClick={handleAddToArchive} className="scanner-btn-add">Add to Archive</button>
                    <button onClick={restartScanner} className="scanner-btn-cancel">Cancel</button>
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
