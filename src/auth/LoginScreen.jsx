import { useState } from 'react';
import { useAuth } from './AuthContext';
import GoogleAuthModal from '../components/GoogleAuthModal.jsx';
import { Zap, Mail, KeyRound, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onToggle }) {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

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
      if (err.message?.includes('PENDING_APPROVAL')) {
        setError('Your account is pending admin approval. Please wait for activation.');
      } else {
        setError(err.message || 'Invalid email or password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignInClick = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res?.needsModal) {
        setIsGoogleModalOpen(true);
      }
    } catch (err) {
      setError(err.message || 'Google authentication failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSelectGoogleAccount = async (accountDetails) => {
    setIsGoogleModalOpen(false);
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle(accountDetails);
    } catch (err) {
      setError(err.message || 'Failed to sign in with selected Google account.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-glow-bg" />
      <div className="login-card fade-in">
        <div className="login-header">
          <div className="login-logo-icon">
            <Zap size={22} className="zap-icon" />
          </div>
          <h1 className="login-title">MrElectric</h1>
          <p className="login-subtitle">Sign in to your attendance operations portal</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <AlertTriangle size={16} className="login-error-icon" />
            <span>{error}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          className="btn-google-auth interactive-item"
          onClick={handleGoogleSignInClick}
          disabled={isGoogleLoading || isLoading}
        >
          <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isGoogleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
        </button>

        <div className="login-divider">
          <span>or continue with email</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Work Email</label>
            <div className="input-icon-wrap">
              <Mail size={16} className="input-icon" />
              <input
                id="login-email"
                type="email"
                className="form-input form-input--icon font-mono"
                placeholder="name@mrelectric.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Password</label>
            <div className="input-icon-wrap">
              <KeyRound size={16} className="input-icon" />
              <input
                id="login-password"
                type="password"
                className="form-input form-input--icon"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="btn-login-primary interactive-item" disabled={isLoading || isGoogleLoading}>
            <span>{isLoading ? 'Signing In…' : 'Sign In with Password'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-divider"><span>new team member?</span></div>

        <button type="button" className="btn-secondary" onClick={onToggle} style={{ width: '100%' }}>
          Create New Employee Account
        </button>

        <div className="login-footer-info">
          <div className="login-security-pill">
            <ShieldCheck size={14} className="text-success" />
            <span>Admin panel is strictly protected for verified admin Google emails.</span>
          </div>
        </div>
      </div>

      {/* Google Account Picker Modal */}
      <GoogleAuthModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        onSelectAccount={handleSelectGoogleAccount}
      />
    </div>
  );
}

