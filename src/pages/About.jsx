import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Image from '../components/Image';
import './About.css';

export default function About() {
  const [gear, setGear] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGear() {
      try {
        const { data, error } = await supabase
          .from('gear')
          .select('*')
          .order('category')
          .order('name');

        if (error) throw error;
        setGear(data || []);
      } catch (err) {
        console.error('Error fetching gear:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchGear();
  }, []);

  return (
    <div className="about-page animate-fade-in">
      <div className="container container--narrow">
        <header className="page-header">
          <h1 className="page-header__title">About</h1>
          <p className="page-header__subtitle">Who I am and what I use.</p>
        </header>

        <section className="about-bio animate-fade-in-up">
          <p>
            Welcome to my digital garden. I'm a writer, traveler, and enthusiast of all things analog and well-crafted.
            This site serves as a central repository for my thoughts, the books I read, the films I watch, and the places I explore.
          </p>
          <p>
            I believe in the power of slow living, intentional curation, and building tools that last.
          </p>
        </section>

        <section className="about-gear animate-fade-in-up animate-stagger-1">
          <h2 className="about-section-title">What I Use</h2>
          {loading ? (
            <p>Loading gear...</p>
          ) : gear.length === 0 ? (
            <p className="about-empty">No gear listed yet.</p>
          ) : (
            <div className="gear-grid">
              {gear.map((item, i) => {
                const delay = Math.min(i * 0.05, 0.4);
                return (
                  <div 
                    key={item.id} 
                    className="gear-card animate-fade-in-up"
                    style={{ animationDelay: `${delay}s` }}
                  >
                    {item.image_url && (
                      <div className="gear-card__image-wrapper">
                        <Image src={item.image_url} alt={item.name} className="gear-card__image" />
                      </div>
                    )}
                    <div className="gear-card__content">
                      <span className="gear-card__category">{item.category}</span>
                      <h3 className="gear-card__title">
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noreferrer">{item.name}</a>
                        ) : (
                          item.name
                        )}
                      </h3>
                      {item.description && <p className="gear-card__desc">{item.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
