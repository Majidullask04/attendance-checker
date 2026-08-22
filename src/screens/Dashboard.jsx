import { useState, useEffect } from 'react';
import { formatTime, formatDuration, getWeekDates } from '../utils/formatters';

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{label}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

function WeekChart({ records, employees }) {
  const days = getWeekDates();
  const today = new Date().toDateString();

  return (
    <div className="week-chart">
      <h3 className="section-title">This Week's Attendance</h3>
      <div className="week-chart-bars">
        {days.map((day, i) => {
          const dayStr = day.toDateString();
          const isToday = dayStr === today;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const present = isWeekend ? 0 : employees.filter(emp => {
            return records.some(r => r.userId === emp.id && r.recordType === 'check_in' && new Date(r.recordedAt).toDateString() === dayStr);
          }).length;
          const pct = isWeekend ? 0 : (present / employees.length) * 100;

          return (
            <div key={i} className={`week-bar ${isToday ? 'week-bar--today' : ''} ${isWeekend ? 'week-bar--weekend' : ''}`}>
              <div className="week-bar-track">
                <div
                  className="week-bar-fill"
                  style={{ height: `${pct}%`, '--pct': `${pct}%` }}
                />
              </div>
              <div className="week-bar-label">
                <div className="week-bar-day">{day.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                {!isWeekend && <div className="week-bar-count">{present}/{employees.length}</div>}
              </div>
              {isToday && <div className="week-bar-today-badge">Today</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ records }) {
  const recent = [...records]
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .slice(0, 8);

  return (
    <div className="activity-feed">
      <h3 className="section-title">Recent Activity</h3>
      <div className="activity-list">
        {recent.map(r => (
          <div key={r.id} className={`activity-item ${r.status === 'flagged' ? 'activity-item--flagged' : ''}`}>
            <div className={`activity-dot activity-dot--${r.recordType === 'check_in' ? 'success' : 'info'}`} />
            <div className="activity-body">
              <div className="activity-action">
                <span className="activity-type">{r.recordType === 'check_in' ? '▲ Check In' : '▼ Check Out'}</span>
                {r.isOfflineSync && <span className="badge badge--warning">Offline Sync</span>}
                {r.status === 'flagged' && <span className="badge badge--danger">Flagged</span>}
              </div>
              <div className="activity-meta">
                {formatTime(r.recordedAt)} · Score {r.confidenceScore}% · {r.verifiedBy.toUpperCase()}
              </div>
            </div>
            <div className="activity-time">{formatTime(r.recordedAt)}</div>
          </div>
        ))}
        {recent.length === 0 && <div className="activity-empty">No recent activity</div>}
      </div>
    </div>
  );
}

export default function Dashboard({ store }) {
  const { stats, teamSummary, records, employees, currentCheckIn, attendanceState } = store;
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!currentCheckIn) { setElapsed(''); return; }
    const tick = () => {
      const diff = Date.now() - new Date(currentCheckIn.recordedAt).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentCheckIn]);

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Dashboard</h1>
          <p className="screen-sub">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {currentCheckIn && (
          <div className="live-timer">
            <span className="live-timer-dot" />
            <span className="live-timer-label">On Site</span>
            <span className="live-timer-elapsed">{elapsed}</span>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="stats-grid">
        <StatCard label="Present Today"   value={stats.presentToday}   sub={`of ${stats.totalEmployees} total`} color="success" icon="👥" />
        <StatCard label="Absent"          value={stats.absentToday}    sub="not checked in"                     color="danger"  icon="⚠" />
        <StatCard label="Checked Out"     value={stats.checkedOut}     sub="completed shifts"                   color="info"    icon="✓" />
        <StatCard label="Flagged Records" value={stats.flaggedRecords} sub="needs review"                       color="warning" icon="⚑" />
      </div>

      <div className="dashboard-grid">
        <WeekChart records={records} employees={employees} />
        <ActivityFeed records={records} />
      </div>

      {/* Team Quick View */}
      <div className="team-quick">
        <h3 className="section-title">Team — Today</h3>
        <div className="team-quick-grid">
          {teamSummary.map(emp => (
            <div key={emp.id} className={`team-quick-card ${emp.flagged ? 'team-quick-card--flagged' : ''}`}>
              <div className="team-quick-avatar">{emp.avatar}</div>
              <div className="team-quick-info">
                <div className="team-quick-name">{emp.name}</div>
                <div className="team-quick-dept">{emp.department}</div>
              </div>
              <div className={`status-pill status-pill--${emp.status}`}>
                {emp.status === 'present' ? '● Present' : emp.status === 'checked_out' ? '✓ Done' : '○ Absent'}
              </div>
              {emp.checkInTime && (
                <div className="team-quick-time">In {formatTime(emp.checkInTime)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
