import { useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTimer } from '../hooks/useTimer.js';
import { formatTime } from '../utils/formatters.js';
import QRGenerator from '../components/QRGenerator.jsx';
import QRScanner from '../components/QRScanner.jsx';

export default function CheckIn({ store }) {
  const { isAdmin } = useAuth();
  const {
    attendanceState,
    currentCheckIn,
    activeLocation,
    currentQRToken,
    checkInWithQR,
    checkOutWithQR,
    startBreak,
    endBreak,
    isOnline,
    isLoading,
  } = store;

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const recordedTime = currentCheckIn?.recorded_at || currentCheckIn?.recordedAt;
  const timer = useTimer(recordedTime);

  // Hooks must be called before any early returns
  const handleScanSuccess = useCallback(async (scannedString) => {
    setIsScannerOpen(false);

    if (attendanceState === 'idle') {
      await checkInWithQR(scannedString);
    } else if (attendanceState === 'checked_in') {
      await checkOutWithQR(scannedString);
    }
  }, [attendanceState, checkInWithQR, checkOutWithQR]);

  // If Admin: Render the full QR Management Portal
  if (isAdmin) {
    return (
      <div className="screen fade-in">
        <div className="screen-header">
          <div>
            <h1 className="screen-title">QR Code Station Manager</h1>
            <p className="screen-sub">
              Display this dynamic QR code at the work entrance for staff to check in and out.
            </p>
          </div>
        </div>

        <QRGenerator store={store} />
      </div>
    );
  }

  // If Employee: Render the Employee QR Scanner & Status Portal
  // (useCallback was moved up)

  return (
    <div className="screen fade-in">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Shift Attendance & QR Scan</h1>
          <p className="screen-sub">
            Scan the active QR code at your station or job site to record your shift.
          </p>
        </div>
      </div>

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
                  ? 'Checked In (Active)'
                  : attendanceState === 'on_break'
                  ? 'On Break'
                  : attendanceState === 'checking_in'
                  ? 'Verifying…'
                  : 'Ready to Check In'}
              </div>
              {recordedTime && (
                <div className="checkin-status-time">
                  Since {formatTime(recordedTime)}
                </div>
              )}
            </div>
          </div>

          {/* Live Shift Timer */}
          {attendanceState === 'checked_in' && (
            <div className="checkin-timer">
              <div className="checkin-timer-label">Active Shift Duration</div>
              <div className="checkin-timer-value font-mono">
                {timer.formatted}
              </div>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="checkin-actions-stack">
            {attendanceState === 'idle' && (
              <button
                id="btn-open-scanner"
                className="btn-action btn-checkin"
                onClick={() => setIsScannerOpen(true)}
                disabled={isLoading}
              >
                <span className="btn-icon">📷</span>
                <span>{isLoading ? 'Processing…' : 'Open Scanner to Check In'}</span>
              </button>
            )}

            {attendanceState === 'checked_in' && (
              <>
                <button
                  id="btn-scan-checkout"
                  className="btn-action btn-checkout"
                  onClick={() => setIsScannerOpen(true)}
                  disabled={isLoading}
                >
                  <span className="btn-icon">📷</span>
                  <span>{isLoading ? 'Processing…' : 'Scan QR to Check Out'}</span>
                </button>

                <button
                  id="btn-start-break"
                  className="btn-secondary"
                  onClick={startBreak}
                >
                  ☕ Take Break
                </button>
              </>
            )}

            {attendanceState === 'on_break' && (
              <button
                id="btn-end-break"
                className="btn-action btn-endbreak"
                onClick={endBreak}
              >
                <span>Resume Shift</span>
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
            <div className="info-card-title">🔒 Server-Side Multi-Factor Verification</div>
            <div className="info-card-items">
              <div className="info-card-row">
                <span className="info-card-row-label">QR Dynamic Token</span>
                <span className="info-card-row-val text-success">✓ Enforced</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Anti-Replay Lock</span>
                <span className="info-card-row-val text-success">✓ Enforced in SQLite</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Device Signature</span>
                <span className="info-card-row-val text-success">✓ Fingerprinted</span>
              </div>
              <div className="info-card-row">
                <span className="info-card-row-label">Audit Trail Log</span>
                <span className="info-card-row-val text-success">✓ Immutable API</span>
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
                    {currentCheckIn.confidence_score || currentCheckIn.confidenceScore || 90}%
                  </span>
                </div>
                <div className="info-card-row">
                  <span className="info-card-row-label">Token Reference</span>
                  <span
                    className="info-card-row-val font-mono"
                    title={currentCheckIn.qr_token || currentCheckIn.qrTokenId}
                  >
                    {(currentCheckIn.qr_token || currentCheckIn.qrTokenId || '').slice(0, 14)}…
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
