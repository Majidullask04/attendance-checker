import { useState } from 'react';
import { X, ArrowRight, ShieldCheck, UserPlus } from 'lucide-react';
import { checkIsAdminEmail } from '../lib/neonAuth.js';

const PRESET_GOOGLE_ACCOUNTS = [
  {
    name: 'Mr. Electric Admin',
    email: 'mrelectricalworks02@gmail.com',
    role: 'Admin',
    department: 'Management & HQ',
    avatar: '⚡',
    badge: 'Verified Admin',
  },
  {
    name: 'Arjun Mehta',
    email: 'arjun.mehta@gmail.com',
    role: 'Technician',
    department: 'Electrical Operations',
    avatar: '👷',
    badge: 'Staff',
  },
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@gmail.com',
    role: 'Technician',
    department: 'HVAC & Inspection',
    avatar: '👩‍🔧',
    badge: 'Staff',
  },
];

export default function GoogleAuthModal({ isOpen, onClose, onSelectAccount }) {
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  if (!isOpen) return null;

  const handleSelectPreset = (acc) => {
    onSelectAccount({
      email: acc.email,
      name: acc.name,
      avatar: acc.avatar,
      department: acc.department,
    });
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    const email = customEmail.trim();
    const name = customName.trim() || email.split('@')[0].replace(/[._\d-]+/g, ' ');
    const isAdmin = checkIsAdminEmail(email);

    onSelectAccount({
      email,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      avatar: isAdmin ? '⚡' : '👷',
      department: isAdmin ? 'Executive Admin' : 'Field Operations',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="google-auth-modal fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="google-auth-header">
          <div className="google-brand">
            <svg className="google-icon-lg" width="24" height="24" viewBox="0 0 24 24">
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
            <div>
              <h2 className="google-modal-title">Sign in with Google</h2>
              <p className="google-modal-sub">Choose an account to continue to MrElectric</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!isCustomMode ? (
          <div className="google-accounts-list">
            {PRESET_GOOGLE_ACCOUNTS.map((acc) => {
              const isAdmin = checkIsAdminEmail(acc.email);
              return (
                <button
                  key={acc.email}
                  className="google-account-item interactive-item"
                  onClick={() => handleSelectPreset(acc)}
                >
                  <div className="google-account-avatar">{acc.avatar}</div>
                  <div className="google-account-info">
                    <div className="google-account-name">{acc.name}</div>
                    <div className="google-account-email font-mono">{acc.email}</div>
                  </div>
                  <span className={`badge badge--${isAdmin ? 'accent' : 'neutral'}`}>
                    {acc.badge}
                  </span>
                </button>
              );
            })}

            <div className="google-modal-divider">
              <span>or use another account</span>
            </div>

            <button
              type="button"
              className="google-add-account-btn"
              onClick={() => setIsCustomMode(true)}
            >
              <UserPlus size={16} />
              <span>Sign in with a different Google email</span>
            </button>
          </div>
        ) : (
          <form className="google-custom-form" onSubmit={handleCustomSubmit}>
            <div className="form-group">
              <label className="form-label">Google Email Address</label>
              <input
                type="email"
                className="form-input font-mono"
                placeholder="you@gmail.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Your Name (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Rahul Kumar"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>

            <div className="google-form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCustomMode(false)}
              >
                Back
              </button>
              <button type="submit" className="btn-primary">
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        )}

        <div className="google-modal-footer">
          <ShieldCheck size={14} className="text-success" />
          <span>Only verified admin Google emails are granted access to admin controls.</span>
        </div>
      </div>
    </div>
  );
}
