import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatTime, formatDate, confidenceLabel } from '../utils/formatters.js';

const FRAUD_CHECKS = [
  {
    id: 'qr-token',
    label: 'Dynamic QR Token Auth',
    desc: 'Validates against active rotating token signature from station manager in SQLite',
  },
  {
    id: 'replay-guard',
    label: 'Anti-Replay Lock',
    desc: 'Each token signature can only be consumed once per user check-in event',
  },
  {
    id: 'clock-drift',
    label: 'Clock Drift Audit',
    desc: 'Flags device timestamps that deviate > 5 minutes from server clock',
  },
  {
    id: 'fingerprint',
    label: 'Device Signature Audit',
    desc: 'Cross-checks hardware identifier to mitigate proxy / buddy punching',
  },
  {
    id: 'geofence',
    label: 'Geofence Proximity Check',
    desc: 'GPS coordinate distance must fall within approved perimeter radius',
  },
  {
    id: 'rate-limit',
    label: 'Check-In Rate Limiting',
    desc: 'Strict 30-second cooldown between state transition triggers',
  },
];

export default function AuditLog({ store }) {
  const { isAdmin, user } = useAuth();
  const { auditRecords, correctRecord, addToast, setActiveScreen } = store;
  const [correcting, setCorrecting] = useState(null);
  const [correctionNote, setCorrectionNote] = useState('');

  if (!isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="unauthorized-card">
          <div className="unauthorized-icon">🔒</div>
          <h2>Admin Restricted Section</h2>
          <p>You need Administrator privileges to access security audit logs and corrections.</p>
          <button className="btn-primary" onClick={() => setActiveScreen('dashboard')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const flagged = auditRecords.filter((r) => r.status === 'flagged');
  const all = [...auditRecords]
    .sort(
      (a, b) =>
        new Date(b.recorded_at || b.recordedAt) - new Date(a.recorded_at || a.recordedAt)
    )
    .slice(0, 50);

  const handleCorrect = (record) => {
    setCorrecting(record);
    setCorrectionNote('');
  };

  const submitCorrection = async () => {
    if (!correctionNote.trim()) {
      addToast('Please provide a legitimate reason for correction', 'error');
      return;
    }
    await correctRecord(correcting.id, correctionNote);
    setCorrecting(null);
    setCorrectionNote('');
  };

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Security & Compliance Audit Trail</h1>
          <p className="screen-sub">
            Immutable SQLite-backed ledger with QR token signatures and fraud detection heuristics.
          </p>
        </div>
        {flagged.length > 0 && (
          <div className="audit-flag-count">
            <span className="badge badge--danger badge--lg">
              ⚑ {flagged.length} flagged records
            </span>
          </div>
        )}
      </div>

      {/* Fraud Controls Grid */}
      <div className="audit-fraud-panel">
        <h3 className="section-title">🛡️ Active Fraud Mitigation Engine</h3>
        <div className="fraud-checks-grid">
          {FRAUD_CHECKS.map((fc) => (
            <div key={fc.id} className="fraud-check-item">
              <div className="fraud-check-dot" />
              <div className="fraud-check-body">
                <div className="fraud-check-label">{fc.label}</div>
                <div className="fraud-check-desc">{fc.desc}</div>
              </div>
              <span className="badge badge--success">Enforced</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged Records Section */}
      {flagged.length > 0 && (
        <div className="audit-section">
          <h3 className="section-title text-danger">
            ⚑ Low-Confidence Records — Action Required
          </h3>
          <div className="records-group">
            {flagged.map((r) => {
              const type = r.record_type || r.recordType;
              const time = r.recorded_at || r.recordedAt;
              const token = r.qr_token || r.qrTokenId;
              const score = r.confidence_score || r.confidenceScore || 45;
              const conf = confidenceLabel(score);

              return (
                <div key={r.id} className="record-row record-row--flagged">
                  <div className="record-emp">
                    {r.userName || r.userEmail || r.user_id}
                  </div>
                  <div
                    className={`record-type-badge ${
                      type === 'check_in' ? 'badge-in' : 'badge-out'
                    }`}
                  >
                    {type === 'check_in' ? '▲ IN' : '▼ OUT'}
                  </div>
                  <div className="record-time font-mono">
                    {formatDate(time)} {formatTime(time)}
                  </div>
                  <div className="record-badges">
                    <span className={`badge badge--${conf.color}`}>
                      {score}% confidence
                    </span>
                    <span className="badge badge--neutral">
                      Token: {token?.slice(0, 10)}…
                    </span>
                    {r.is_offline_sync === 1 && (
                      <span className="badge badge--warning">Offline Sync</span>
                    )}
                  </div>
                  <button
                    className="btn-correct"
                    onClick={() => handleCorrect(r)}
                    id={`btn-correct-${r.id.slice(-6)}`}
                  >
                    Audit / Correct
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="audit-section">
        <h3 className="section-title">📋 Immutable Event Stream (Latest 50 Entries)</h3>
        <div className="audit-log-table">
          <div className="audit-log-header">
            <span>Timestamp</span>
            <span>Employee</span>
            <span>Event</span>
            <span>Verification</span>
            <span>QR Token Ref</span>
            <span>Confidence</span>
            <span>Status</span>
          </div>
          {all.map((r) => {
            const type = r.record_type || r.recordType;
            const time = r.recorded_at || r.recordedAt;
            const token = r.qr_token || r.qrTokenId;
            const score = r.confidence_score || r.confidenceScore || 90;
            const conf = confidenceLabel(score);

            return (
              <div
                key={r.id}
                className={`audit-log-row ${
                  r.status === 'flagged' ? 'audit-log-row--flagged' : ''
                }`}
              >
                <span className="font-mono">
                  {formatDate(time)} {formatTime(time)}
                </span>
                <span>{r.userName || r.userEmail || r.user_id}</span>
                <span>
                  <span
                    className={`record-type-badge-sm ${
                      type === 'check_in' ? 'badge-in' : 'badge-out'
                    }`}
                  >
                    {type === 'check_in' ? '▲ IN' : '▼ OUT'}
                  </span>
                </span>
                <span className="font-mono text-accent">QR_CODE</span>
                <span className="font-mono text-muted" title={token}>
                  {token ? `${token.slice(0, 10)}…` : '---'}
                </span>
                <span>
                  <span className={`badge badge--${conf.color}`}>
                    {score}%
                  </span>
                </span>
                <span>
                  <span
                    className={`badge badge--${
                      r.status === 'flagged'
                        ? 'danger'
                        : r.status === 'corrected'
                        ? 'info'
                        : 'success'
                    }`}
                  >
                    {r.status}
                  </span>
                </span>
              </div>
            );
          })}
          {all.length === 0 && (
            <div className="empty-state">
              <div className="empty-text">No audit records logged in database yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Immutable Correction Modal */}
      {correcting && (
        <div className="modal-overlay" onClick={() => setCorrecting(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h2 className="modal-title">Administrative Record Correction</h2>
              <button
                className="modal-close"
                onClick={() => setCorrecting(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-info">
                <strong>Append-Only Protocol:</strong> The original record is preserved in SQLite. A linked correction note will be saved with your administrator email ({user?.email}) for labor and audit compliance.
              </p>
              <div className="modal-record">
                <div>Record ID: {correcting.id}</div>
                <div>User: {correcting.userName || correcting.userEmail || correcting.user_id}</div>
                <div>
                  Recorded:{' '}
                  {formatDate(correcting.recorded_at || correcting.recordedAt)}{' '}
                  {formatTime(correcting.recorded_at || correcting.recordedAt)}
                </div>
                <div>QR Token: {correcting.qr_token || correcting.qrTokenId}</div>
              </div>

              <label className="modal-label" htmlFor="correction-reason">
                Justification for Correction *
              </label>
              <textarea
                id="correction-reason"
                className="modal-textarea"
                rows={3}
                placeholder="e.g. Employee verified on site by Foreman Dave — camera lens smudge prevented QR auto-scan."
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setCorrecting(null)}
              >
                Cancel
              </button>
              <button
                id="btn-submit-correction"
                className="btn-primary"
                onClick={submitCorrection}
              >
                Submit Correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
