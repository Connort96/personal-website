import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const { user, signInWithGitHub, signInWithGoogle, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to collection
  if (user) {
    return <Navigate to="/collection" replace />;
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page container container--narrow animate-fade-in-up">
      <div className="login-card">
        <h1 className="login-title">Access Collection</h1>
        <p className="login-subtitle">Sign in to sync your book checklist across devices.</p>
        
        {error && <div className="login-error">{error}</div>}

        <div className="login-oauth">
          <button 
            onClick={() => signInWithGitHub()} 
            className="login-btn login-btn--github"
          >
            Continue with GitHub
          </button>
          <button 
            onClick={() => signInWithGoogle()} 
            className="login-btn login-btn--google"
          >
            Continue with Google
          </button>
        </div>

        <div className="login-divider">
          <span>OR</span>
        </div>

        <form className="login-form" onSubmit={handleEmailLogin}>
          <div className="login-input-group">
            <label htmlFor="email">Email</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="login-input-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" className="login-btn login-btn--email" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
