import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import BlogCard from '../components/BlogCard';
import './Blog.css';

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('id, title, slug, excerpt, published_at')
          .order('published_at', { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      } catch (err) {
        console.error('Error fetching posts:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

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
          {loading ? (
            <p>Loading posts...</p>
          ) : posts.length > 0 ? (
            posts.map((post, i) => (
              <BlogCard key={post.id} post={post} index={i} />
            ))
          ) : (
            <p>No posts yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
