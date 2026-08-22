import { useState } from 'react';
import { useAuth } from './AuthContext';
import { ADMIN_EMAIL } from '../config/auth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    try {
      setIsLoading(true);
      login(email.trim());
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (targetEmail) => {
    setEmail(targetEmail);
    setError('');
    login(targetEmail);
  };

  return (
    <div className="login-page">
      <div className="login-glow-bg" />
      
      <div className="login-card fade-in">
        <div className="login-header">
          <div className="login-logo-icon">⚡</div>
          <h1 className="login-title">MrElectric</h1>
          <p className="login-subtitle">Role-Based Attendance & QR Access Portal</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <span className="login-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Work Email Address
            </label>
            <div className="input-wrapper">
              <input
                id="login-email"
                type="email"
                className="form-input font-mono"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                autoComplete="email"
                autoFocus
              />
            </div>
            <span className="form-hint">
              Enter your assigned email to access your attendance workspace.
            </span>
          </div>

          <button
            id="btn-login-submit"
            type="submit"
            className="btn-login-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Signing In…' : 'Sign In to Portal →'}
          </button>
        </form>

        <div className="login-divider">
          <span>or select quick demo profile</span>
        </div>

        <div className="quick-login-grid">
          <button
            type="button"
            id="btn-quick-admin"
            className="quick-login-btn quick-login-btn--admin"
            onClick={() => handleQuickLogin(ADMIN_EMAIL)}
          >
            <div className="quick-login-avatar">👑</div>
            <div className="quick-login-info">
              <div className="quick-login-name">System Administrator</div>
              <div className="quick-login-email font-mono">{ADMIN_EMAIL}</div>
            </div>
            <span className="badge badge--warning">Admin</span>
          </button>

          <button
            type="button"
            id="btn-quick-user-1"
            className="quick-login-btn"
            onClick={() => handleQuickLogin('arjun@mrelectric.com')}
          >
            <div className="quick-login-avatar">👷</div>
            <div className="quick-login-info">
              <div className="quick-login-name">Arjun Mehta (Technician)</div>
              <div className="quick-login-email font-mono">arjun@mrelectric.com</div>
            </div>
            <span className="badge badge--neutral">User</span>
          </button>

          <button
            type="button"
            id="btn-quick-user-2"
            className="quick-login-btn"
            onClick={() => handleQuickLogin('priya@mrelectric.com')}
          >
            <div className="quick-login-avatar">👩‍🔧</div>
            <div className="quick-login-info">
              <div className="quick-login-name">Priya Sharma (Field Eng)</div>
              <div className="quick-login-email font-mono">priya@mrelectric.com</div>
            </div>
            <span className="badge badge--neutral">User</span>
          </button>
        </div>

        <div className="login-footer-info">
          <div className="login-security-pill">
            <span className="security-icon">🔒</span>
            <span>Cryptographic Geofence & QR One-Time Token System</span>
          </div>
        </div>
      </div>
    </div>
  );
}
