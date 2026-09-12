import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTimer } from '../hooks/useTimer.js';
import { formatTime } from '../utils/formatters.js';
import { POLICY, getZonedNow, timeToMinutes } from '../config/policy.js';
import QRGenerator from '../components/QRGenerator.jsx';
import QRScanner from '../components/QRScanner.jsx';
import DayTimeline from '../components/DayTimeline.jsx';

function BreakCountdown({ breakStartTime }) {
  const [elapsed, setElapsed] = useState(() => {
    if (!breakStartTime) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(breakStartTime).getTime()) / 1000));
  });

  useEffect(() => {
    if (!breakStartTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(breakStartTime).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [breakStartTime]);

  const TARGET_SECONDS = 30 * 60; // 30 minutes
  const MAX_SECONDS = 40 * 60;    // 40 minutes

  const remaining = Math.max(0, TARGET_SECONDS - elapsed);
  const remMinutes = Math.floor(remaining / 60);
  const remSeconds = remaining % 60;

  const isExceededTarget = elapsed > TARGET_SECONDS;
  const isExceededMax = elapsed > MAX_SECONDS;

  return (
    <div className="break-countdown-card">
      <div className="break-countdown-header">
        <span className="break-icon">☕</span>
        <span className="break-title">Afternoon Break Countdown</span>
      </div>

      <div className="break-timer-display font-mono">
        {!isExceededTarget ? (
          <>
            <span className="timer-large">
              {String(remMinutes).padStart(2, '0')}:{String(remSeconds).padStart(2, '0')}
            </span>
            <span className="timer-sublabel">remaining of 30-min break</span>
          </>
        ) : (
          <>
            <span className="timer-large timer-large--warning">
              +{Math.floor((elapsed - TARGET_SECONDS) / 60)}m {(elapsed - TARGET_SECONDS) % 60}s
            </span>
            <span className="timer-sublabel text-warning">Target exceeded (Grace limit 40 min)</span>
          </>
        )}
      </div>

      {isExceededMax && (
        <div className="break-warning-banner">
          ⚠️ <strong>Break exceeded 40 minutes!</strong> You must scan the Station QR code immediately, otherwise your attendance will be recorded as <strong>Half Day</strong>.
        </div>
      )}

      <div className="break-info-note">
        Requirement: Employee must scan the station QR to resume shift.
      </div>
    </div>
  );
}

export default function CheckIn({ store }) {
  const { isAdmin } = useAuth();
  const {
    attendanceState,
    currentCheckIn,
    breakStartTime,
    activeLocation,
    currentQRToken,
    checkInWithQR,
    checkOutWithQR,
    startBreak,
    endBreak,
    startOT,
    endOT,
    isOnline,
    isLoading,
  } = store;

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState('auto'); // auto | break_end | ot_start | ot_end

  const recordedTime = currentCheckIn?.recorded_at || currentCheckIn?.recordedAt;
  const shiftTimer = useTimer(recordedTime);

  // Check current IST time to determine if post-5:00 PM (OT eligible)
  const [isPost5PM, setIsPost5PM] = useState(() => {
    const zoned = getZonedNow(POLICY.TIMEZONE);
    return zoned.totalMinutes >= timeToMinutes(POLICY.WORK_END);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const zoned = getZonedNow(POLICY.TIMEZONE);
      setIsPost5PM(zoned.totalMinutes >= timeToMinutes(POLICY.WORK_END));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const openScanner = (mode = 'auto') => {
    setScannerMode(mode);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = useCallback(
    async (scannedString) => {
      setIsScannerOpen(false);

      if (scannerMode === 'break_end' || attendanceState === 'on_break') {
        await endBreak(scannedString);
      } else if (scannerMode === 'ot_start') {
        await startOT(scannedString);
      } else if (scannerMode === 'ot_end' || attendanceState === 'ot_active') {
        await endOT(scannedString);
      } else if (attendanceState === 'idle') {
        await checkInWithQR(scannedString);
      } else if (attendanceState === 'checked_in') {
        await checkOutWithQR(scannedString);
      }
    },
    [scannerMode, attendanceState, endBreak, startOT, endOT, checkInWithQR, checkOutWithQR]
  );

  // Admin View
  if (isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="screen-header">
          <div>
            <h1 className="screen-title">QR Code Station Manager</h1>
            <p className="screen-sub">
              Display this dynamic station QR code at the work entrance for staff to check in, resume breaks, and record OT.
            </p>
          </div>
        </div>

        <DayTimeline />
        <QRGenerator store={store} />
      </div>
    );
  }

  // Employee View
  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Shift Attendance & QR Scan</h1>
          <p className="screen-sub">
            Scan station QR codes for check-in (6-9 AM), break resumption (1:50 PM), and overtime after 5 PM.
          </p>
        </div>
      </div>

      <DayTimeline />

      <div className="checkin-layout">
        {/* Main Status & Action Card */}
        <div className="checkin-card">
          {/* Status Indicator */}
          <div
            className={`checkin-status checkin-status--${
              attendanceState === 'checked_in'
                ? 'success'
                : attendanceState === 'on_break'
                ? 'warning'
                : attendanceState === 'ot_active'
                ? 'purple'
                : 'neutral'
            }`}
          >
            <div className="pulse-ring-wrap">
              <div className="pulse-ring" />
              <div className="pulse-ring pulse-ring--delay" />
            </div>
            <div className="checkin-status-inner">
              <div className="checkin-status-label">
                {attendanceState === 'checked_in'
                  ? 'Checked In (Active Shift)'
                  : attendanceState === 'on_break'
                  ? 'On Break (30–40 min)'
                  : attendanceState === 'ot_active'
                  ? 'Active Overtime (OT)'
                  : attendanceState === 'checking_in'
                  ? 'Verifying…'
                  : 'Ready to Check In'}
              </div>
              {recordedTime && (
                <div className="checkin-status-time">
                  Shift started at {formatTime(recordedTime)}
                </div>
              )}
            </div>
          </div>

          {/* Shift Timer */}
          {(attendanceState === 'checked_in' || attendanceState === 'ot_active') && (
            <div className="checkin-timer">
              <div className="checkin-timer-label">
                {attendanceState === 'ot_active' ? 'Active Overtime Duration' : 'Total Shift Elapsed'}
              </div>
              <div className="checkin-timer-value font-mono">
                {shiftTimer.formatted}
              </div>
            </div>
          )}

          {/* Break Countdown Display */}
          {attendanceState === 'on_break' && (
            <BreakCountdown breakStartTime={breakStartTime} />
          )}

          {/* Action Trigger Buttons */}
          <div className="checkin-actions-stack">
            {attendanceState === 'idle' && (
              <button
                id="btn-open-scanner"
                className="btn-action btn-checkin"
                onClick={() => openScanner('check_in')}
                disabled={isLoading}
              >
                <span className="btn-icon">📷</span>
                <span>{isLoading ? 'Processing…' : 'Scan QR to Check In'}</span>
              </button>
            )}

            {attendanceState === 'checked_in' && (
              <>
                <div className="btn-group-row">
                  <button
                    id="btn-start-break"
                    className="btn-secondary flex-1"
                    onClick={startBreak}
                    disabled={isLoading}
                  >
                    ☕ Take Break (30-40m)
                  </button>

                  <button
                    id="btn-scan-checkout"
                    className="btn-action btn-checkout flex-1"
                    onClick={() => openScanner('check_out')}
                    disabled={isLoading}
                  >
                    <span className="btn-icon">📷</span>
                    <span>{isPost5PM ? 'Full Day Check-Out' : 'Check Out'}</span>
                  </button>
                </div>

                {/* If past 5:00 PM, show OT scan option */}
                {isPost5PM && (
                  <button
                    id="btn-start-ot"
                    className="btn-action btn-ot"
                    onClick={() => openScanner('ot_start')}
                    disabled={isLoading}
                  >
                    <span className="btn-icon">⏫</span>
                    <span>Scan QR to Start Overtime (OT)</span>
                  </button>
                )}
              </>
            )}

            {attendanceState === 'on_break' && (
              <button
                id="btn-resume-break"
                className="btn-action btn-checkin"
                onClick={() => openScanner('break_end')}
                disabled={isLoading}
              >
                <span className="btn-icon">📷</span>
                <span>Scan Station QR to Resume Shift</span>
              </button>
            )}

            {attendanceState === 'ot_active' && (
              <button
                id="btn-stop-ot"
                className="btn-action btn-checkout"
                onClick={() => openScanner('ot_end')}
                disabled={isLoading}
              >
                <span className="btn-icon">⏹</span>
                <span>Scan Station QR to Stop Overtime</span>
              </button>
            )}
          </div>

          {/* Offline Notice */}
          {!isOnline && (
            <div className="offline-banner">
              <span>📵 Network Offline — Real-time server sync paused.</span>
            </div>
          )}
        </div>

        {/* Informational Panels */}
        <div className="checkin-info-col">
          <div className="info-card">
            <div className="info-card-title">📍 Assigned Station</div>
            <div className="info-card-value">{activeLocation.name}</div>
            <div className="info-card-sub">
              Geofence Radius: {activeLocation.radius}m · WiFi: {activeLocation.wifi_ssid}
            </div>
            <div className="info-card-coords font-mono">
              GPS: {activeLocation.lat.toFixed(4)}, {activeLocation.lng.toFixed(4)}
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-title">⏰ Today's Shift Rules</div>
            <div className="info-card-items">
              <div className="info-card-row">
                <span className="info-card-row-label">Check-In Window</span>
                <span className="info-card-row-val text-success">06:00 – 09:00 AM (On-time)</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Late Threshold</span>
                <span className="info-card-row-val text-warning">After 09:00 AM (Late)</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Afternoon Break</span>
                <span className="info-card-row-val text-accent">01:50 PM (30–40 min max)</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Resume Requirement</span>
                <span className="info-card-row-val text-warning">QR Scan (or Half Day)</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Full Day Mark</span>
                <span className="info-card-row-val text-success">05:00 PM (17:00 IST)</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Overtime (OT)</span>
                <span className="info-card-row-val text-purple">After 05:00 PM (OT QR Scan)</span>
              </div>
            </div>
          </div>

          {currentCheckIn && (
            <div className="info-card">
              <div className="info-card-title">📋 Current Shift Record</div>
              <div className="info-card-items">
                <div className="info-card-row">
                  <span className="info-card-row-label">Checked In At</span>
                  <span className="info-card-row-val font-mono">
                    {formatTime(recordedTime)}
                  </span>
                </div>
                <div className="info-card-row">
                  <span className="info-card-row-label">Method</span>
                  <span className="info-card-row-val font-mono text-accent">
                    QR CODE SCAN
                  </span>
                </div>
                <div className="info-card-row">
                  <span className="info-card-row-label">Confidence</span>
                  <span className="info-card-row-val font-mono text-success">
                    {currentCheckIn.confidence_score || currentCheckIn.confidenceScore || 95}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Camera Scanner Modal */}
      {isScannerOpen && (
        <QRScanner
          onScan={handleScanSuccess}
          onClose={() => setIsScannerOpen(false)}
          currentQRToken={currentQRToken}
        />
      )}
    </div>
  );
}
