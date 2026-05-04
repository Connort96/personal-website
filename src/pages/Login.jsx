import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import './Login.css';

export default function Login() {
  const { user, signInWithGitHub, signInWithGoogle, signInWithEmail, sendPasswordResetEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // If already logged in, redirect to collection
  if (user && !showForgot) {
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="login-page container container--narrow animate-fade-in-up">
        <div className="login-card">
          <h1 className="login-title">Reset Password</h1>
          <p className="login-subtitle">We'll send a recovery link to your email.</p>
          
          {error && <div className="login-error">{error}</div>}
          {resetSent ? (
            <div className="login-success">
              <p>Recovery link sent! Please check your inbox.</p>
              <button onClick={() => setShowForgot(false)} className="login-btn login-btn--email" style={{ marginTop: 'var(--space-4)' }}>
                Back to Login
              </button>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleResetPassword}>
              <div className="login-input-group">
                <label htmlFor="reset-email">Email Address</label>
                <input 
                  type="email" 
                  id="reset-email" 
                  value={resetEmail} 
                  onChange={(e) => setResetEmail(e.target.value)} 
                  required 
                />
              </div>
              <button type="submit" className="login-btn login-btn--email" disabled={loading}>
                {loading ? 'Sending...' : 'Send Recovery Link'}
              </button>
              <button type="button" className="login-forgot-link" onClick={() => setShowForgot(false)}>
                Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password">Password</label>
              <button type="button" className="login-forgot-link" onClick={() => setShowForgot(true)}>
                Forgot?
              </button>
            </div>
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
