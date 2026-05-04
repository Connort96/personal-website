import React, { useState, useEffect, useRef } from 'react';
import './Image.css';

/**
 * A custom Image component that mimics some Next.js Image optimizations.
 * It uses native lazy loading, async decoding, and a CSS fade-in animation once loaded.
 */
export default function Image({ src, alt, className = '', style = {}, ...props }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    // If the image is cached, it might already be loaded before the effect runs
    if (imgRef.current && imgRef.current.complete) {
      setIsLoaded(true);
    }
  }, []);

  return (
    <div className={`opt-image-wrapper ${className}`} style={style}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`opt-image ${isLoaded ? 'opt-image--loaded' : ''}`}
        onLoad={() => setIsLoaded(true)}
        {...props}
      />
    </div>
  );
}
