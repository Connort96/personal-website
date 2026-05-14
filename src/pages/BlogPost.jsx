import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './BlogPost.css';

export default function BlogPost() {
  const { id } = useParams(); // Now this is the slug
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPost() {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            *,
            works (
              id,
              title,
              author,
              editions!work_id ( cover_url )
            )
          `)
          .eq('slug', id)
          .single();

        if (error) throw error;
        setPost(data);
      } catch (err) {
        console.error('Error fetching post:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [id]);

  if (loading) {
    return (
      <div className="blog-post-page">
        <div className="container container--narrow">
          <p>Loading post...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="blog-post-page">
        <div className="container container--narrow">
          <div className="blog-post-not-found animate-fade-in-up">
            <h1>Post not found</h1>
            <p>The post you're looking for doesn't exist.</p>
            <Link to="/blog" className="blog-post__back">← Back to Blog</Link>
          </div>
        </div>
      </div>
    );
  }

  const dateStr = new Date(post.published_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Handle works which might have multiple editions. We just grab the first one with a cover.
  const book = post.works;
  const coverUrl = book?.editions?.find(e => e.cover_url)?.cover_url || book?.editions?.[0]?.cover_url;

  return (
    <div className="blog-post-page">
      <div className="container container--narrow">
        <Link to="/blog" className="blog-post__back animate-fade-in-up" id="back-to-blog">
          ← Back to Blog
        </Link>
        <article className="blog-post animate-fade-in-up animate-stagger-2" id={`blog-post-${post.id}`}>
          {post.featured_image && (
            <div className="blog-post__featured-image">
              <img src={post.featured_image} alt={post.title} />
            </div>
          )}
          <header className="blog-post__header">
            <div className="blog-post__meta">
              <time>{dateStr}</time>
            </div>
            <h1 className="blog-post__title">{post.title}</h1>
          </header>
          <div
            className="blog-post__content"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {book && (
            <div className="blog-post__linked-book">
              <h3>Featured Book</h3>
              <div className="linked-book-card">
                {coverUrl ? (
                  <img src={coverUrl} alt={book.title} className="linked-book-card__cover" />
                ) : (
                  <div className="linked-book-card__cover linked-book-card__cover--placeholder">
                    {book.title[0]}
                  </div>
                )}
                <div className="linked-book-card__info">
                  <h4>{book.title}</h4>
                  <p>{book.author}</p>
                  <Link to="/books" className="linked-book-card__link">View in Library →</Link>
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
