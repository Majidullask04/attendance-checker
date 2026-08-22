import { useState, useEffect } from 'react';
import { formatTime } from '../utils/formatters';

const STATE_CONFIG = {
  idle:         { label: 'Ready to Check In',  color: 'neutral', action: 'CHECK IN',  btnClass: 'btn-checkin' },
  checking_in:  { label: 'Validating…',         color: 'accent',  action: null,        btnClass: 'btn-loading' },
  checked_in:   { label: 'Checked In',          color: 'success', action: 'CHECK OUT', btnClass: 'btn-checkout' },
  on_break:     { label: 'On Break',            color: 'warning', action: 'END BREAK', btnClass: 'btn-endbreak' },
  checking_out: { label: 'Processing…',         color: 'accent',  action: null,        btnClass: 'btn-loading' },
};

function PulseRing({ color }) {
  return (
    <div className={`pulse-ring-wrap pulse-ring-wrap--${color}`}>
      <div className="pulse-ring" />
      <div className="pulse-ring pulse-ring--delay" />
    </div>
  );
}

function VerificationStep({ icon, label, done, active }) {
  return (
    <div className={`verify-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <div className="verify-step-icon">{done ? '✓' : active ? '⟳' : icon}</div>
      <span className="verify-step-label">{label}</span>
    </div>
  );
}

export default function CheckIn({ store }) {
  const {
    attendanceState, currentCheckIn, activeLocation,
    checkIn, checkOut, startBreak, endBreak, isOnline, offlineQueue
  } = store;

  const [elapsed, setElapsed] = useState('0m 0s');
  const [verifyStep, setVerifyStep] = useState(0); // 0=idle, 1=gps, 2=geofence, 3=dupe-check, 4=done
  const cfg = STATE_CONFIG[attendanceState];

  useEffect(() => {
    if (!currentCheckIn) { setElapsed('0m 0s'); return; }
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

  // Animate validation steps during checking_in
  useEffect(() => {
    if (attendanceState === 'checking_in') {
      setVerifyStep(1);
      const t1 = setTimeout(() => setVerifyStep(2), 500);
      const t2 = setTimeout(() => setVerifyStep(3), 1000);
      const t3 = setTimeout(() => setVerifyStep(4), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else {
      setVerifyStep(0);
    }
  }, [attendanceState]);

  const handlePrimary = () => {
    if (attendanceState === 'idle') checkIn();
    else if (attendanceState === 'checked_in') checkOut();
    else if (attendanceState === 'on_break') endBreak();
  };

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Check In / Out</h1>
          <p className="screen-sub">Tap to record your attendance · GPS + WiFi verified</p>
        </div>
      </div>

      <div className="checkin-layout">
        {/* Main action card */}
        <div className="checkin-card">
          {/* Status indicator */}
          <div className={`checkin-status checkin-status--${cfg.color}`}>
            <PulseRing color={cfg.color} />
            <div className="checkin-status-inner">
              <div className="checkin-status-label">{cfg.label}</div>
              {currentCheckIn && <div className="checkin-status-time">{formatTime(currentCheckIn.recordedAt)}</div>}
            </div>
          </div>

          {/* Timer */}
          {attendanceState === 'checked_in' && (
            <div className="checkin-timer">
              <div className="checkin-timer-label">Time on site</div>
              <div className="checkin-timer-value font-mono">{elapsed}</div>
            </div>
          )}

          {/* Validation steps (visible while processing) */}
          {(attendanceState === 'checking_in' || attendanceState === 'checking_out') && (
            <div className="verify-steps">
              <VerificationStep icon="📍" label="Acquiring GPS"    done={verifyStep > 1} active={verifyStep === 1} />
              <VerificationStep icon="⊙"  label="Geofence check"  done={verifyStep > 2} active={verifyStep === 2} />
              <VerificationStep icon="⊡"  label="Duplicate check" done={verifyStep > 3} active={verifyStep === 3} />
              <VerificationStep icon="✦"  label="Signing record"  done={verifyStep > 4} active={verifyStep === 4} />
            </div>
          )}

          {/* Primary Action Button */}
          {cfg.action && (
            <button
              id={`btn-${attendanceState}-action`}
              className={`btn-action ${cfg.btnClass}`}
              onClick={handlePrimary}
              disabled={attendanceState === 'checking_in' || attendanceState === 'checking_out'}
            >
              {cfg.action}
            </button>
          )}

          {/* Break button */}
          {attendanceState === 'checked_in' && (
            <button id="btn-break-start" className="btn-secondary" onClick={startBreak}>
              Start Break
            </button>
          )}

          {/* Offline warning */}
          {!isOnline && (
            <div className="offline-banner">
              <span>📵 Offline — your check-in will sync when connected</span>
              {offlineQueue.length > 0 && <span className="badge badge--warning">{offlineQueue.length} queued</span>}
            </div>
          )}
        </div>

        {/* Info panels */}
        <div className="checkin-info-col">
          <div className="info-card">
            <div className="info-card-title">📍 Location</div>
            <div className="info-card-value">{activeLocation.name}</div>
            <div className="info-card-sub">Radius: {activeLocation.radius}m · WiFi: {activeLocation.wifi_ssid}</div>
            <div className="info-card-coords font-mono">
              {activeLocation.lat.toFixed(4)}, {activeLocation.lng.toFixed(4)}
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-title">🔒 Security</div>
            <div className="info-card-items">
              {[
                ['GPS Verification',    '✓'],
                ['WiFi Cross-check',    '✓'],
                ['Device Fingerprint',  '✓'],
                ['Clock Drift Check',   '✓'],
                ['Idempotency Guard',   '✓'],
                ['Rate Limit Active',   '✓'],
              ].map(([label, val]) => (
                <div key={label} className="info-card-row">
                  <span className="info-card-row-label">{label}</span>
                  <span className="info-card-row-val text-success">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {currentCheckIn && (
            <div className="info-card">
              <div className="info-card-title">📋 Current Record</div>
              <div className="info-card-items">
                {[
                  ['Verified by',  currentCheckIn.verifiedBy.toUpperCase()],
                  ['Accuracy',     `${currentCheckIn.accuracyMeters}m`],
                  ['Confidence',   `${currentCheckIn.confidenceScore}%`],
                  ['Offline Sync', currentCheckIn.isOfflineSync ? 'Yes' : 'No'],
                  ['Device ID',    currentCheckIn.deviceId],
                ].map(([label, val]) => (
                  <div key={label} className="info-card-row">
                    <span className="info-card-row-label">{label}</span>
                    <span className="info-card-row-val font-mono">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
