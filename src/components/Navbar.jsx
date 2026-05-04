import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import './Navbar.css';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const location = useLocation();
  const { user, signOut, loading } = useAuth();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
    setActiveDropdown(null);
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

  const toggleDropdown = (name, e) => {
    if (window.innerWidth <= 768) {
      e.preventDefault();
      setActiveDropdown(activeDropdown === name ? null : name);
    }
  };

  const navLinks = {
    journal: [
      { name: 'Blog', to: '/blog' },
      { name: 'Now', to: '/now' },
    ],
    collections: [
      { name: 'Books', to: '/books' },
      { name: 'Cinema', to: '/films' },
      { name: 'Music', to: '/music' },
      { name: 'Travel', to: '/travel' },
    ]
  };

  return (
    <nav className={`navbar ${isOpen ? 'navbar--open' : ''}`} id="main-nav">
      <div className="navbar__inner container">
        {/* Editorial Wordmark */}
        <NavLink to="/" className="navbar__logo" id="nav-logo">
          CONNOR’S COLLECTIONS
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
            {/* Journal Dropdown */}
            <li 
              className="navbar__item navbar__item--has-dropdown"
              onMouseEnter={() => window.innerWidth > 768 && setActiveDropdown('journal')}
              onMouseLeave={() => window.innerWidth > 768 && setActiveDropdown(null)}
            >
              <button 
                className="navbar__link navbar__link--dropdown-trigger"
                onClick={(e) => toggleDropdown('journal', e)}
              >
                Journal
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="navbar__dropdown-arrow">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <AnimatePresence>
                {activeDropdown === 'journal' && (
                  <motion.div 
                    className="navbar__dropdown"
                    initial={window.innerWidth > 768 ? { opacity: 0, y: 10 } : { height: 0, opacity: 0 }}
                    animate={window.innerWidth > 768 ? { opacity: 1, y: 0 } : { height: 'auto', opacity: 1 }}
                    exit={window.innerWidth > 768 ? { opacity: 0, y: 10 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {navLinks.journal.map(link => (
                      <NavLink key={link.to} to={link.to} className="navbar__dropdown-link">
                        {link.name}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>

            {/* Collections Dropdown */}
            <li 
              className="navbar__item navbar__item--has-dropdown"
              onMouseEnter={() => window.innerWidth > 768 && setActiveDropdown('collections')}
              onMouseLeave={() => window.innerWidth > 768 && setActiveDropdown(null)}
            >
              <button 
                className="navbar__link navbar__link--dropdown-trigger"
                onClick={(e) => toggleDropdown('collections', e)}
              >
                Collections
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="navbar__dropdown-arrow">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <AnimatePresence>
                {activeDropdown === 'collections' && (
                  <motion.div 
                    className="navbar__dropdown"
                    initial={window.innerWidth > 768 ? { opacity: 0, y: 10 } : { height: 0, opacity: 0 }}
                    animate={window.innerWidth > 768 ? { opacity: 1, y: 0 } : { height: 'auto', opacity: 1 }}
                    exit={window.innerWidth > 768 ? { opacity: 0, y: 10 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {navLinks.collections.map(link => (
                      <NavLink key={link.to} to={link.to} className="navbar__dropdown-link">
                        {link.name}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>

            <li>
              <NavLink to="/collection" className="navbar__link">Checklist</NavLink>
            </li>
            <li>
              <NavLink to="/about" className="navbar__link">About</NavLink>
            </li>
          </ul>
          
          <div className="navbar__actions">
            <ThemeToggle />
            
            {/* Admin Utility Icon */}
            {user && user.email === 'theconison96@gmail.com' && (
              <NavLink 
                to="/admin" 
                className="navbar__utility-link" 
                title="Admin Dashboard"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </NavLink>
            )}

            {loading ? null : user ? (
              <button onClick={signOut} className="navbar__utility-link" title="Sign Out">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            ) : (
              <NavLink to="/login" className="navbar__utility-link" title="Sign In">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
