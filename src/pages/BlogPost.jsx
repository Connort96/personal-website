import { useParams, Link } from 'react-router-dom';
import { getPost } from '../data/postLoader';
import './BlogPost.css';

export default function BlogPost() {
  const { id } = useParams();
  const post = getPost(id);

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

  const dateStr = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="blog-post-page">
      <div className="container container--narrow">
        <Link to="/blog" className="blog-post__back animate-fade-in-up" id="back-to-blog">
          ← Back to Blog
        </Link>
        <article className="blog-post animate-fade-in-up animate-stagger-2" id={`blog-post-${post.id}`}>
          <header className="blog-post__header">
            <div className="blog-post__meta">
              <time>{dateStr}</time>
              <span>·</span>
              <span>{post.readTime}</span>
            </div>
            <h1 className="blog-post__title">{post.title}</h1>
            <div className="blog-post__tags">
              {post.tags.map(tag => (
                <span key={tag} className="blog-post__tag">{tag}</span>
              ))}
            </div>
          </header>
          <div
            className="blog-post__content"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />
        </article>
      </div>
    </div>
  );
}
