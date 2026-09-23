import { useAuth } from '../auth/AuthContext.jsx';
import { useTimer } from '../hooks/useTimer.js';
import { formatTime, formatDuration, getWeekDates, getEmployeeName, getEmployeeAvatar } from '../utils/formatters.js';
import DayTimeline from '../components/DayTimeline.jsx';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Zap,
  Clock,
  ClipboardList,
  ShieldCheck,
  Coffee,
  Play,
  FastForward,
  Square,
} from 'lucide-react';

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className={`stat-card stat-card--${color} interactive-item`}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value font-mono">{value}</div>
        <div className="stat-card-label">{label}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  );
}

function WeekChart({ records = [], employees = [], isUserOnly, userEmail }) {
  const days = getWeekDates();
  const today = new Date().toDateString();

  return (
    <div className="week-chart">
      <h3 className="section-title">
        {isUserOnly ? 'My Attendance This Week' : 'Team Attendance This Week'}
      </h3>
      <div className="week-chart-bars">
        {days.map((day, i) => {
          const dayStr = day.toDateString();
          const isToday = dayStr === today;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          let presentCount = 0;
          let maxCount = isUserOnly ? 1 : employees?.length || 6;

          if (!isWeekend) {
            if (isUserOnly) {
              const checkedIn = records.some(
                (r) =>
                  (r.user_id === userEmail || r.user_email === userEmail) &&
                  (r.record_type === 'check_in' || r.recordType === 'check_in') &&
                  new Date(r.recorded_at || r.recordedAt).toDateString() === dayStr
              );
              presentCount = checkedIn ? 1 : 0;
            } else {
              const presentUserIds = new Set(
                records
                  .filter(
                    (r) =>
                      (r.record_type === 'check_in' || r.recordType === 'check_in') &&
                      new Date(r.recorded_at || r.recordedAt).toDateString() === dayStr
                  )
                  .map((r) => r.user_id || r.userId)
              );
              presentCount = presentUserIds.size;
            }
          }

          const pct = isWeekend ? 0 : Math.min(100, (presentCount / maxCount) * 100);

          return (
            <div
              key={i}
              className={`week-bar ${isToday ? 'week-bar--today' : ''} ${
                isWeekend ? 'week-bar--weekend' : ''
              }`}
            >
              <div className="week-bar-track">
                <div
                  className="week-bar-fill"
                  style={{ height: `${pct}%`, '--pct': `${pct}%` }}
                />
              </div>
              <div className="week-bar-label">
                <div className="week-bar-day">
                  {day.toLocaleDateString('en-IN', { weekday: 'short' })}
                </div>
                {!isWeekend && (
                  <div className="week-bar-count">
                    {isUserOnly
                      ? presentCount > 0
                        ? '✓ Present'
                        : '○ Absent'
                      : `${presentCount}/${maxCount}`}
                  </div>
                )}
              </div>
              {isToday && <div className="week-bar-today-badge">Today</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ records = [], teamSummary = [], currentUser = null, isUserOnly }) {
  const recent = [...records]
    .sort(
      (a, b) =>
        new Date(b.recorded_at || b.recordedAt) - new Date(a.recorded_at || a.recordedAt)
    )
    .slice(0, 8);

  const TYPE_ICONS = {
    check_in: <CheckCircle2 size={13} className="text-success" />,
    check_out: <CheckCircle2 size={13} className="text-info" />,
    break_start: <Coffee size={13} className="text-warning" />,
    break_end: <Play size={13} className="text-success" />,
    ot_start: <FastForward size={13} className="text-purple" />,
    ot_end: <Square size={13} className="text-purple" />,
  };

  const TYPE_LABELS = {
    check_in: 'Checked In',
    check_out: 'Checked Out',
    break_start: 'Break Started',
    break_end: 'Break Resumed',
    ot_start: 'Overtime Started',
    ot_end: 'Overtime Ended',
  };

  return (
    <div className="activity-feed">
      <h3 className="section-title">
        {isUserOnly ? 'My Recent Activity' : 'Live Operations Activity'}
      </h3>
      <div className="activity-list stagger-group">
        {recent.map((r) => {
          const type = r.record_type || r.recordType;
          const time = r.recorded_at || r.recordedAt;
          const score = r.confidence_score || r.confidenceScore || 90;
          const empName = getEmployeeName(r, teamSummary, currentUser);
          const avatar = getEmployeeAvatar(r, teamSummary);

          return (
            <div
              key={r.id}
              className={`activity-item ${
                r.status === 'flagged' ? 'activity-item--flagged' : ''
              }`}
            >
              <div
                className={`activity-dot activity-dot--${
                  type === 'check_in' || type === 'break_end'
                    ? 'success'
                    : type === 'break_start'
                    ? 'warning'
                    : type === 'ot_start' || type === 'ot_end'
                    ? 'purple'
                    : 'info'
                }`}
              />
              <div className="activity-body">
                <div className="activity-action">
                  <span className="emp-avatar-sm">{avatar}</span>
                  <span className="activity-user-name font-semibold">{empName}</span>
                  <span className="activity-type-icon">{TYPE_ICONS[type]}</span>
                  <span className="activity-type">
                    {TYPE_LABELS[type] || 'Attendance Event'}
                  </span>
                  {r.is_offline_sync === 1 && (
                    <span className="badge badge--warning">Offline Sync</span>
                  )}
                  {r.status === 'flagged' && (
                    <span className="badge badge--danger">Flagged</span>
                  )}
                </div>
                <div className="activity-meta font-mono">
                  {formatTime(time)} · Station QR · {score}% Confidence
                </div>
              </div>
              <div className="activity-time font-mono">{formatTime(time)}</div>
            </div>
          );
        })}
        {recent.length === 0 && (
          <div className="activity-empty">No activity records recorded today</div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ store }) {
  const { isAdmin, user } = useAuth();
  const {
    stats = {},
    teamSummary = [],
    records = [],
    myRecords = [],
    currentCheckIn,
    attendanceState,
    setActiveScreen,
  } = store;

  const recordedTime = currentCheckIn?.recorded_at || currentCheckIn?.recordedAt;
  const timer = useTimer(recordedTime);

  // Calculate user-specific metrics
  const myTodayIn = myRecords.find(
    (r) =>
      (r.record_type === 'check_in' || r.recordType === 'check_in') &&
      new Date(r.recorded_at || r.recordedAt).toDateString() === new Date().toDateString()
  );
  const myTodayOut = myRecords.find(
    (r) =>
      (r.record_type === 'check_out' || r.recordType === 'check_out') &&
      new Date(r.recorded_at || r.recordedAt).toDateString() === new Date().toDateString()
  );

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">
            {isAdmin ? 'Operations Dashboard' : `Welcome, ${user?.name || 'Technician'}`}
          </h1>
          <p className="screen-sub">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {currentCheckIn && (
          <div className="live-timer">
            <span className="live-timer-dot" />
            <span className="live-timer-label">On Site</span>
            <span className="live-timer-elapsed font-mono">{timer.formatted}</span>
          </div>
        )}
      </div>

      <DayTimeline />

      {/* Stats Row */}
      {isAdmin ? (
        <div className="stats-grid stagger-group">
          <StatCard
            label="Present Today"
            value={stats.presentToday ?? 0}
            sub={`of ${stats.totalEmployees ?? 0} employees`}
            color="success"
            icon={<Users size={20} className="text-success" />}
          />
          <StatCard
            label="Absent"
            value={stats.absentToday ?? 0}
            sub="not checked in"
            color="danger"
            icon={<AlertTriangle size={20} className="text-danger" />}
          />
          <StatCard
            label="Completed Shifts"
            value={stats.checkedOut ?? 0}
            sub="checked out"
            color="info"
            icon={<CheckCircle2 size={20} className="text-info" />}
          />
          <StatCard
            label="Flagged Records"
            value={stats.flaggedRecords ?? 0}
            sub="needs admin review"
            color="warning"
            icon={<ShieldAlert size={20} className="text-warning" />}
          />
        </div>
      ) : (
        <div className="stats-grid stagger-group">
          <StatCard
            label="Shift Status"
            value={
              attendanceState === 'checked_in'
                ? 'Active'
                : attendanceState === 'on_break'
                ? 'On Break'
                : myTodayOut
                ? 'Completed'
                : 'Not Started'
            }
            sub={
              myTodayIn
                ? `In at ${formatTime(myTodayIn.recorded_at || myTodayIn.recordedAt)}`
                : 'Scan QR to start'
            }
            color={attendanceState === 'checked_in' ? 'success' : 'info'}
            icon={<Zap size={20} className="text-accent" />}
          />
          <StatCard
            label="Today's Duration"
            value={
              attendanceState === 'checked_in'
                ? timer.short
                : myTodayIn && myTodayOut
                ? formatDuration(
                    (new Date(myTodayOut.recorded_at || myTodayOut.recordedAt) -
                      new Date(myTodayIn.recorded_at || myTodayIn.recordedAt)) /
                      3600000
                  )
                : '0h 0m'
            }
            sub="worked hours"
            color="info"
            icon={<Clock size={20} className="text-info" />}
          />
          <StatCard
            label="My Records"
            value={myRecords.length}
            sub="recorded events"
            color="success"
            icon={<ClipboardList size={20} className="text-success" />}
          />
          <StatCard
            label="Security Mode"
            value="Active"
            sub="verified session"
            color="warning"
            icon={<ShieldCheck size={20} className="text-warning" />}
          />
        </div>
      )}

      {/* Middle Charts & Activity Grid */}
      <div className="dashboard-grid">
        <WeekChart
          records={isAdmin ? records : myRecords}
          employees={teamSummary}
          isUserOnly={!isAdmin}
          userEmail={user?.email}
        />
        <ActivityFeed
          records={isAdmin ? store.auditRecords : myRecords}
          teamSummary={teamSummary}
          currentUser={user}
          isUserOnly={!isAdmin}
        />
      </div>

      {/* Admin Team Quick View */}
      {isAdmin && (
        <div className="team-quick">
          <div className="team-quick-header">
            <h3 className="section-title">Team Status Today</h3>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setActiveScreen('team')}
            >
              View Full Team →
            </button>
          </div>

          <div className="team-quick-grid stagger-group">
            {teamSummary.map((emp) => (
              <div
                key={emp.id}
                className={`team-quick-card ${
                  emp.flagged ? 'team-quick-card--flagged' : ''
                } interactive-item`}
              >
                <div className="team-quick-avatar">{emp.avatar || '👤'}</div>
                <div className="team-quick-info">
                  <div className="team-quick-name">{emp.name}</div>
                  <div className="team-quick-dept">
                    {emp.department} · {emp.email}
                  </div>
                </div>
                <div className={`status-pill status-pill--${emp.status}`}>
                  {emp.status === 'present'
                    ? '● Present'
                    : emp.status === 'checked_out'
                    ? '✓ Done'
                    : '○ Absent'}
                </div>
                {emp.checkInTime && (
                  <div className="team-quick-time font-mono">
                    In: {formatTime(emp.checkInTime)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
