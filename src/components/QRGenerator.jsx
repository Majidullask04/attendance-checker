import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { formatTime, formatDate } from '../utils/formatters';

export default function QRGenerator({ store }) {
  const {
    currentQRToken,
    generateNewQRToken,
    activeLocation,
    locations,
    setActiveLocation,
    todayRecords,
    addToast,
  } = store;

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate QR image whenever currentQRToken or activeLocation changes
  // Uses compact short-key format to keep QR codes scannable at lower resolutions
  useEffect(() => {
    if (!currentQRToken) {
      setQrDataUrl('');
      return;
    }

    // Compact payload: short keys reduce QR density for faster scanning
    const compactPayload = JSON.stringify({
      l: currentQRToken.locationId,
      t: currentQRToken.token || currentQRToken.tokenId,
      g: Math.floor(new Date(currentQRToken.generatedAt).getTime() / 1000),
    });
    QRCode.toDataURL(compactPayload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to render QR Code:', err);
        addToast('Failed to render QR Code', 'error');
      });
  }, [currentQRToken, addToast]);

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const newToken = generateNewQRToken(activeLocation);
      addToast('New QR Token generated. Previous QR is now invalid.', 'success');
    } catch (e) {
      addToast('Error generating token', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPayload = () => {
    if (!currentQRToken) return;
    navigator.clipboard.writeText(JSON.stringify(currentQRToken, null, 2));
    setCopied(true);
    addToast('QR Payload copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2500);
  };

  const qrUsageCount = todayRecords.filter(
    (r) => r.qrTokenId === currentQRToken?.tokenId
  ).length;

  return (
    <div className="qr-generator-container fade-in">
      <div className="qr-generator-card">
        <div className="qr-header-bar">
          <div className="qr-status-indicator">
            <span className="live-pulse-dot" />
            <span className="qr-status-text">Active Station QR</span>
          </div>
          <span className="badge badge--success">Live & Validating</span>
        </div>

        {/* QR Code Presentation Frame */}
        <div className="qr-display-frame">
          {qrDataUrl ? (
            <div className="qr-image-wrapper">
              <img
                src={qrDataUrl}
                alt="Attendance Station QR Code"
                className="qr-image"
                id="station-qr-code"
              />
              <div className="qr-scan-line" />
            </div>
          ) : (
            <div className="qr-placeholder">
              <div className="qr-placeholder-icon">⚡</div>
              <p>No active token found</p>
              <button
                className="btn-primary"
                onClick={handleRegenerate}
              >
                Generate First QR
              </button>
            </div>
          )}
        </div>

        {/* Token Meta Details */}
        {currentQRToken && (
          <div className="qr-token-details">
            <div className="token-detail-row">
              <span className="token-detail-label">Token ID</span>
              <span className="token-detail-val font-mono" title={currentQRToken.tokenId}>
                {currentQRToken.tokenId.slice(0, 16)}…
              </span>
            </div>

            <div className="token-detail-row">
              <span className="token-detail-label">Location</span>
              <span className="token-detail-val">{currentQRToken.locationName}</span>
            </div>

            <div className="token-detail-row">
              <span className="token-detail-label">Generated At</span>
              <span className="token-detail-val font-mono">
                {formatTime(currentQRToken.generatedAt)}
              </span>
            </div>

            <div className="token-detail-row">
              <span className="token-detail-label">Scans Today</span>
              <span className="token-detail-val font-mono text-accent">
                {qrUsageCount} check-ins
              </span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="qr-actions-row">
          <button
            id="btn-regenerate-qr"
            className="btn-regenerate"
            onClick={handleRegenerate}
            disabled={isGenerating}
          >
            <span className="btn-icon">{isGenerating ? '⟳' : '⚡'}</span>
            <span>{isGenerating ? 'Generating…' : 'Regenerate QR Token'}</span>
          </button>

          <button
            id="btn-copy-payload"
            className="btn-secondary btn-copy"
            onClick={handleCopyPayload}
            title="Copy raw JSON payload"
          >
            {copied ? '✓ Copied' : '📋 Copy JSON'}
          </button>
        </div>

        {/* Warning Banner */}
        <div className="qr-security-warning">
          <span className="warning-icon">⚠️</span>
          <p>
            <strong>Security Notice:</strong> Regenerating the QR token immediately
            invalidates all older printouts and screenshots to prevent replay fraud.
          </p>
        </div>
      </div>

      {/* Admin Settings & Location Info Panel */}
      <div className="qr-admin-sidebar">
        <div className="info-card">
          <div className="info-card-title">🏢 Station Geofence</div>
          <div className="location-select-wrap">
            <label className="form-label" htmlFor="location-select">
              Active Attendance Site:
            </label>
            <select
              id="location-select"
              className="location-select"
              value={activeLocation.id}
              onChange={(e) => {
                const loc = locations.find((l) => l.id === e.target.value);
                if (loc) {
                  setActiveLocation(loc);
                  generateNewQRToken(loc);
                  addToast(`Switched station to ${loc.name}`, 'info');
                }
              }}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.radius}m)
                </option>
              ))}
            </select>
          </div>

          <div className="info-card-items" style={{ marginTop: '12px' }}>
            <div className="info-card-row">
              <span className="info-card-row-label">Coordinates</span>
              <span className="info-card-row-val font-mono">
                {activeLocation.lat.toFixed(4)}, {activeLocation.lng.toFixed(4)}
              </span>
            </div>
            <div className="info-card-row">
              <span className="info-card-row-label">Approved WiFi</span>
              <span className="info-card-row-val font-mono">
                {activeLocation.wifi_ssid}
              </span>
            </div>
            <div className="info-card-row">
              <span className="info-card-row-label">Geofence Radius</span>
              <span className="info-card-row-val font-mono">
                {activeLocation.radius} meters
              </span>
            </div>
          </div>
        </div>

        <div className="info-card">
          <div className="info-card-title">🛡️ Anti-Fraud Rules Active</div>
          <div className="anti-fraud-list">
            <div className="anti-fraud-item">
              <span className="badge badge--success">Active</span>
              <span className="anti-fraud-text">
                One-time token validation per scan
              </span>
            </div>
            <div className="anti-fraud-item">
              <span className="badge badge--success">Active</span>
              <span className="anti-fraud-text">
                Dynamic token invalidation on refresh
              </span>
            </div>
            <div className="anti-fraud-item">
              <span className="badge badge--success">Active</span>
              <span className="anti-fraud-text">
                Device fingerprint signature logged
              </span>
            </div>
            <div className="anti-fraud-item">
              <span className="badge badge--success">Active</span>
              <span className="anti-fraud-text">
                GPS proximity drift cross-checked
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
