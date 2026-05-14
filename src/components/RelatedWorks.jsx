import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './RelatedWorks.css';

export default function RelatedWorks({ currentBookId, themes = [], vibes = [], author, seriesName }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchRelated() {
      const bookId = parseInt(currentBookId);
      if (isNaN(bookId)) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        const activeThemes = (themes || []).filter(t => t && t.trim() !== '');
        const activeVibes = (vibes || []).filter(v => v && v.trim() !== '');

        if (!activeThemes.length && !activeVibes.length) {
          setLoading(false);
          return;
        }

        const themeArr = activeThemes.map(t => `"${t}"`).join(',');
        const vibeArr = activeVibes.map(v => `"${v}"`).join(',');
        
        const orConditions = [];
        if (activeThemes.length) orConditions.push(`motifs.ov.{${themeArr}}`);
        if (activeVibes.length) orConditions.push(`vibes.ov.{${vibeArr}}`);
        
        let query = supabase
          .from('works')
          .select('id, title, author, series_name, motifs, vibes, editions(cover_image_url, cover_url)')
          .or(orConditions.join(','))
          .neq('id', bookId);
        
        if (seriesName) {
          query = query.neq('series_name', seriesName);
        }
        
        const { data: candidates, error } = await query.limit(30);
        
        if (error) {
          console.error('[RelatedWorks] Query error:', error);
          setLoading(false);
          return;
        }

        // Scoring Algorithm
        const scored = (candidates || []).map(work => {
          let score = 0;
          
          // Theme intersection
          const sharedThemes = (work.motifs || []).filter(t => themes.includes(t));
          score += sharedThemes.length;
          
          // Vibe intersection
          const sharedVibes = (work.vibes || []).filter(v => vibes.includes(v));
          score += sharedVibes.length;
          
          // Author match
          if (work.author === author) {
            score += 3;
          }

          // Process cover
          const editions = work.editions || [];
          const validEdition = editions.find(e => e.cover_image_url || e.cover_url);
          
          return {
            ...work,
            score,
            cover_image_url: validEdition?.cover_image_url || validEdition?.cover_url
          };
        });

        // Sort by score descending and slice top 4
        const sorted = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);

        setRelated(sorted);
      } catch (err) {
        console.error('[RelatedWorks] Critical fetch failure:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchRelated();
  }, [currentBookId, themes, vibes, author, seriesName]);

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
