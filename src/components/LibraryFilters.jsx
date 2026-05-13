import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './LibraryFilters.css';

export default function LibraryFilters({ themes = [], vibes = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openDropdown, setOpenDropdown] = useState(null);
  const containerRef = useRef(null);

  const activeTheme = searchParams.get('theme');
  const activeVibe = searchParams.get('vibe');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenDropdown(null);
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
    setOpenDropdown(null);
  };

  const clearFilters = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('theme');
    newParams.delete('vibe');
    setSearchParams(newParams);
  };

  return (
    <div className="library-filters" ref={containerRef}>
      <div className="library-filters__dropdowns">
        {/* Themes Dropdown */}
        <div className="custom-dropdown">
          <button 
            className={`dropdown-trigger ${activeTheme ? 'dropdown-trigger--active' : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'themes' ? null : 'themes')}
          >
            <span>{activeTheme || 'THEMES'}</span>
            <motion.span animate={{ rotate: openDropdown === 'themes' ? 180 : 0 }}>▾</motion.span>
          </button>
          
          <AnimatePresence>
            {openDropdown === 'themes' && (
              <motion.div 
                className="dropdown-menu"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="dropdown-menu__scroll">
                  {themes.sort().map(theme => (
                    <button 
                      key={theme} 
                      className={`dropdown-item ${activeTheme === theme ? 'dropdown-item--active' : ''}`}
                      onClick={() => handleSelect('theme', theme)}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Vibes Dropdown */}
        <div className="custom-dropdown">
          <button 
            className={`dropdown-trigger ${activeVibe ? 'dropdown-trigger--active' : ''}`}
            onClick={() => setOpenDropdown(openDropdown === 'vibes' ? null : 'vibes')}
          >
            <span>{activeVibe || 'VIBES'}</span>
            <motion.span animate={{ rotate: openDropdown === 'vibes' ? 180 : 0 }}>▾</motion.span>
          </button>
          
          <AnimatePresence>
            {openDropdown === 'vibes' && (
              <motion.div 
                className="dropdown-menu"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="dropdown-menu__scroll">
                  {vibes.sort().map(vibe => (
                    <button 
                      key={vibe} 
                      className={`dropdown-item ${activeVibe === vibe ? 'dropdown-item--active' : ''}`}
                      onClick={() => handleSelect('vibe', vibe)}
                    >
                      {vibe}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {(activeTheme || activeVibe) && (
        <button className="reset-filters-btn" onClick={clearFilters}>
          Reset Filters
        </button>
      )}
    </div>
  );
}
