import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatTime, formatDuration, getEmployeeName, renderAvatar, getInitials } from '../utils/formatters.js';
import { MUSTER_DAY_CODES } from '../utils/attendancePolicy.js';
import { api } from '../api/client.js';
import { useAttendanceStore } from '../store/useStore.js';
import {
  Download,
  LayoutGrid,
  Table as TableIcon,
  Lock,
  AlertTriangle,
  FastForward,
  Calendar,
  X,
  ClipboardList,
  Trash2,
  CalendarRange,
  FileSpreadsheet,
} from 'lucide-react';

export default function Team({ store }) {
  const { isAdmin } = useAuth();
  const {
    teamSummary = [],
    selectedDate,
    setSelectedDate,
    loadTeamData,
    downloadReportPDF,
    setActiveScreen,
  } = store;
  const { addToast } = useAttendanceStore();

  const [selected, setSelected] = useState(null);
  const [userRecords, setUserRecords] = useState([]);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isResettingFace, setIsResettingFace] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // table | cards | muster
  const [musterMonth, setMusterMonth] = useState(() => (selectedDate || '').slice(0, 7));
  const [musterData, setMusterData] = useState(null);
  const [isLoadingMuster, setIsLoadingMuster] = useState(false);

  const loadMuster = useCallback(async (monthValue) => {
    if (!isAdmin || !monthValue) return;
    setIsLoadingMuster(true);
    try {
      const data = await api.getPayrollMuster(monthValue);
      setMusterData(data);
    } catch (err) {
      addToast(err.message || 'Failed to load muster roll', 'error');
      setMusterData(null);
    } finally {
      setIsLoadingMuster(false);
    }
  }, [isAdmin, addToast]);

  useEffect(() => {
    if (viewMode === 'muster') {
      loadMuster(musterMonth);
    }
  }, [viewMode, musterMonth, loadMuster]);

  const handleDownloadPayrollCSV = async () => {
    try {
      addToast('Generating payroll CSV…', 'info');
      await api.downloadPayrollCSV(musterMonth);
      addToast('Payroll muster CSV downloaded successfully.', 'success');
    } catch (err) {
      addToast(err.message || 'Payroll CSV export failed', 'error');
    }
  };

  // Biometric admin control: clear an employee's Face ID enrollment so they
  // can re-enroll a new reference photo.
  const handleResetFaceId = async (emp) => {
    if (!emp?.id) return;
    if (!window.confirm(`Reset Face ID enrollment for ${getEmployeeName(emp)}? They must re-enroll before next check-in.`)) {
      return;
    }
    setIsResettingFace(emp.id);
    try {
      const res = await api.resetFace(emp.id);
      addToast(res.message || 'Face ID cleared. The employee can now re-enroll.', 'success');
      await loadTeamData(selectedDate);
    } catch (err) {
      addToast(err.message || 'Failed to reset Face ID enrollment', 'error');
    } finally {
      setIsResettingFace(null);
    }
  };

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
          <div className="unauthorized-icon"><Lock size={32} /></div>
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
            Monitor daily presence, 6-9 AM check-ins, afternoon breaks, and overtime reports.
          </p>
        </div>

        {/* Action Controls: Date Picker & PDF Export */}
        <div className="team-controls">
          <div className="date-picker-wrap">
            <Calendar size={14} className="text-muted" />
            <label htmlFor="team-date-picker" className="date-label">Date (IST):</label>
            <input
              id="team-date-picker"
              type="date"
              className="date-input font-mono"
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
            <Download size={14} />
            <span>Export PDF Report</span>
          </button>

          <div className="view-toggle-wrap">
            <button
              className={`filter-tab ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <TableIcon size={14} />
              <span>Table</span>
            </button>
            <button
              className={`filter-tab ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Cards View"
            >
              <LayoutGrid size={14} />
              <span>Cards</span>
            </button>
            <button
              className={`filter-tab ${viewMode === 'muster' ? 'active' : ''}`}
              onClick={() => setViewMode('muster')}
              title="Monthly Muster Roll & Payroll"
            >
              <CalendarRange size={14} />
              <span>Muster</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="team-stats-bar stagger-group">
        <div className="stat-pill stat-pill--present interactive-item">
          <span className="stat-pill-num font-mono">{presentCount}</span>
          <span className="stat-pill-label">Present / Done</span>
        </div>
        <div className="stat-pill stat-pill--late interactive-item">
          <span className="stat-pill-num font-mono">{lateCount}</span>
          <span className="stat-pill-label">Late (&gt;9 AM)</span>
        </div>
        <div className="stat-pill stat-pill--half interactive-item">
          <span className="stat-pill-num font-mono">{halfDayCount}</span>
          <span className="stat-pill-label">Half Day</span>
        </div>
        <div className="stat-pill stat-pill--absent interactive-item">
          <span className="stat-pill-num font-mono">{absentCount}</span>
          <span className="stat-pill-label">Absent</span>
        </div>
        <div className="stat-pill stat-pill--ot interactive-item">
          <span className="stat-pill-num font-mono">{otCount}</span>
          <span className="stat-pill-label">Overtime</span>
        </div>
      </div>

      {/* MUSTER ROLL VIEW (Layer 6) */}
      {viewMode === 'muster' && (
        <div className="muster-section fade-in">
          <div className="muster-controls">
            <div className="date-picker-wrap">
              <Calendar size={14} className="text-muted" />
              <label htmlFor="muster-month-picker" className="date-label">Month (IST):</label>
              <input
                id="muster-month-picker"
                type="month"
                className="date-input font-mono"
                value={musterMonth}
                onChange={(e) => setMusterMonth(e.target.value)}
              />
            </div>
            <button
              id="btn-download-payroll-csv"
              className="btn-primary"
              onClick={handleDownloadPayrollCSV}
              title="Download payroll-ready CSV (Zoho Payroll / accounting import)"
            >
              <FileSpreadsheet size={14} />
              <span>Export Payroll CSV</span>
            </button>
          </div>

          {isLoadingMuster ? (
            <div className="empty-state">
              <div className="empty-text">Building monthly muster roll…</div>
            </div>
          ) : !musterData || musterData.employees.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><ClipboardList size={32} /></div>
              <div className="empty-text">No employees found for {musterMonth}</div>
            </div>
          ) : (
            <>
              <div className="muster-controls">
                <div className="muster-legend">
                  {(musterData.legend || []).map(([code, label]) => (
                    <span key={code} className="muster-legend-item">
                      <span
                        className="muster-cell muster-cell--static"
                        style={{ color: MUSTER_DAY_CODES[code]?.color || 'var(--color-text-secondary)' }}
                      >
                        {code}
                      </span>
                      <span className="text-muted">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table muster-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      {musterData.days.map((d) => (
                        <th key={d} className="font-mono muster-day-head">{d}</th>
                      ))}
                      <th>P</th>
                      <th>HD</th>
                      <th>OD</th>
                      <th>REG</th>
                      <th>A</th>
                      <th>Payable</th>
                      <th>Eff Hrs</th>
                      <th>OT Hrs</th>
                      <th>Late</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-group">
                    {musterData.employees.map((emp) => {
                      const t = emp.totals;
                      return (
                        <tr key={emp.id} className="interactive-item">
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar">{renderAvatar(null, getInitials(emp.email || emp.name))}</div>
                              <div>
                                <div className="user-name">{getEmployeeName(emp)}</div>
                                <div className="user-email font-mono">{emp.department}</div>
                              </div>
                            </div>
                          </td>
                          {musterData.days.map((d) => {
                            const cell = emp.cells[d] || { code: '-', label: 'No Punch' };
                            return (
                              <td key={d} className="muster-day-cell" title={cell.label}>
                                <span
                                  className="muster-cell font-mono"
                                  style={{ color: MUSTER_DAY_CODES[cell.code]?.color || 'var(--color-text-secondary)' }}
                                >
                                  {cell.code}
                                </span>
                              </td>
                            );
                          })}
                          <td className="font-mono">{t.presentFullDays}</td>
                          <td className="font-mono">{t.halfDays}</td>
                          <td className="font-mono">{t.onDutyDays}</td>
                          <td className="font-mono">{t.regularizedDays}</td>
                          <td className="font-mono">{t.absentDays}</td>
                          <td className="font-mono font-bold">{t.totalPayableDays}</td>
                          <td className="font-mono">{t.totalEffectiveHours}</td>
                          <td className="font-mono">{t.totalOvertimeHours > 0 ? `+${t.totalOvertimeHours}` : '0'}</td>
                          <td className="font-mono">{t.lateArrivalCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
              <tbody className="stagger-group">
                {teamSummary.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
                      No employee records found for this date.
                    </td>
                  </tr>
                ) : (
                  teamSummary.map((emp) => (
                    <tr
                      key={emp.id}
                      className={`${selected === emp.id ? 'row-selected' : ''} interactive-item`}
                      onClick={() => setSelected(selected === emp.id ? null : emp.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="emp-cell">
                          <span className="emp-avatar">{renderAvatar(emp.avatar, getInitials(emp.email || emp.name || emp.userName))}</span>
                          <div>
                            <div className="emp-name">{getEmployeeName(emp)}</div>
                            <div className="emp-email font-mono">{emp.email}</div>
                            <div className={`emp-faceid font-mono ${emp.faceEnrolled ? 'emp-faceid--ok' : 'emp-faceid--none'}`}>
                              {emp.faceEnrolled ? 'FACE ID ENROLLED' : 'FACE ID PENDING'}
                            </div>
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
                          className={`record-type-badge ${emp.status === 'present'
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="btn-tiny"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(selected === emp.id ? null : emp.id);
                            }}
                          >
                            {selected === emp.id ? 'Close' : 'Inspect'}
                          </button>
                          <button
                            className="btn-tiny"
                            style={{ backgroundColor: 'var(--color-info)', color: 'var(--color-surface)', border: 'none', padding: 'var(--space-sm)' }}
                            title={emp.faceEnrolled ? 'Clear the employee Face ID enrollment so they can re-enroll' : 'Employee has no Face ID enrolled yet'}
                            disabled={!emp.faceEnrolled || isResettingFace}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetFaceId(emp);
                            }}
                          >
                            {isResettingFace === emp.id ? 'Resetting…' : 'Reset Face ID'}
                          </button>
                          <button
                            className="btn-tiny"
                            style={{ backgroundColor: 'var(--color-danger)', color: 'var(--color-surface)', border: 'none', padding: 'var(--space-sm)' }}
                            title="Remove User"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Are you sure you want to completely remove ${getEmployeeName(emp)}?`)) {
                                store.deleteUser(emp.id);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
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
        <div className="team-grid stagger-group">
          {teamSummary.map((emp) => (
            <div
              key={emp.id}
              id={`team-card-${emp.id}`}
              className={`team-card ${emp.flagged ? 'team-card--flagged' : ''} ${selected === emp.id ? 'team-card--selected' : ''
                } interactive-item`}
              onClick={() => setSelected(selected === emp.id ? null : emp.id)}
              role="button"
              tabIndex={0}
            >
              <div className={`team-card-status-bar status-bar--${emp.status}`} />
              <div className="team-card-top">
                <div className="team-card-avatar">{renderAvatar(emp.avatar, getInitials(emp.email || emp.name || emp.userName))}</div>
                <div className="team-card-info">
                  <div className="team-card-name">{getEmployeeName(emp)}</div>
                  <div className="team-card-dept">
                    {emp.department} · <span className="font-mono text-muted">{emp.email}</span>
                  </div>
                </div>
                <div className={`status-chip status-chip--${emp.status}`} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {emp.statusLabel || emp.status}
                  <button
                    className="btn-tiny"
                    style={{ padding: 'var(--space-xs) var(--space-xs)', backgroundColor: 'transparent', color: 'var(--color-danger)', border: 'none', marginLeft: 'var(--space-xs)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Are you sure you want to completely remove ${getEmployeeName(emp)}?`)) {
                        store.deleteUser(emp.id);
                      }
                    }}
                    title="Remove User"
                  >
                    <Trash2 size={12} />
                  </button>
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
                <div className="team-card-ot-bar font-mono">
                  <FastForward size={13} className="text-purple" />
                  <span>Overtime: <strong>+{emp.otHours} hrs</strong></span>
                </div>
              )}

              {emp.flagged && (
                <div className="team-card-flag">
                  <AlertTriangle size={13} />
                  <span>Low confidence score detected in database</span>
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
              Attendance Events: {getEmployeeName(selectedEmp)} ({selectedDate})
            </h3>
            <button className="btn-tiny" onClick={() => setSelected(null)}>
              <X size={14} /> Close
            </button>
          </div>

          {isLoadingUser ? (
            <div className="empty-state">
              <div className="empty-text">Loading events from database…</div>
            </div>
          ) : userRecords.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><ClipboardList size={32} /></div>
              <div className="empty-text">No attendance events recorded for this employee on {selectedDate}</div>
            </div>
          ) : (
            <div className="records-group stagger-group">
              {userRecords.map((r) => {
                const type = r.record_type || r.recordType;
                const time = r.recorded_at || r.recordedAt;
                const token = r.qr_token || r.qrTokenId;
                const score = r.confidence_score || r.confidenceScore || 90;

                return (
                  <div
                    key={r.id}
                    className={`record-row ${r.status === 'flagged' ? 'record-row--flagged' : ''} interactive-item`}
                  >
                    <div
                      className={`record-type-badge ${type === 'check_in'
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
                        ? 'CHECK IN'
                        : type === 'check_out'
                          ? 'CHECK OUT'
                          : type === 'break_start'
                            ? 'BREAK START'
                            : type === 'break_end'
                              ? 'BREAK RESUME'
                              : type === 'ot_start'
                                ? 'OT START'
                                : type === 'ot_end'
                                  ? 'OT STOP'
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
