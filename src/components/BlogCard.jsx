import { Link } from 'react-router-dom';
import './BlogCard.css';

export default function BlogCard({ post, index = 0 }) {
  const delay = Math.min(index * 0.08, 0.4);
  const dateStr = new Date(post.published_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <article
      className="blog-card animate-fade-in-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <Link to={`/blog/${post.slug}`} className="blog-card__link" id={`blog-card-${post.id}`}>
        <div className="blog-card__content">
          <div className="blog-card__meta">
            <time className="blog-card__date">{dateStr}</time>
          </div>
          <h2 className="blog-card__title">{post.title}</h2>
          <p className="blog-card__excerpt">{post.excerpt}</p>
        </div>
        <div className="blog-card__arrow">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </Link>
    </article>
  );
}
