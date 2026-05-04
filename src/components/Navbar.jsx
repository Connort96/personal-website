import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import './Navbar.css';

export default function Navbar() {
  const location = useLocation();
  const { user, signOut, loading } = useAuth();
  return (
    <nav className="navbar" id="main-nav">
      <div className="navbar__inner container">
        <NavLink to="/" className="navbar__logo" id="nav-logo">
          <span className="navbar__logo-dot"></span>
          <span className="navbar__logo-text">collected</span>
        </NavLink>
        <ul className="navbar__links">
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-home"
            >
              Home
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/blog"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-blog"
            >
              Blog
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/music"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-music"
            >
              Music
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/books"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-books"
            >
              Books
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/collection"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-collection"
            >
              Collection
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/travel"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-travel"
            >
              Travel
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/films"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-films"
            >
              Films
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/about"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-about"
            >
              About
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/now"
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              id="nav-now"
            >
              Now
            </NavLink>
          </li>
          {user && user.email === 'theconison96@gmail.com' && (
            <li>
              <NavLink
                to="/admin"
                className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
                id="nav-admin"
              >
                Admin
              </NavLink>
            </li>
          )}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', paddingLeft: 'var(--space-4)', gap: 'var(--space-4)' }}>
          <ThemeToggle />
          {loading ? null : user ? (
            <button 
              onClick={signOut} 
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: '500' }}
              title={`Signed in as ${user.email}`}
            >
              Sign Out
            </button>
          ) : (
            <NavLink 
              to="/login" 
              style={{ color: 'var(--accent-secondary)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: '500' }}
            >
              Sign In
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
