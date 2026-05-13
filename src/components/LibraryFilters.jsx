import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './LibraryFilters.css';

export default function LibraryFilters({ themes = [], vibes = [], selectedCollection, onCollectionChange, collections = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const activeTheme = searchParams.get('theme');
  const activeVibe = searchParams.get('vibe');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (type, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (type === 'theme') {
      newParams.set('theme', value);
      newParams.delete('vibe');
    } else {
      newParams.set('vibe', value);
      newParams.delete('theme');
    }
    setSearchParams(newParams);
    setIsOpen(false);
  };

  return (
    <div className="library-filters" ref={containerRef}>
      <button 
        className={`add-filter-btn ${isOpen ? 'add-filter-btn--open' : ''} ${(activeTheme || activeVibe || selectedCollection !== 'all') ? 'add-filter-btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="add-filter-btn__icon">+</span>
        <span>Add Filter</span>
        { (activeTheme || activeVibe || selectedCollection !== 'all') && <span className="add-filter-indicator" /> }
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="unified-filter-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="filter-dropdown-content">
              {/* COLLECTIONS SECTION */}
              <div className="filter-section">
                <h4 className="filter-section-title">Collections</h4>
                <div className="filter-options">
                  <button 
                    className={`filter-option ${selectedCollection === 'all' ? 'filter-option--active' : ''}`}
                    onClick={() => { onCollectionChange('all'); setIsOpen(false); }}
                  >
                    All Collections
                  </button>
                  {collections.map(c => (
                    <button 
                      key={c}
                      className={`filter-option ${selectedCollection === c ? 'filter-option--active' : ''}`}
                      onClick={() => { onCollectionChange(c); setIsOpen(false); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* THEMES SECTION */}
              <div className="filter-section">
                <h4 className="filter-section-title">Themes</h4>
                <div className="filter-options">
                  {themes.sort().map(theme => (
                    <button 
                      key={theme} 
                      className={`filter-option ${activeTheme === theme ? 'filter-option--active' : ''}`}
                      onClick={() => handleSelect('theme', theme)}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              {/* VIBES SECTION */}
              <div className="filter-section">
                <h4 className="filter-section-title">Vibes</h4>
                <div className="filter-options">
                  {vibes.sort().map(vibe => (
                    <button 
                      key={vibe} 
                      className={`filter-option ${activeVibe === vibe ? 'filter-option--active' : ''}`}
                      onClick={() => handleSelect('vibe', vibe)}
                    >
                      {vibe}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
