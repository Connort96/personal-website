import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './RelatedWorks.css';

export default function RelatedWorks({ currentBookId, themes = [], vibes = [] }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchRelated() {
      setLoading(true);
      try {
        let results = [];
        
        // 1. Semantic Match (Themes/Vibes)
        if (themes?.length || vibes?.length) {
          const themeArr = (themes || []).map(t => `"${t}"`).join(',');
          const vibeArr = (vibes || []).map(v => `"${v}"`).join(',');
          
          const orConditions = [];
          if (themes?.length) orConditions.push(`motifs.ov.{${themeArr}}`);
          if (vibes?.length) orConditions.push(`vibes.ov.{${vibeArr}}`);
          
          const { data } = await supabase
            .from('works')
            .select('id, title, author, cover_image_url')
            .or(orConditions.join(','))
            .neq('id', currentBookId)
            .limit(4);
          
          results = data || [];
        }

        // 2. Fallback: Same Author (if less than 2 semantic matches)
        if (results.length < 2) {
          // Get author of current book
          const { data: currentBook } = await supabase.from('works').select('author').eq('id', currentBookId).single();
          if (currentBook?.author) {
            const { data: authorMatches } = await supabase
              .from('works')
              .select('id, title, author, cover_image_url')
              .eq('author', currentBook.author)
              .neq('id', currentBookId)
              .limit(4 - results.length);
            
            // Add unique matches
            const existingIds = new Set(results.map(r => r.id));
            (authorMatches || []).forEach(am => {
              if (!existingIds.has(am.id)) results.push(am);
            });
          }
        }

        setRelated(results.slice(0, 4));
      } catch (err) {
        console.error('[RelatedWorks] Failed to fetch:', err);
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
