import { useAuth } from './AuthContext';
import { Clock, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function PendingApproval() {
  const { logout } = useAuth();

  return (
    <div className="login-page">
      <div className="login-glow-bg" />
      <div className="login-card fade-in" style={{ textAlign: 'center', maxWidth: '440px' }}>
        <div className="pending-icon-wrap" style={{ margin: '0 auto 16px', width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-warning-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-warning)' }}>
          <Clock size={28} />
        </div>
        <h1 className="login-title">Account Pending Approval</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.6, fontSize: '0.9rem' }}>
          Your registration has been submitted successfully. 
          An administrator needs to review and approve your account before you can access the attendance ops station.
        </p>
        <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--color-warning)', fontWeight: 600, fontSize: '0.85rem' }}>
            <ShieldAlert size={16} />
            <span>Next Steps</span>
          </div>
          <ul style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', paddingLeft: '18px', lineHeight: 1.6 }}>
            <li>An administrator will verify your employee profile</li>
            <li>Once approved, you can immediately sign in and scan station QRs</li>
            <li>For urgent access, contact your operations supervisor</li>
          </ul>
        </div>
        <button className="btn-secondary" onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <ArrowLeft size={16} />
          <span>Back to Sign In</span>
        </button>
      </div>
    </div>
  );
}
