import { ShieldAlert, Lock, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ADMIN_EMAIL } from '../config/auth.js';

export default function AdminGuard({ onBack, children }) {
  const { user, isAdmin } = useAuth();

  if (isAdmin) {
    return children;
  }

  return (
    <div className="screen fade-in">
      <div className="admin-restricted-card">
        <div className="restricted-icon-wrap">
          <Lock size={36} className="text-warning" />
        </div>
        <h2 className="restricted-title">Admin Email Verification Required</h2>
        <p className="restricted-desc">
          This section contains organizational attendance ledgers, QR generation, employee approval controls, and audit trails.
        </p>

        <div className="restricted-notice-box">
          <div className="restricted-notice-header">
            <MailCheck size={16} className="text-accent" />
            <span>Authorized Admin Protocol</span>
          </div>
          <p className="restricted-notice-text">
            Access is restricted to verified administrator Google credentials (e.g. <code>{ADMIN_EMAIL}</code>).
          </p>
          <div className="restricted-current-user font-mono">
            Signed in as: <strong>{user?.email || 'Unknown User'}</strong>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={onBack}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <ArrowLeft size={16} />
          <span>Return to My Attendance Dashboard</span>
        </button>
      </div>
    </div>
  );
}
