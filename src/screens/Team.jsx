import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatTime, formatDuration } from '../utils/formatters.js';
import { api } from '../api/client.js';

export default function Team({ store }) {
  const { isAdmin } = useAuth();
  const {
    teamSummary,
    selectedDate,
    setSelectedDate,
    loadTeamData,
    downloadReportPDF,
    setActiveScreen,
  } = store;

  const [selected, setSelected] = useState(null);
  const [userRecords, setUserRecords] = useState([]);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // table | cards

  useEffect(() => {
    if (!selected) {
      setUserRecords([]);
      return;
    }

    setIsLoadingUser(true);
    api
      .getRecords(selected, selectedDate)
      .then((data) => setUserRecords(data.records || []))
      .catch((err) => console.error('Error fetching user records:', err))
      .finally(() => setIsLoadingUser(false));
  }, [selected, selectedDate]);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    loadTeamData(newDate);
    if (selected) {
      setIsLoadingUser(true);
      api
        .getRecords(selected, newDate)
        .then((data) => setUserRecords(data.records || []))
        .catch((err) => console.error('Error fetching user records:', err))
        .finally(() => setIsLoadingUser(false));
    }
  };

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

  // Summary counts for the selected date
  const presentCount = teamSummary.filter((e) => ['present', 'checked_out'].includes(e.status)).length;
  const lateCount = teamSummary.filter((e) => e.isLate || e.status === 'late').length;
  const halfDayCount = teamSummary.filter((e) => e.status === 'half_day').length;
  const absentCount = teamSummary.filter((e) => e.status === 'absent').length;
  const otCount = teamSummary.filter((e) => e.otHours > 0 || e.status === 'overtime').length;

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Team Operations & Attendance Ledger</h1>
          <p className="screen-sub">
            Monitor daily presence, 6–9 AM check-ins, afternoon breaks, and overtime reports.
          </p>
        </div>

        {/* Action Controls: Date Picker & PDF Export */}
        <div className="team-controls">
          <div className="date-picker-wrap">
            <label htmlFor="team-date-picker" className="date-label">Date (IST):</label>
            <input
              id="team-date-picker"
              type="date"
              className="date-input"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>

          <button
            id="btn-download-pdf"
            className="btn-primary"
            onClick={() => downloadReportPDF(selectedDate)}
            title="Download PDF attendance ledger for this date"
          >
            <span>📥 Export PDF Report</span>
          </button>

          <div className="view-toggle-wrap">
            <button
              className={`filter-tab ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
            <button
              className={`filter-tab ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="team-stats-bar">
        <div className="stat-pill stat-pill--present">
          <span className="stat-pill-num">{presentCount}</span>
          <span className="stat-pill-label">Present / Done</span>
        </div>
        <div className="stat-pill stat-pill--late">
          <span className="stat-pill-num">{lateCount}</span>
          <span className="stat-pill-label">Late (&gt;9 AM)</span>
        </div>
        <div className="stat-pill stat-pill--half">
          <span className="stat-pill-num">{halfDayCount}</span>
          <span className="stat-pill-label">Half Day</span>
        </div>
        <div className="stat-pill stat-pill--absent">
          <span className="stat-pill-num">{absentCount}</span>
          <span className="stat-pill-label">Absent</span>
        </div>
        <div className="stat-pill stat-pill--ot">
          <span className="stat-pill-num">{otCount}</span>
          <span className="stat-pill-label">Overtime</span>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="report-table-card">
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Break</th>
                  <th>Work Hours</th>
                  <th>Overtime</th>
                  <th>Attendance Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamSummary.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No employee records found for this date.
                    </td>
                  </tr>
                ) : (
                  teamSummary.map((emp) => (
                    <tr
                      key={emp.id}
                      className={selected === emp.id ? 'row-selected' : ''}
                      onClick={() => setSelected(selected === emp.id ? null : emp.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="emp-cell">
                          <span className="emp-avatar">{emp.avatar || '👷'}</span>
                          <div>
                            <div className="emp-name">{emp.name}</div>
                            <div className="emp-email font-mono">{emp.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge--neutral">{emp.department || 'Field'}</span>
                      </td>
                      <td className="font-mono">
                        {emp.checkInTime ? (
                          <span className={emp.isLate ? 'text-warning font-bold' : 'text-success'}>
                            {formatTime(emp.checkInTime)}
                            {emp.isLate && <span className="tag-sub"> (Late)</span>}
                          </span>
                        ) : (
                          <span className="text-muted">--:--</span>
                        )}
                      </td>
                      <td className="font-mono">
                        {emp.checkOutTime ? formatTime(emp.checkOutTime) : '--:--'}
                      </td>
                      <td className="font-mono">
                        {emp.breakDurationMinutes > 0 ? (
                          <span>{emp.breakDurationMinutes} min</span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                      <td className="font-mono">
                        {emp.hoursWorked > 0 ? formatDuration(emp.hoursWorked) : '0h'}
                      </td>
                      <td className="font-mono">
                        {emp.otHours > 0 ? (
                          <span className="text-purple font-bold">+{emp.otHours}h OT</span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`record-type-badge ${
                            emp.status === 'present'
                              ? 'badge-in'
                              : emp.status === 'checked_out'
                              ? 'badge-out'
                              : emp.status === 'late'
                              ? 'badge-warning'
                              : emp.status === 'half_day'
                              ? 'badge-warning'
                              : emp.status === 'overtime'
                              ? 'badge-ot'
                              : 'status-pill--neutral'
                          }`}
                        >
                          {emp.statusLabel || emp.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-tiny"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(selected === emp.id ? null : emp.id);
                          }}
                        >
                          {selected === emp.id ? 'Close' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CARDS VIEW */}
      {viewMode === 'cards' && (
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
                  {emp.statusLabel || emp.status}
                </div>
              </div>

              <div className="team-card-times">
                <div className="team-card-time-item">
                  <span className="team-card-time-label">Checked In</span>
                  <span className={`team-card-time-val font-mono ${emp.isLate ? 'text-warning' : ''}`}>
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

              {emp.otHours > 0 && (
                <div className="team-card-ot-bar">
                  ⏫ Overtime Recorded: <strong>{emp.otHours} hrs</strong>
                </div>
              )}

              {emp.flagged && (
                <div className="team-card-flag">
                  ⚑ Low confidence score detected in database
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drill-Down Inspector */}
      {selected && (
        <div className="team-detail fade-in">
          <div className="team-detail-header">
            <h3 className="section-title">
              Attendance Events: {selectedEmp?.name || selectedEmp?.email} ({selectedDate})
            </h3>
            <button className="btn-tiny" onClick={() => setSelected(null)}>✕ Close</button>
          </div>

          {isLoadingUser ? (
            <div className="empty-state">
              <div className="empty-text">Loading events from database…</div>
            </div>
          ) : userRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-text">No attendance events recorded for this employee on {selectedDate}</div>
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
                    className={`record-row ${r.status === 'flagged' ? 'record-row--flagged' : ''}`}
                  >
                    <div
                      className={`record-type-badge ${
                        type === 'check_in'
                          ? 'badge-in'
                          : type === 'check_out'
                          ? 'badge-out'
                          : type === 'break_start'
                          ? 'badge-warning'
                          : type === 'break_end'
                          ? 'badge-in'
                          : type === 'ot_start'
                          ? 'badge-ot'
                          : 'badge-out'
                      }`}
                    >
                      {type === 'check_in'
                        ? '▲ CHECK IN'
                        : type === 'check_out'
                        ? '▼ CHECK OUT'
                        : type === 'break_start'
                        ? '☕ BREAK START'
                        : type === 'break_end'
                        ? '▶ BREAK RESUME'
                        : type === 'ot_start'
                        ? '⏫ OT START'
                        : type === 'ot_end'
                        ? '⏹ OT STOP'
                        : type}
                    </div>

                    <div className="record-time font-mono">
                      {formatTime(time)}
                    </div>

                    <div className="record-badges">
                      {r.status === 'flagged' && <span className="badge badge--danger">Flagged</span>}
                      {r.status === 'late' && <span className="badge badge--warning">Late Scan</span>}
                      <span className="badge badge--success">Score {score}%</span>
                      <span className="badge badge--neutral">{(r.verified_by || 'QR').toUpperCase()}</span>
                    </div>

                    <div className="record-meta font-mono">
                      {token && <span className="text-muted">Token: {token.slice(0, 10)}… · </span>}
                      {r.location_name || 'Station'}
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
