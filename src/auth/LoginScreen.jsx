import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginScreen({ onToggle }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      // Handle specific error codes
      if (err.message?.includes('PENDING_APPROVAL')) {
        setError('⏳ Your account is pending admin approval. Please wait or contact your administrator.');
      } else {
        setError(err.message || 'Invalid email or password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-glow-bg" />
      <div className="login-card fade-in">
        <div className="login-header">
          <div className="login-logo-icon">⚡</div>
          <h1 className="login-title">MrElectric</h1>
          <p className="login-subtitle">Sign in to your attendance portal</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <span className="login-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Work Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input font-mono"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-login-primary" disabled={isLoading}>
            {isLoading ? 'Signing In…' : 'Sign In →'}
          </button>
        </form>

        <div className="login-divider"><span>new employee?</span></div>

        <button type="button" className="btn-secondary" onClick={onToggle} style={{ width: '100%' }}>
          Create New Account
        </button>

        <div className="login-footer-info">
          <div className="login-security-pill">
            <span className="security-icon">🔒</span>
            <span>Secure password-protected access with admin approval.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
