import { useState } from 'react';
import { api } from '../api/client';
import { Zap, User, Mail, KeyRound, Building, ArrowRight, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';

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

          <button type="submit" className="btn-login-primary" disabled={isLoading}>
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
            <span>Account requires administrator approval prior to first shift login.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
