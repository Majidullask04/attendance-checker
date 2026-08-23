import { useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

export default function SignupScreen({ onToggle }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', department: 'Electrical' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const departments = ['Electrical', 'Plumbing', 'HVAC', 'Carpentry', 'Management', 'Other'];

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
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
          <div className="login-logo-icon">⚡</div>
          <h1 className="login-title">Join MrElectric</h1>
          <p className="login-subtitle">Create your employee account</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert">
            <span className="login-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="login-success-alert" role="alert" style={{ background: '#dcfce7', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✅</span>
            <span>{success}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              name="name"
              type="text"
              className="form-input"
              placeholder="Arjun Mehta"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Work Email</label>
            <input
              name="email"
              type="email"
              className="form-input font-mono"
              placeholder="arjun@mrelectric.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Department</label>
            <select
              name="department"
              className="form-input"
              value={form.department}
              onChange={handleChange}
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              name="password"
              type="password"
              className="form-input"
              placeholder="Min 6 characters"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              className="form-input"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn-login-primary" disabled={isLoading}>
            {isLoading ? 'Creating Account…' : 'Create Account →'}
          </button>
        </form>

        <div className="login-divider"><span>already have an account?</span></div>

        <button type="button" className="btn-secondary" onClick={onToggle} style={{ width: '100%' }}>
          Sign In Instead
        </button>

        <div className="login-footer-info">
          <div className="login-security-pill">
            <span className="security-icon">🔒</span>
            <span>Your account will be reviewed by an administrator before activation.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
