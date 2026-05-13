import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './RelatedWorks.css';

export default function RelatedWorks({ currentBookId, themes = [], vibes = [] }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[RelatedWorks] Themes:', themes, 'Vibes:', vibes);
    async function fetchRelated() {
      if (!themes?.length && !vibes?.length) {
        console.log('[RelatedWorks] No tags to search with');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Format tags for Postgres array syntax: {"tag one","tag two"}
        const themeArr = themes.map(t => `"${t}"`).join(',');
        const vibeArr = vibes.map(v => `"${v}"`).join(',');
        
        let query = supabase.from('works').select('id, title, author, cover_image_url');
        
        // Use .or with overlaps for both motifs and vibes
        const orConditions = [];
        if (themes.length) orConditions.push(`motifs.ov.{${themeArr}}`);
        if (vibes.length) orConditions.push(`vibes.ov.{${vibeArr}}`);
        
        const { data, error } = await query
          .or(orConditions.join(','))
          .neq('id', currentBookId)
          .limit(4);

        if (error) throw error;
        console.log('[RelatedWorks] Found:', data?.length, 'results');
        setRelated(data || []);
      } catch (err) {
        console.error('[RelatedWorks] Failed to fetch:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchRelated();
  }, [currentBookId, themes, vibes]);

  if (loading) return <div className="related-works-loading">Finding related volumes...</div>;
  // if (!related.length) return null;

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
