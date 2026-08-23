import { useAuth } from './AuthContext';

export default function PendingApproval() {
  const { logout } = useAuth();

  return (
    <div className="login-page">
      <div className="login-glow-bg" />
      <div className="login-card fade-in" style={{ textAlign: 'center', maxWidth: '420px' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>⏳</div>
        <h1 className="login-title">Account Pending Approval</h1>
        <p style={{ color: '#64748b', marginBottom: '24px', lineHeight: 1.6 }}>
          Your registration has been submitted successfully. 
          An administrator needs to review and approve your account before you can access the attendance portal.
        </p>
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <p style={{ color: '#92400e', fontSize: '14px', margin: 0 }}>
            <strong>What happens next?</strong><br />
            • An admin will review your details<br />
            • You'll receive access once approved<br />
            • Check back later or contact your supervisor
          </p>
        </div>
        <button className="btn-secondary" onClick={logout} style={{ width: '100%' }}>
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
}
