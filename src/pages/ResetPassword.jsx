import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Login.css'; // Reuse login styles

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }

    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page container container--narrow animate-fade-in-up">
      <div className="login-card">
        <h1 className="login-title">New Password</h1>
        <p className="login-subtitle">Enter your new password below.</p>
        
        {error && <div className="login-error">{error}</div>}
        {success && (
          <div className="login-success">
            Password updated successfully! Redirecting to login...
          </div>
        )}

        <form className="login-form" onSubmit={handleUpdatePassword}>
          <div className="login-input-group">
            <label htmlFor="password">New Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>
          <div className="login-input-group">
            <label htmlFor="confirm-password">Confirm New Password</label>
            <input 
              type="password" 
              id="confirm-password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" className="login-btn login-btn--email" disabled={loading || success}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
