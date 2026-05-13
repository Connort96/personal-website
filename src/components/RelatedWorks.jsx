import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './RelatedWorks.css';

export default function RelatedWorks({ currentBookId, themes = [], vibes = [] }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const bookId = parseInt(currentBookId);
    if (isNaN(bookId)) {
      console.warn('[RelatedWorks] Invalid currentBookId:', currentBookId);
      setLoading(false);
      return;
    }

    async function fetchRelated() {
      setLoading(true);
      console.log(`[RelatedWorks] Searching for books similar to #${bookId}`, { themes, vibes });
      
      try {
        let results = [];
        
        // 1. Semantic Match (Themes/Vibes)
        const activeThemes = (themes || []).filter(t => t && t.trim() !== '');
        const activeVibes = (vibes || []).filter(v => v && v.trim() !== '');

        if (activeThemes.length || activeVibes.length) {
          const themeArr = activeThemes.map(t => `"${t}"`).join(',');
          const vibeArr = activeVibes.map(v => `"${v}"`).join(',');
          
          const orConditions = [];
          if (activeThemes.length) orConditions.push(`motifs.ov.{${themeArr}}`);
          if (activeVibes.length) orConditions.push(`vibes.ov.{${vibeArr}}`);
          
          console.log('[RelatedWorks] Querying semantic match:', orConditions.join(','));
          
          const { data, error } = await supabase
            .from('works')
            .select('id, title, author, editions(cover_image_url, cover_url)')
            .or(orConditions.join(','))
            .neq('id', bookId)
            .limit(4);
          
          if (error) {
            console.error('[RelatedWorks] Semantic query error:', error);
          } else {
            // Process results to find the first valid cover across all editions
            results = (data || []).map(work => {
              const editions = work.editions || [];
              const validEdition = editions.find(e => e.cover_image_url || e.cover_url);
              return {
                ...work,
                cover_image_url: validEdition?.cover_image_url || validEdition?.cover_url
              };
            });
            console.log(`[RelatedWorks] Semantic match found ${results.length} items.`);
          }
        }

        // 2. Fallback: Same Author (if less than 2 semantic matches)
        if (results.length < 2) {
          console.log('[RelatedWorks] Results < 2, trying author fallback...');
          const { data: currentBook, error: authFetchErr } = await supabase
            .from('works')
            .select('author')
            .eq('id', bookId)
            .single();

          if (authFetchErr) {
             console.error('[RelatedWorks] Failed to fetch current book author:', authFetchErr);
          } else if (currentBook?.author) {
            console.log(`[RelatedWorks] Current author: ${currentBook.author}. Searching for matches...`);
            const { data: authorMatches, error: authErr } = await supabase
              .from('works')
              .select('id, title, author, editions(cover_image_url, cover_url)')
              .eq('author', currentBook.author)
              .neq('id', bookId)
              .limit(4 - results.length);
            
            if (authErr) {
              console.error('[RelatedWorks] Author fallback error:', authErr);
            } else {
              // Flatten cover URLs for fallback results
              const processedMatches = (authorMatches || []).map(work => {
                const editions = work.editions || [];
                const validEdition = editions.find(e => e.cover_image_url || e.cover_url);
                return {
                  ...work,
                  cover_image_url: validEdition?.cover_image_url || validEdition?.cover_url
                };
              });

              // Add unique matches
              const existingIds = new Set(results.map(r => r.id));
              processedMatches.forEach(am => {
                if (!existingIds.has(am.id)) results.push(am);
              });
              console.log(`[RelatedWorks] Author fallback added ${authorMatches?.length || 0} items.`);
            }
          }
        }

        setRelated(results.slice(0, 4));
      } catch (err) {
        console.error('[RelatedWorks] Critical fetch failure:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchRelated();
  }, [currentBookId, themes, vibes]);

  if (loading) return <div className="related-works-loading">Finding related volumes...</div>;
  if (!related.length) return null;

  return (
    <div className="related-works">
      <h3 className="related-works__header">RELATED IN THE ARCHIVE</h3>
      <div className="related-works__grid">
        {related.map(book => (
          <button 
            key={book.id} 
            className="related-book-card"
            onClick={() => navigate(`/book/${book.id}`)}
          >
            <div className="related-book-card__cover">
              {book.cover_image_url ? (
                <img src={book.cover_image_url} alt={book.title} />
              ) : (
                <div className="related-cover-placeholder">{book.title[0]}</div>
              )}
            </div>
            <div className="related-book-card__info">
              <span className="related-book-card__title">{book.title}</span>
              <span className="related-book-card__author">{book.author}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
