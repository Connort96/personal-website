import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container animate-fade-in" style={{ paddingTop: '150px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    // Redirect to login if unauthenticated
    return <Navigate to="/login" replace />;
  }

  return children;
}
