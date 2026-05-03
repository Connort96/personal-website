import { Link } from 'react-router-dom';
import './BlogCard.css';

const tagColors = {
  lifestyle: '#34d399',
  philosophy: '#60a5fa',
  music: '#f472b6',
  culture: '#fbbf24',
  books: '#a78bfa',
  personal: '#fb923c',
  mindfulness: '#2dd4bf',
  writing: '#e879f9',
  creativity: '#f87171',
};

export default function BlogCard({ post, index = 0 }) {
  const delay = Math.min(index * 0.08, 0.4);
  const dateStr = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <article
      className="blog-card animate-fade-in-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <Link to={`/blog/${post.id}`} className="blog-card__link" id={`blog-card-${post.id}`}>
        <div className="blog-card__content">
          <div className="blog-card__meta">
            <time className="blog-card__date">{dateStr}</time>
            <span className="blog-card__separator">·</span>
            <span className="blog-card__read-time">{post.readTime}</span>
          </div>
          <h2 className="blog-card__title">{post.title}</h2>
          <p className="blog-card__excerpt">{post.excerpt}</p>
          <div className="blog-card__tags">
            {post.tags.map(tag => (
              <span
                key={tag}
                className="blog-card__tag"
                style={{ '--tag-color': tagColors[tag] || '#8b5cf6' }}
              >
                {tag}
              </span>
            ))}
          </div>
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
