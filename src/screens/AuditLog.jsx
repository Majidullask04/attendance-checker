import { useState } from 'react';
import { formatTime, formatDate, confidenceLabel } from '../utils/formatters';

const FRAUD_CHECKS = [
  { id: 'gps-spoof',    label: 'GPS Spoofing Detection',   desc: 'Cross-checks WiFi BSSID against GPS coordinates' },
  { id: 'buddy-punch',  label: 'Buddy Punch Detection',    desc: 'Device fingerprinting per employee' },
  { id: 'clock-drift',  label: 'Clock Drift Monitor',      desc: 'Flags device timestamps > 5min from server' },
  { id: 'replay',       label: 'Replay Attack Guard',      desc: 'Idempotency keys + nonce validation' },
  { id: 'rate-limit',   label: 'Rate Limiting',            desc: 'Max 1 check-in per 30 seconds' },
  { id: 'impossible',   label: 'Impossible Travel',        desc: 'Flags suspicious location jumps' },
];

export default function AuditLog({ store }) {
  const { records, employees, correctRecord, addToast } = store;
  const [correcting, setCorrecting] = useState(null);
  const [correctionNote, setCorrectionNote] = useState('');

  const flagged = records.filter(r => r.status === 'flagged');
  const all = [...records].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt)).slice(0, 50);

  const handleCorrect = (record) => {
    setCorrecting(record);
    setCorrectionNote('');
  };

  const submitCorrection = () => {
    if (!correctionNote.trim()) { addToast('Please provide a reason for correction', 'error'); return; }
    correctRecord(correcting.id, correcting.recordedAt, correctionNote, 'mgr-001');
    setCorrecting(null);
    setCorrectionNote('');
  };

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Audit Log</h1>
          <p className="screen-sub">Immutable, append-only record — complete audit trail for compliance</p>
        </div>
        {flagged.length > 0 && (
          <div className="audit-flag-count">
            <span className="badge badge--danger badge--lg">⚑ {flagged.length} flagged</span>
          </div>
        )}
      </div>

      {/* Fraud Prevention Panel */}
      <div className="audit-fraud-panel">
        <h3 className="section-title">🔒 Fraud Prevention Controls</h3>
        <div className="fraud-checks-grid">
          {FRAUD_CHECKS.map(fc => (
            <div key={fc.id} className="fraud-check-item">
              <div className="fraud-check-dot" />
              <div className="fraud-check-body">
                <div className="fraud-check-label">{fc.label}</div>
                <div className="fraud-check-desc">{fc.desc}</div>
              </div>
              <span className="badge badge--success">Active</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged Records */}
      {flagged.length > 0 && (
        <div className="audit-section">
          <h3 className="section-title text-danger">⚑ Flagged Records — Needs Review</h3>
          <div className="records-group">
            {flagged.map(r => {
              const emp = employees.find(e => e.id === r.userId);
              const conf = confidenceLabel(r.confidenceScore);
              return (
                <div key={r.id} className="record-row record-row--flagged">
                  <div className="record-emp">{emp?.avatar} {emp?.name}</div>
                  <div className={`record-type-badge ${r.recordType === 'check_in' ? 'badge-in' : 'badge-out'}`}>
                    {r.recordType === 'check_in' ? '▲ IN' : '▼ OUT'}
                  </div>
                  <div className="record-time font-mono">{formatDate(r.recordedAt)} {formatTime(r.recordedAt)}</div>
                  <div className="record-badges">
                    <span className={`badge badge--${conf.color}`}>{r.confidenceScore}% confidence</span>
                    <span className="badge badge--neutral">{r.verifiedBy.toUpperCase()}</span>
                    {r.isOfflineSync && <span className="badge badge--warning">Offline Sync</span>}
                  </div>
                  <button
                    className="btn-correct"
                    onClick={() => handleCorrect(r)}
                    id={`btn-correct-${r.id.slice(-6)}`}
                  >
                    Correct
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Audit Log */}
      <div className="audit-section">
        <h3 className="section-title">📋 All Records (last 50)</h3>
        <div className="audit-log-table">
          <div className="audit-log-header">
            <span>Time</span>
            <span>Employee</span>
            <span>Type</span>
            <span>Verified By</span>
            <span>Confidence</span>
            <span>Status</span>
            <span>Flags</span>
          </div>
          {all.map(r => {
            const emp = employees.find(e => e.id === r.userId);
            const conf = confidenceLabel(r.confidenceScore);
            return (
              <div key={r.id} className={`audit-log-row ${r.status === 'flagged' ? 'audit-log-row--flagged' : ''}`}>
                <span className="font-mono">{formatDate(r.recordedAt)} {formatTime(r.recordedAt)}</span>
                <span>{emp?.avatar} {emp?.name}</span>
                <span>
                  <span className={`record-type-badge-sm ${r.recordType === 'check_in' ? 'badge-in' : 'badge-out'}`}>
                    {r.recordType === 'check_in' ? '▲ IN' : '▼ OUT'}
                  </span>
                </span>
                <span className="font-mono">{r.verifiedBy.toUpperCase()}</span>
                <span>
                  <span className={`badge badge--${conf.color}`}>{r.confidenceScore}%</span>
                </span>
                <span>
                  <span className={`badge badge--${r.status === 'flagged' ? 'danger' : r.status === 'corrected' ? 'info' : 'success'}`}>
                    {r.status}
                  </span>
                </span>
                <span>
                  {r.isOfflineSync && <span className="badge badge--warning">Offline</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Correction Modal */}
      {correcting && (
        <div className="modal-overlay" onClick={() => setCorrecting(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">Record Correction</h2>
              <button className="modal-close" onClick={() => setCorrecting(null)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body">
              <p className="modal-info">
                A new correction record will be created — the original is never modified.
                This action is logged in the audit trail.
              </p>
              <div className="modal-record">
                <div className="font-mono">ID: {correcting.id.slice(-12)}</div>
                <div>Time: {formatDate(correcting.recordedAt)} {formatTime(correcting.recordedAt)}</div>
                <div>Score: {correcting.confidenceScore}%</div>
              </div>
              <label className="modal-label" htmlFor="correction-reason">Reason for correction *</label>
              <textarea
                id="correction-reason"
                className="modal-textarea"
                rows={3}
                placeholder="e.g. GPS signal lost inside building — manually verified by manager"
                value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setCorrecting(null)}>Cancel</button>
              <button id="btn-submit-correction" className="btn-primary" onClick={submitCorrection}>Submit Correction</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
