import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import GoogleAuthModal from '../components/GoogleAuthModal.jsx';
import { Zap, User, Mail, KeyRound, Building, ArrowRight, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function SignupScreen({ onToggle }) {
  const { loginWithGoogle } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', department: 'Electrical' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

  const departments = ['Electrical', 'Plumbing', 'HVAC', 'Carpentry', 'Management', 'Other'];

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleGoogleSignUpClick = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res?.needsModal) {
        setIsGoogleModalOpen(true);
      }
    } catch (err) {
      setError(err.message || 'Google signup failed.');
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
      setError(err.message || 'Failed to sign up with selected Google account.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.signup({
        name: form.name,
        email: form.email,
        password: form.password,
        department: form.department,
      });
      setSuccess(res.message);
      setForm({ name: '', email: '', password: '', confirmPassword: '', department: 'Electrical' });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
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
          <h1 className="login-title">Join MrElectric</h1>
          <p className="login-subtitle">Create your technician employee account</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <AlertTriangle size={16} className="login-error-icon" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="login-success-alert" role="alert">
            <CheckCircle2 size={16} className="text-success" />
            <span>{success}</span>
          </div>
        )}

        {/* Google Signup Button */}
        <button
          type="button"
          className="btn-google-auth interactive-item"
          onClick={handleGoogleSignUpClick}
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
          <span>{isGoogleLoading ? 'Connecting to Google…' : 'Sign Up with Google'}</span>
        </button>

        <div className="login-divider">
          <span>or register with email</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div className="input-icon-wrap">
              <User size={16} className="input-icon" />
              <input
                name="name"
                type="text"
                className="form-input form-input--icon"
                placeholder="Arjun Mehta"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Work Email</label>
            <div className="input-icon-wrap">
              <Mail size={16} className="input-icon" />
              <input
                name="email"
                type="email"
                className="form-input form-input--icon font-mono"
                placeholder="you@mrelectric.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Department</label>
            <div className="input-icon-wrap">
              <Building size={16} className="input-icon" />
              <select
                name="department"
                className="form-input form-input--icon"
                value={form.department}
                onChange={handleChange}
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-icon-wrap">
              <KeyRound size={16} className="input-icon" />
              <input
                name="password"
                type="password"
                className="form-input form-input--icon"
                placeholder="Min 6 characters"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <div className="input-icon-wrap">
              <KeyRound size={16} className="input-icon" />
              <input
                name="confirmPassword"
                type="password"
                className="form-input form-input--icon"
                placeholder="Repeat password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-login-primary" disabled={isLoading || isGoogleLoading}>
            <span>{isLoading ? 'Creating Account…' : 'Create Account'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-divider"><span>already registered?</span></div>

        <button type="button" className="btn-secondary" onClick={onToggle} style={{ width: '100%' }}>
          Sign In Instead
        </button>

        <div className="login-footer-info">
          <div className="login-security-pill">
            <ShieldCheck size={14} className="text-success" />
            <span>Google sign-in activates instant access with verified credentials.</span>
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

