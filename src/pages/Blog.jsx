import BlogCard from '../components/BlogCard';
import { posts } from '../data/posts';
import './Blog.css';

export default function Blog() {
  return (
    <div className="blog-page">
      <div className="container container--narrow">
        <header className="page-header animate-fade-in-up">
          <h1 className="page-header__title">Blog</h1>
          <p className="page-header__subtitle">
            Thoughts on slow living, music, books, and the art of paying attention.
          </p>
        </header>
        <div className="blog-list">
          {posts.map((post, i) => (
            <BlogCard key={post.id} post={post} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
