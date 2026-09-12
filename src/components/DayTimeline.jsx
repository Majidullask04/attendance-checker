import { useMemo } from 'react';
import { useNow } from '../hooks/useNow.js';
import { POLICY, timeToMinutes } from '../config/policy.js';
import './DayTimeline.css';

export default function DayTimeline() {
  const now = useNow(5000); // refresh every 5s

  const currentMinutes = now.totalMinutes;

  // Timeline spans 6:00 AM (360) to 20:00 (1200) = 840 minutes total span
  const START_MIN = 6 * 60;   // 06:00
  const END_MIN = 20 * 60;    // 20:00
  const TOTAL_SPAN = END_MIN - START_MIN;

  const currentPercent = useMemo(() => {
    if (currentMinutes <= START_MIN) return 0;
    if (currentMinutes >= END_MIN) return 100;
    return ((currentMinutes - START_MIN) / TOTAL_SPAN) * 100;
  }, [currentMinutes, START_MIN, END_MIN, TOTAL_SPAN]);

  const activePhase = useMemo(() => {
    const checkInStart = timeToMinutes(POLICY.CHECK_IN_START); // 360
    const checkInEnd = timeToMinutes(POLICY.CHECK_IN_END);     // 540
    const breakNotify = timeToMinutes(POLICY.BREAK_NOTIFY);    // 830 (13:50)
    const breakEnd = breakNotify + POLICY.BREAK_MINUTES_MAX;   // 870 (14:30)
    const workEnd = timeToMinutes(POLICY.WORK_END);            // 1020 (17:00)

    if (currentMinutes < checkInStart) {
      return { label: 'Pre-Shift', desc: 'Scan starts at 06:00 AM', status: 'idle', color: 'neutral' };
    }
    if (currentMinutes <= checkInEnd) {
      return { label: 'Morning Check-In Window', desc: '06:00 - 09:00 AM: Scan for On-Time (Present)', status: 'check_in', color: 'success' };
    }
    if (currentMinutes < breakNotify) {
      return { label: 'Standard Working Shift', desc: 'Normal production hours (late if check-in after 9 AM)', status: 'working', color: 'primary' };
    }
    if (currentMinutes <= breakEnd) {
      return { label: 'Afternoon Break Window', desc: '1:50 PM: 30-40 min break. Scan QR to resume or Half Day', status: 'break', color: 'warning' };
    }
    if (currentMinutes < workEnd) {
      return { label: 'Afternoon Shift', desc: 'Finalizing day until 05:00 PM Full Day', status: 'working', color: 'primary' };
    }
    return { label: 'Overtime (OT) Window', desc: '05:00 PM+: Shift completed. QR scan toggles Overtime', status: 'ot', color: 'purple' };
  }, [currentMinutes]);

  return (
    <div className="day-timeline-card">
      <div className="day-timeline-header">
        <div className="timeline-title-wrap">
          <span className="timeline-live-indicator" />
          <span className="timeline-title">Shift Schedule Timeline</span>
          <span className="timeline-tz-tag">IST (Asia/Kolkata)</span>
        </div>
        <div className="timeline-current-time font-mono">
          {now.timeString} IST
        </div>
      </div>

      <div className="timeline-status-banner">
        <span className={`status-pill status-pill--${activePhase.color}`}>
          {activePhase.label}
        </span>
        <span className="timeline-desc">{activePhase.desc}</span>
      </div>

      <div className="timeline-bar-wrapper">
        <div className="timeline-bar-track">
          {/* 6:00 - 9:00 Check-in window (width: 180 / 840 = ~21.4%) */}
          <div
            className="timeline-segment segment--checkin"
            style={{ left: '0%', width: '21.4%' }}
            title="6:00 AM - 9:00 AM: Check-in Window"
          >
            <span className="segment-label">06:00 - 09:00 Check-In</span>
          </div>

          {/* 9:00 - 13:50 Morning Shift (width: 290 / 840 = ~34.5%) */}
          <div
            className="timeline-segment segment--work"
            style={{ left: '21.4%', width: '34.5%' }}
            title="9:00 AM - 1:50 PM: Morning Shift"
          >
            <span className="segment-label">Shift Hours</span>
          </div>

          {/* 13:50 - 14:30 Break (width: 40 / 840 = ~4.8%) */}
          <div
            className="timeline-segment segment--break"
            style={{ left: '55.9%', width: '4.8%' }}
            title="1:50 PM - 2:30 PM: Break (30-40 min countdown)"
          >
            <span className="segment-label">1:50 Break</span>
          </div>

          {/* 14:30 - 17:00 Afternoon Shift (width: 150 / 840 = ~17.9%) */}
          <div
            className="timeline-segment segment--work"
            style={{ left: '60.7%', width: '17.9%' }}
            title="2:30 PM - 5:00 PM: Afternoon Shift"
          >
            <span className="segment-label">Afternoon Shift</span>
          </div>

          {/* 17:00 - 20:00 OT Window (width: 180 / 840 = ~21.4%) */}
          <div
            className="timeline-segment segment--ot"
            style={{ left: '78.6%', width: '21.4%' }}
            title="5:00 PM+: Full Day & Overtime Window"
          >
            <span className="segment-label">17:00 Full Day / OT</span>
          </div>

          {/* Current Time Cursor */}
          <div
            className="timeline-now-cursor"
            style={{ left: `${Math.min(100, Math.max(0, currentPercent))}%` }}
          >
            <div className="now-cursor-pin font-mono">{now.timeString}</div>
            <div className="now-cursor-line" />
          </div>
        </div>

        {/* Timeline Tick Labels */}
        <div className="timeline-ticks">
          <span>06:00 AM</span>
          <span>09:00 AM</span>
          <span>01:50 PM</span>
          <span>05:00 PM</span>
          <span>08:00 PM</span>
        </div>
      </div>
    </div>
  );
}
