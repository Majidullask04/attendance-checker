import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatTime, formatDuration } from '../utils/formatters.js';
import { api } from '../api/client.js';

export default function Team({ store }) {
  const { isAdmin } = useAuth();
  const { teamSummary, setActiveScreen } = store;
  const [selected, setSelected] = useState(null);
  const [userRecords, setUserRecords] = useState([]);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  useEffect(() => {
    if (!selected) {
      setUserRecords([]);
      return;
    }

    setIsLoadingUser(true);
    api
      .getRecords(selected)
      .then((data) => setUserRecords(data.records || []))
      .catch((err) => console.error('Error fetching user records:', err))
      .finally(() => setIsLoadingUser(false));
  }, [selected]);

  if (!isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="unauthorized-card">
          <div className="unauthorized-icon">🔒</div>
          <h2>Admin Restricted Section</h2>
          <p>You need Administrator privileges to view organizational team data.</p>
          <button className="btn-primary" onClick={() => setActiveScreen('dashboard')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const selectedEmp = teamSummary.find((e) => e.id === selected);

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Team Operations & Presence</h1>
          <p className="screen-sub">
            Live monitoring of personnel attendance backed by SQLite and QR verification
          </p>
        </div>
        <div className="team-legend">
          <span className="legend-dot legend-dot--success" /> Present
          <span className="legend-dot legend-dot--info ml" /> Checked Out
          <span className="legend-dot legend-dot--danger ml" /> Absent
        </div>
      </div>

      <div className="team-grid">
        {teamSummary.map((emp) => (
          <div
            key={emp.id}
            id={`team-card-${emp.id}`}
            className={`team-card ${emp.flagged ? 'team-card--flagged' : ''} ${
              selected === emp.id ? 'team-card--selected' : ''
            }`}
            onClick={() => setSelected(selected === emp.id ? null : emp.id)}
            role="button"
            tabIndex={0}
          >
            <div className={`team-card-status-bar status-bar--${emp.status}`} />
            <div className="team-card-top">
              <div className="team-card-avatar">{emp.avatar || '👷'}</div>
              <div className="team-card-info">
                <div className="team-card-name">{emp.name}</div>
                <div className="team-card-dept">
                  {emp.department} · <span className="font-mono text-muted">{emp.email}</span>
                </div>
              </div>
              <div className={`status-chip status-chip--${emp.status}`}>
                {emp.status === 'present'
                  ? 'Present'
                  : emp.status === 'checked_out'
                  ? 'Done'
                  : 'Absent'}
              </div>
            </div>

            <div className="team-card-times">
              <div className="team-card-time-item">
                <span className="team-card-time-label">Checked In</span>
                <span className="team-card-time-val font-mono">
                  {emp.checkInTime ? formatTime(emp.checkInTime) : '--:--'}
                </span>
              </div>
              <div className="team-card-time-divider" />
              <div className="team-card-time-item">
                <span className="team-card-time-label">Checked Out</span>
                <span className="team-card-time-val font-mono">
                  {emp.checkOutTime ? formatTime(emp.checkOutTime) : '--:--'}
                </span>
              </div>
              <div className="team-card-time-divider" />
              <div className="team-card-time-item">
                <span className="team-card-time-label">Hours</span>
                <span className="team-card-time-val font-mono">
                  {formatDuration(emp.hoursWorked)}
                </span>
              </div>
            </div>

            {emp.flagged && (
              <div className="team-card-flag">
                ⚑ Low confidence score detected in database
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Drill-Down Inspector */}
      {selected && (
        <div className="team-detail fade-in">
          <h3 className="section-title">
            Attendance Log: {selectedEmp?.name || selectedEmp?.email}
          </h3>
          {isLoadingUser ? (
            <div className="empty-state">
              <div className="empty-text">Loading records from SQLite…</div>
            </div>
          ) : userRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-text">No active records found for this employee</div>
            </div>
          ) : (
            <div className="records-group">
              {userRecords.map((r) => {
                const type = r.record_type || r.recordType;
                const time = r.recorded_at || r.recordedAt;
                const token = r.qr_token || r.qrTokenId;
                const score = r.confidence_score || r.confidenceScore || 90;

                return (
                  <div
                    key={r.id}
                    className={`record-row ${
                      r.status === 'flagged' ? 'record-row--flagged' : ''
                    }`}
                  >
                    <div
                      className={`record-type-badge ${
                        type === 'check_in' ? 'badge-in' : 'badge-out'
                      }`}
                    >
                      {type === 'check_in' ? '▲ IN' : '▼ OUT'}
                    </div>
                    <div className="record-time font-mono">{formatTime(time)}</div>
                    <div className="record-badges">
                      {r.status === 'flagged' && (
                        <span className="badge badge--danger">Flagged</span>
                      )}
                      <span className="badge badge--neutral">
                        {score}% confidence
                      </span>
                      <span className="badge badge--info">QR VERIFIED</span>
                    </div>
                    <div className="record-meta font-mono">
                      Token: {token?.slice(0, 12)}… · ±{r.accuracy_meters || 8}m
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
