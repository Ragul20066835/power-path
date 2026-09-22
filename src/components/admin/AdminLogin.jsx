import React, { useState } from 'react';
import { Shield, Lock, User, AlertCircle, ArrowLeft } from 'lucide-react';

/**
 * AdminLogin - Dedicated authentication gate for /admin
 */
export function AdminLogin({ onLogin, onExitToPlayer }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username/email and password.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await onLogin(username, password);
      if (!result || !result.success) {
        setError(result?.error || result?.message || 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-wrapper animate-fade-in">
      <div className="admin-login-card animate-scale-up">
        <div className="login-header">
          <div className="admin-shield-icon">
            <Shield size={32} className="text-cyan-400" />
          </div>
          <h2 className="login-title">ADMIN CONTROL PANEL</h2>
          <p className="login-subtitle">POWERPATH &bull; Event Operations Access</p>
        </div>

        {error && (
          <div className="form-error-alert animate-shake">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="admin-username">
              USERNAME / EMAIL
            </label>
            <div className="input-wrapper">
              <User size={18} className="input-icon" />
              <input
                id="admin-username"
                type="text"
                className="form-input"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">
              PASSWORD
            </label>
            <div className="input-wrapper">
              <Lock size={18} className="input-icon" />
              <input
                id="admin-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={isLoading}
          >
            <Lock size={16} />
            <span>{isLoading ? 'AUTHENTICATING...' : 'ACCESS ADMIN PANEL'}</span>
          </button>
        </form>

        <div className="login-footer-actions">
          <button
            type="button"
            className="back-to-player-link"
            onClick={onExitToPlayer}
          >
            <ArrowLeft size={14} />
            <span>Return to Player Game</span>
          </button>
          <span className="demo-hint-text">Prototype credentials: admin / admin123</span>
        </div>
      </div>
    </div>
  );
}
