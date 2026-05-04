import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import './Navbar.css';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, signOut, loading } = useAuth();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Prevent scrolling when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <nav className={`navbar ${isOpen ? 'navbar--open' : ''}`} id="main-nav">
      <div className="navbar__inner container">
        <NavLink to="/" className="navbar__logo" id="nav-logo">
          <img src="/logo.png" alt="Connor's Collection" className="navbar__logo-img" />
        </NavLink>

        <button 
          className={`navbar__hamburger ${isOpen ? 'navbar__hamburger--open' : ''}`}
          onClick={toggleMenu}
          aria-label="Toggle navigation"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className={`navbar__menu ${isOpen ? 'navbar__menu--open' : ''}`}>
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
          
          <div className="navbar__actions">
            <ThemeToggle />
            {loading ? null : user ? (
              <button 
                onClick={signOut} 
                className="navbar__auth-btn"
                title={`Signed in as ${user.email}`}
              >
                Sign Out
              </button>
            ) : (
              <NavLink 
                to="/login" 
                className="navbar__login-link"
              >
                Sign In
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
