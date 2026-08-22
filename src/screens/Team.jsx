import { useState } from 'react';
import { formatTime, formatDuration } from '../utils/formatters';

export default function Team({ store }) {
  const { teamSummary, records, employees } = store;
  const [selected, setSelected] = useState(null);

  const empRecords = selected
    ? records.filter(r => r.userId === selected && new Date(r.recordedAt).toDateString() === new Date().toDateString())
    : [];

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Team Overview</h1>
          <p className="screen-sub">Live attendance status — today's shift</p>
        </div>
        <div className="team-legend">
          <span className="legend-dot legend-dot--success" /> Present
          <span className="legend-dot legend-dot--info ml" /> Done
          <span className="legend-dot legend-dot--danger ml" /> Absent
        </div>
      </div>

      <div className="team-grid">
        {teamSummary.map(emp => (
          <div
            key={emp.id}
            id={`team-card-${emp.id}`}
            className={`team-card ${emp.flagged ? 'team-card--flagged' : ''} ${selected === emp.id ? 'team-card--selected' : ''}`}
            onClick={() => setSelected(selected === emp.id ? null : emp.id)}
            role="button"
            tabIndex={0}
          >
            <div className={`team-card-status-bar status-bar--${emp.status}`} />
            <div className="team-card-top">
              <div className="team-card-avatar">{emp.avatar}</div>
              <div className="team-card-info">
                <div className="team-card-name">{emp.name}</div>
                <div className="team-card-dept">{emp.department} · {emp.role}</div>
              </div>
              <div className={`status-chip status-chip--${emp.status}`}>
                {emp.status === 'present' ? 'Present' : emp.status === 'checked_out' ? 'Done' : 'Absent'}
              </div>
            </div>

            <div className="team-card-times">
              <div className="team-card-time-item">
                <span className="team-card-time-label">In</span>
                <span className="team-card-time-val font-mono">{emp.checkInTime ? formatTime(emp.checkInTime) : '--:--'}</span>
              </div>
              <div className="team-card-time-divider" />
              <div className="team-card-time-item">
                <span className="team-card-time-label">Out</span>
                <span className="team-card-time-val font-mono">{emp.checkOutTime ? formatTime(emp.checkOutTime) : '--:--'}</span>
              </div>
              <div className="team-card-time-divider" />
              <div className="team-card-time-item">
                <span className="team-card-time-label">Hours</span>
                <span className="team-card-time-val font-mono">{formatDuration(emp.hoursWorked)}</span>
              </div>
            </div>

            {emp.flagged && (
              <div className="team-card-flag">⚑ Low confidence record — needs review</div>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="team-detail fade-in">
          <h3 className="section-title">
            Today's Records — {teamSummary.find(e => e.id === selected)?.name}
          </h3>
          {empRecords.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">No records today</div></div>
          ) : (
            <div className="records-group">
              {empRecords.sort((a,b) => new Date(a.recordedAt)-new Date(b.recordedAt)).map(r => (
                <div key={r.id} className={`record-row ${r.status === 'flagged' ? 'record-row--flagged' : ''}`}>
                  <div className={`record-type-badge ${r.recordType === 'check_in' ? 'badge-in' : 'badge-out'}`}>
                    {r.recordType === 'check_in' ? '▲ IN' : '▼ OUT'}
                  </div>
                  <div className="record-time font-mono">{formatTime(r.recordedAt)}</div>
                  <div className="record-badges">
                    {r.status === 'flagged' && <span className="badge badge--danger">Flagged</span>}
                    <span className="badge badge--neutral">{r.confidenceScore}% confidence</span>
                    <span className="badge badge--neutral">{r.verifiedBy.toUpperCase()}</span>
                  </div>
                  <div className="record-meta font-mono">±{r.accuracyMeters}m</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
