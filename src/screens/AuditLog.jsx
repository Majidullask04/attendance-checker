import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatTime, formatDate, confidenceLabel, getEmployeeName, getEmployeeAvatar } from '../utils/formatters.js';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  X,
  FileText,
  CheckCircle2,
  UserCheck,
  Search,
} from 'lucide-react';

const FRAUD_CHECKS = [
  {
    id: 'qr-token',
    label: 'Dynamic QR Token Auth',
    desc: 'Rotating station token signatures validated on every scan',
  },
  {
    id: 'replay-guard',
    label: 'Anti-Replay Protection',
    desc: 'Each token signature is consumed once per employee check-in event',
  },
  {
    id: 'clock-drift',
    label: 'Time Sync Audit',
    desc: 'Checks for device clock drift against authorized standard time',
  },
  {
    id: 'fingerprint',
    label: 'Device Verification',
    desc: 'Validates hardware sessions to prevent proxy punching',
  },
  {
    id: 'geofence',
    label: 'Geofence Proximity',
    desc: 'Confirms scan location is within approved station perimeter',
  },
  {
    id: 'rate-limit',
    label: 'Scan Rate Limiting',
    desc: 'Prevents duplicate triggers with automatic scan cooldowns',
  },
];

export default function AuditLog({ store }) {
  const { isAdmin, user } = useAuth();
  const { auditRecords = [], teamSummary = [], correctRecord, addToast, setActiveScreen } = store;
  const [correcting, setCorrecting] = useState(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | flagged | verified | corrected

  if (!isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="unauthorized-card">
          <div className="unauthorized-icon"><Lock size={32} /></div>
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

  const filteredRecords = [...auditRecords]
    .filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const empName = getEmployeeName(r, teamSummary, user).toLowerCase();
      const query = searchQuery.toLowerCase();
      const type = (r.record_type || r.recordType || '').toLowerCase();
      return empName.includes(query) || type.includes(query);
    })
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
      {/* Header */}
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Security & Verification Audit Trail</h1>
          <p className="screen-sub">
            Verified scan log for check-ins, break resumptions, overtime, and shift compliance.
          </p>
        </div>
        {flagged.length > 0 && (
          <div className="audit-flag-count">
            <span className="badge badge--danger badge--lg">
              <AlertTriangle size={14} /> {flagged.length} Flagged
            </span>
          </div>
        )}
      </div>

      {/* Security Policies */}
      <div className="audit-fraud-panel">
        <h3 className="section-title">
          <ShieldCheck size={16} className="text-success" /> Active Security Controls
        </h3>
        <div className="fraud-checks-grid stagger-group">
          {FRAUD_CHECKS.map((fc) => (
            <div key={fc.id} className="fraud-check-item interactive-item">
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
            <AlertTriangle size={16} /> Attention Required — Low Confidence Scans
          </h3>
          <div className="records-group stagger-group">
            {flagged.map((r) => {
              const type = r.record_type || r.recordType;
              const time = r.recorded_at || r.recordedAt;
              const score = r.confidence_score || r.confidenceScore || 45;
              const conf = confidenceLabel(score);
              const empName = getEmployeeName(r, teamSummary, user);
              const avatar = getEmployeeAvatar(r, teamSummary);

              return (
                <div key={r.id} className="record-row record-row--flagged interactive-item">
                  <div className="emp-cell">
                    <span className="emp-avatar">{avatar}</span>
                    <div className="emp-name font-semibold">{empName}</div>
                  </div>
                  <div
                    className={`record-type-badge ${
                      type === 'check_in' ? 'badge-in' : 'badge-out'
                    }`}
                  >
                    {type === 'check_in' ? 'CHECK IN' : 'CHECK OUT'}
                  </div>
                  <div className="record-time font-mono">
                    {formatDate(time)} {formatTime(time)}
                  </div>
                  <div className="record-badges">
                    <span className={`badge badge--${conf.color}`}>
                      {score}% confidence
                    </span>
                    {r.is_offline_sync === 1 && (
                      <span className="badge badge--warning">Offline Sync</span>
                    )}
                  </div>
                  <button
                    className="btn-correct"
                    onClick={() => handleCorrect(r)}
                    id={`btn-correct-${r.id?.slice(-6)}`}
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
        <div className="audit-table-header-row">
          <h3 className="section-title">
            <FileText size={16} className="text-accent" /> Live Event Stream (Latest Entries)
          </h3>

          <div className="audit-table-filters">
            <div className="audit-search-wrap">
              <Search size={14} className="text-muted" />
              <input
                type="text"
                placeholder="Search employee or event…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="audit-search-input"
              />
            </div>

            <div className="filter-tabs">
              {[
                ['all', 'All'],
                ['verified', 'Verified'],
                ['flagged', 'Flagged'],
                ['corrected', 'Corrected'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  className={`filter-tab ${statusFilter === val ? 'active' : ''}`}
                  onClick={() => setStatusFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="audit-log-table">
          <div className="audit-log-header">
            <span>Timestamp</span>
            <span>Employee</span>
            <span>Scan Action</span>
            <span>Method</span>
            <span>Location</span>
            <span>Confidence</span>
            <span>Status</span>
          </div>
          <div className="stagger-group">
            {filteredRecords.map((r) => {
              const type = r.record_type || r.recordType;
              const time = r.recorded_at || r.recordedAt;
              const score = r.confidence_score || r.confidenceScore || 95;
              const conf = confidenceLabel(score);
              const empName = getEmployeeName(r, teamSummary, user);
              const avatar = getEmployeeAvatar(r, teamSummary);
              const loc = r.location_name || 'Main HQ';

              return (
                <div
                  key={r.id}
                  className={`audit-log-row ${
                    r.status === 'flagged' ? 'audit-log-row--flagged' : ''
                  } interactive-item`}
                >
                  <span className="font-mono text-muted">
                    {formatDate(time)} {formatTime(time)}
                  </span>
                  <span className="font-medium emp-name-cell">
                    <span className="emp-avatar-sm">{avatar}</span>
                    <span>{empName}</span>
                  </span>
                  <span>
                    <span
                      className={`record-type-badge-sm ${
                        type === 'check_in' || type === 'break_end'
                          ? 'badge-in'
                          : type === 'break_start'
                          ? 'badge-warning'
                          : type === 'ot_start' || type === 'ot_end'
                          ? 'badge-ot'
                          : 'badge-out'
                      }`}
                    >
                      {type === 'check_in'
                        ? '▲ Check In'
                        : type === 'check_out'
                        ? '▼ Check Out'
                        : type === 'break_start'
                        ? '☕ Break Start'
                        : type === 'break_end'
                        ? '▶ Break Resume'
                        : type === 'ot_start'
                        ? '⚡ OT Start'
                        : type === 'ot_end'
                        ? '⏹ OT Stop'
                        : type}
                    </span>
                  </span>
                  <span className="font-mono text-accent">QR SCAN</span>
                  <span className="text-secondary text-sm">{loc}</span>
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
                      {r.status || 'verified'}
                    </span>
                  </span>
                </div>
              );
            })}
            {filteredRecords.length === 0 && (
              <div className="empty-state">
                <div className="empty-text">No audit entries found matching your filter</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Correction Modal */}
      {correcting && (
        <div className="modal-overlay" onClick={() => setCorrecting(null)}>
          <div
            className="modal fade-in"
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
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-info">
                <strong>Audit Compliance:</strong> Correcting this entry creates a verified update note linked with your administrator credentials ({user?.email || 'Admin'}).
              </p>
              <div className="modal-record">
                <div>Employee: <strong>{getEmployeeName(correcting, teamSummary, user)}</strong></div>
                <div>
                  Recorded Time:{' '}
                  <span className="font-mono">
                    {formatDate(correcting.recorded_at || correcting.recordedAt)}{' '}
                    {formatTime(correcting.recorded_at || correcting.recordedAt)}
                  </span>
                </div>
                <div>Location: <span>{correcting.location_name || 'Main HQ'}</span></div>
              </div>

              <label className="modal-label" htmlFor="correction-reason">
                Reason for Correction *
              </label>
              <textarea
                id="correction-reason"
                className="modal-textarea"
                rows={3}
                placeholder="e.g. Employee verified on site by Foreman Dave — camera lens smudge prevented instant auto-scan."
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

