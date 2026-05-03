import { useState, useEffect } from 'react';
import './ViewToggle.css';

export default function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="Library view">
      <button
        className={`view-toggle__btn ${view === 'grid' ? 'view-toggle__btn--active' : ''}`}
        onClick={() => onChange('grid')}
        title="Grid view"
        aria-pressed={view === 'grid'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <rect x="13" y="3" width="8" height="8" rx="1.5"/>
          <rect x="3" y="13" width="8" height="8" rx="1.5"/>
          <rect x="13" y="13" width="8" height="8" rx="1.5"/>
        </svg>
        Grid
      </button>
      <button
        className={`view-toggle__btn ${view === 'list' ? 'view-toggle__btn--active' : ''}`}
        onClick={() => onChange('list')}
        title="List view"
        aria-pressed={view === 'list'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="3" y="4" width="18" height="2.5" rx="1.25"/>
          <rect x="3" y="10.75" width="18" height="2.5" rx="1.25"/>
          <rect x="3" y="17.5" width="18" height="2.5" rx="1.25"/>
        </svg>
        List
      </button>
    </div>
  );
}
