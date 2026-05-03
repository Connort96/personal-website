import { Link } from 'react-router-dom';
import { posts } from '../data/postLoader';
import { albums } from '../data/music';
import { books } from '../data/books';
import './Home.css';

export default function Home() {
  const latestPosts = posts.slice(0, 3);
  const featuredAlbums = albums.slice(0, 4);
  const currentlyReading = books.filter(b => b.status === 'currently-reading');

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero" id="hero-section">
        <div className="hero__bg"></div>
        <div className="hero__content container">
          <div className="hero__text animate-fade-in-up">
            <p className="hero__greeting">Welcome to</p>
            <h1 className="hero__title">
              <span className="hero__title-line">collected</span>
            </h1>
            <p className="hero__subtitle">
              A personal space for words, sounds, and stories.
              <br />
              Blog posts, music I love, and books that shaped me.
            </p>
            <div className="hero__actions">
              <Link to="/blog" className="hero__cta hero__cta--primary" id="hero-cta-blog">
                Read the Blog
              </Link>
              <Link to="/music" className="hero__cta hero__cta--secondary" id="hero-cta-music">
                Browse Music
              </Link>
            </div>
          </div>
          <div className="hero__visual animate-fade-in-up animate-stagger-3">
            <div className="hero__orb hero__orb--1"></div>
            <div className="hero__orb hero__orb--2"></div>
            <div className="hero__orb hero__orb--3"></div>
          </div>
        </div>
      </section>

      {/* Latest Posts */}
      <section className="home-section" id="latest-posts">
        <div className="container">
          <div className="home-section__header">
            <h2 className="home-section__title animate-fade-in-up">Latest Writing</h2>
            <Link to="/blog" className="home-section__link animate-fade-in-up animate-stagger-1">
              View all posts →
            </Link>
          </div>
          <div className="home-posts">
            {latestPosts.map((post, i) => (
              <Link
                to={`/blog/${post.id}`}
                key={post.id}
                className="home-post animate-fade-in-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <time className="home-post__date">
                  {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </time>
                <h3 className="home-post__title">{post.title}</h3>
                <p className="home-post__excerpt">{post.excerpt}</p>
                <span className="home-post__read-time">{post.readTime}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Music Highlights */}
      <section className="home-section home-section--alt" id="music-highlights">
        <div className="container">
          <div className="home-section__header">
            <h2 className="home-section__title animate-fade-in-up">From the Collection</h2>
            <Link to="/music" className="home-section__link animate-fade-in-up animate-stagger-1">
              Full collection →
            </Link>
          </div>
          <div className="home-albums">
            {featuredAlbums.map((album, i) => (
              <div
                key={album.id}
                className="home-album animate-fade-in-up"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div
                  className="home-album__cover"
                  style={{ backgroundColor: album.coverColor }}
                >
                  <div className="home-album__cover-inner">
                    <span className="home-album__initial">{album.artist[0]}</span>
                  </div>
                </div>
                <h3 className="home-album__title">{album.title}</h3>
                <p className="home-album__artist">{album.artist}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Currently Reading */}
      {currentlyReading.length > 0 && (
        <section className="home-section" id="currently-reading">
          <div className="container">
            <div className="home-section__header">
              <h2 className="home-section__title animate-fade-in-up">Currently Reading</h2>
              <Link to="/books" className="home-section__link animate-fade-in-up animate-stagger-1">
                All books →
              </Link>
            </div>
            <div className="home-reading">
              {currentlyReading.map((book, i) => (
                <div
                  key={book.id}
                  className="home-book animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div
                    className="home-book__cover"
                    style={{ backgroundColor: book.coverColor }}
                  >
                    <span className="home-book__cover-text">{book.title.split(':')[0]}</span>
                  </div>
                  <div className="home-book__info">
                    <h3 className="home-book__title">{book.title}</h3>
                    <p className="home-book__author">{book.author}</p>
                    <p className="home-book__notes">{book.notes}</p>
                    <span className="home-book__status">📖 Reading now</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
