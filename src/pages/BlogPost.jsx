import { useParams, Link } from 'react-router-dom';
import { posts } from '../data/posts';
import './BlogPost.css';

export default function BlogPost() {
  const { id } = useParams();
  const post = posts.find(p => p.id === id);

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

  // Simple markdown-like rendering
  const renderContent = (content) => {
    const lines = content.trim().split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('### ')) {
        elements.push(<h3 key={i}>{line.replace('### ', '').replace(/\*/g, '')}</h3>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={i}>{line.replace('## ', '')}</h2>);
      } else if (line.startsWith('- **')) {
        // Collect list items
        const items = [];
        let j = i;
        while (j < lines.length && lines[j].startsWith('- ')) {
          const text = lines[j].replace(/^- /, '');
          const parts = text.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={idx}>{part.slice(2, -2)}</strong>;
            }
            return part;
          });
          items.push(<li key={j}>{parts}</li>);
          j++;
        }
        elements.push(<ul key={i}>{items}</ul>);
        i = j - 1;
      } else if (line.match(/^\d+\. /)) {
        const items = [];
        let j = i;
        while (j < lines.length && lines[j].match(/^\d+\. /)) {
          const text = lines[j].replace(/^\d+\. /, '');
          const parts = text.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={idx}>{part.slice(2, -2)}</strong>;
            }
            return part;
          });
          items.push(<li key={j}>{parts}</li>);
          j++;
        }
        elements.push(<ol key={i}>{items}</ol>);
        i = j - 1;
      } else if (line.trim() === '') {
        // skip
      } else {
        // Render paragraph with inline formatting
        const parts = line.split(/(\*[^*]+\*)/g).map((part, idx) => {
          if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
            return <em key={idx}>{part.slice(1, -1)}</em>;
          }
          return part;
        });
        elements.push(<p key={i}>{parts}</p>);
      }
      i++;
    }
    return elements;
  };

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
          <div className="blog-post__content">
            {renderContent(post.content)}
          </div>
        </article>
      </div>
    </div>
  );
}
