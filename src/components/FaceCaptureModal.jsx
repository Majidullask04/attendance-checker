// src/components/FaceCaptureModal.jsx
// Layer 2: Face Detection, Liveness & 1:1 Verification capture — Hallmark Vantage
// dark readout chassis (#121417), copper corner brackets (#B35010), breaker-blue
// face-lock telemetry (#0E639C), JetBrains Mono readout. Zero emojis, zero glow.
// Renders a side-by-side ENROLLED REFERENCE PHOTO vs LIVE CAMERA VERIFICATION
// comparison and blocks the punch until liveness + 1:1 match pass
// (128-D euclidean <= 0.45 via @vladmandic/face-api, legacy 64-D cosine fallback).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeImageQuality,
  computeLivenessFrameDelta,
  computeSelfieSHA256,
  FACE_CAPTURE_WIDTH,
  FACE_CAPTURE_HEIGHT,
} from '../utils/faceDetectionEngine.js';
import {
  initFaceModels,
  detectAndExtractDescriptor,
  matchDescriptors,
  getEngineStatus,
} from '../utils/faceRecognitionEngine.js';
import { ScanFace, ShieldCheck, CameraOff, RefreshCw } from 'lucide-react';

const LOOP_INTERVAL_MS = 400;
const LIVENESS_STREAK_REQUIRED = 2; // consecutive passing micro-motion deltas

export default function FaceCaptureModal({
  onCapture,
  onClose,
  enrolledSignature = null,
  descriptor = null,
  referencePhoto = null,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const prevFrameRef = useRef(null);
  const livenessStreakRef = useRef(0);
  const faceRef = useRef(null);
  const busyRef = useRef(false);

  const [cameraError, setCameraError] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [engineStatus, setEngineStatus] = useState(() => getEngineStatus());
  const [telemetry, setTelemetry] = useState({
    brightness: 0,
    sharpness: 0,
    faceLock: false,
    faceLockReason: 'INITIALIZING',
    livenessPct: 0,
    livenessPass: false,
    livenessReason: 'WAITING',
    matchPct: null,
    ready: false,
  });

  // Enrolled identity source of truth: prefer the 128-D descriptor,
  // fall back to the legacy 64-D signature.
  const enrolledDescriptor = descriptor?.length ? descriptor : enrolledSignature;
  const descriptorLength = enrolledDescriptor?.length || 0;
  const enrollFirstTime = descriptorLength === 0;

  // Load neural engine models once (never throws)
  useEffect(() => {
    let mounted = true;
    initFaceModels().then((state) => {
      if (mounted) setEngineStatus({ ...state, error: getEngineStatus().error });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Stop camera + timers
  const teardown = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: FACE_CAPTURE_WIDTH * 2, height: FACE_CAPTURE_HEIGHT * 2, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playResult = videoRef.current.play();
          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => { /* autoplay of muted mirror video is generally allowed */ });
          }
        }
      } catch (err) {
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access to verify your face.'
            : `Camera unavailable: ${err?.message || 'no video device found'}`
        );
        return;
      }

      // Analyze loop
      loopRef.current = setInterval(async () => {
        if (busyRef.current) return; // guard against overlapping neural inference
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);
        const imageData = ctx.getImageData(0, 0, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);

        // Stage 1: quality gate
        const quality = analyzeImageQuality(imageData);

        // Stage 3: liveness frame delta (consecutive micro-motion)
        let liveness = { passed: false, motionPct: 0, reason: 'WAITING' };
        if (quality.passed && prevFrameRef.current) {
          liveness = computeLivenessFrameDelta(prevFrameRef.current, imageData);
        }
        prevFrameRef.current = imageData;
        livenessStreakRef.current = liveness.passed
          ? Math.min(livenessStreakRef.current + 1, 6)
          : 0;

        // Stage 2+4: single-face detection + descriptor (neural 128-D or geometric 64-D)
        let face = { detected: false, faceCount: null, reason: quality.passed ? 'SCANNING' : quality.reason, method: null };
        if (quality.passed) {
          busyRef.current = true;
          try {
            face = await detectAndExtractDescriptor(canvas, ctx);
          } catch {
            face = { detected: false, faceCount: null, reason: 'Detection error — retry' };
          } finally {
            busyRef.current = false;
          }
        }

        // 1:1 match against this employee's enrolled descriptor
        let matchPct = null;
        if (face.detected && face.descriptor) {
          const match = enrollFirstTime ? null : matchDescriptors(enrolledDescriptor, face.descriptor);
          if (match) {
            matchPct = match.matchPct;
            face.matchPass = match.pass;
          }
          face.latestSignature = face.descriptor;
        }

        faceRef.current = face;
        const livenessPass = quality.passed && livenessStreakRef.current >= LIVENESS_STREAK_REQUIRED;
        const ready =
          quality.passed &&
          face.detected &&
          livenessPass &&
          (enrollFirstTime || (matchPct != null && face.matchPass));

        setTelemetry({
          brightness: quality.meanBrightness,
          sharpness: quality.sharpnessScore,
          faceLock: face.detected,
          faceLockReason: face.reason || (face.detected ? 'FACE LOCKED' : 'SCANNING'),
          livenessPct: liveness.motionPct,
          livenessPass,
          livenessReason: livenessPass ? 'LIVE_VERIFIED' : liveness.reason,
          matchPct: matchPct == null ? null : Math.round(matchPct * 10) / 10,
          ready,
        });
      }, LOOP_INTERVAL_MS);
    };

    start();
    return () => {
      cancelled = true;
      teardown();
    };
  }, [teardown, enrollFirstTime, enrolledDescriptor]);

  // Stage 5: capture WebP + SHA-256 digest and hand off
  const handleCapture = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || capturing) return;
    const face = faceRef.current;
    setCapturing(true);
    try {
      const timestampIso = new Date().toISOString();
      let dataUrl = canvas.toDataURL('image/webp', 0.6);
      if (!dataUrl.startsWith('data:image/webp;')) {
        // Safari / WebView without WebP encoder — deterministic JPEG fallback
        dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      }
      const selfieSha256 = await computeSelfieSHA256(dataUrl, `selfie|${timestampIso}`, timestampIso);
      teardown();
      onCapture({
        selfieDataUrl: dataUrl,
        selfieSha256,
        faceSignature: face?.descriptor?.length === 64 ? Array.from(face.descriptor) : null,
        faceDescriptor: face?.descriptor?.length === 128 ? Array.from(face.descriptor) : null,
        livenessVerified: true,
      });
    } catch (err) {
      setCameraError(`Capture failed: ${err?.message || 'encoder error'}`);
      setCapturing(false);
    }
  }, [capturing, onCapture, teardown]);

  const t = telemetry;
  const showSideBySide = Boolean(referencePhoto);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Face verification">
      <div className={`face-modal fade-in ${showSideBySide ? 'face-modal--wide' : ''}`}>
        <div className="face-modal-header">
          <div className="face-modal-title">
            <ScanFace size={16} />
            <span>
              1:1 Identity Verification —{' '}
              {engineStatus.status === 'ready' ? 'NEURAL 128-D ENGINE' : 'GEOMETRIC FALLBACK ENGINE'}
            </span>
          </div>
          <button
            className="face-modal-close"
            onClick={() => initFaceModels().then((state) => setEngineStatus({ ...state, error: getEngineStatus().error }))}
            aria-label="Reload face recognition engine"
            title="Reload face recognition engine"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className={showSideBySide ? 'face-compare-grid' : ''}>
          {showSideBySide && (
            <div className="face-reference-panel">
              <div className="face-panel-label font-mono">ENROLLED REFERENCE PHOTO</div>
              <div className="face-reference-frame">
                <img src={referencePhoto} alt="Enrolled reference face photo" />
              </div>
              <div className="face-reference-caption font-mono">BOUND TO YOUR ACCOUNT</div>
            </div>
          )}

          <div className={showSideBySide ? 'face-live-panel' : ''}>
            {showSideBySide && <div className="face-panel-label font-mono">LIVE CAMERA VERIFICATION</div>}
            <div className="face-viewfinder">
              {/* Copper corner brackets */}
              <span className="face-bracket face-bracket--tl" />
              <span className="face-bracket face-bracket--tr" />
              <span className="face-bracket face-bracket--bl" />
              <span className="face-bracket face-bracket--br" />
              {/* Breaker-blue face-lock indicator */}
              <span className={`face-lock-indicator ${t.faceLock ? 'face-lock-indicator--locked' : ''}`} />

              <video
                ref={videoRef}
                className="face-video"
                playsInline
                muted
                autoPlay
              />
              <canvas
                ref={canvasRef}
                width={FACE_CAPTURE_WIDTH}
                height={FACE_CAPTURE_HEIGHT}
                className="face-canvas"
                aria-hidden="true"
              />

              {cameraError && (
                <div className="face-camera-error">
                  <CameraOff size={18} />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* JetBrains Mono live telemetry readout */}
        <div className="face-telemetry font-mono">
          <div className="face-telemetry-row">
            <span className="face-telemetry-label">BRIGHTNESS</span>
            <span className={`face-telemetry-value ${t.brightness >= 40 && t.brightness <= 230 ? 'text-success' : 'text-warning'}`}>
              {t.brightness} · {t.sharpness.toFixed(1)}
            </span>
          </div>
          <div className="face-telemetry-row">
            <span className="face-telemetry-label">FACE LOCK</span>
            <span className={`face-telemetry-value ${t.faceLock ? 'text-success' : 'text-warning'}`}>
              {t.faceLock ? (t.faceLockReason !== 'FACE LOCKED' ? t.faceLockReason : 'LOCKED · 1 FACE') : t.faceLockReason.toUpperCase()}
            </span>
          </div>
          <div className="face-telemetry-row">
            <span className="face-telemetry-label">LIVENESS</span>
            <span className={`face-telemetry-value ${t.livenessPass ? 'text-success' : 'text-warning'}`}>
              {t.livenessPass ? 'LIVE MOTION VERIFIED' : `${t.livenessPct.toFixed(1)}% MOTION`}
            </span>
          </div>
          <div className="face-telemetry-row">
            <span className="face-telemetry-label">1:1 MATCH %</span>
            <span className={`face-telemetry-value ${enrollFirstTime ? 'text-info' : t.ready ? 'text-success' : t.matchPct != null ? 'text-danger' : 'text-warning'}`}>
              {enrollFirstTime
                ? 'ENROLLMENT CAPTURE'
                : t.matchPct == null
                  ? 'AWAITING FACE'
                  : `${t.matchPct.toFixed(1)}%`}
            </span>
          </div>
        </div>

        {enrollFirstTime && !showSideBySide && (
          <button
            className="btn-secondary face-enroll-link"
            onClick={onClose}
            title="Enroll Face ID before verifying"
          >
            No enrollment found — complete Face ID enrollment first
          </button>
        )}

        <div className="face-modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleCapture}
            disabled={!t.ready || capturing || Boolean(cameraError)}
            title={t.ready ? 'Capture verified face photo' : 'Complete all gates: brightness, face lock, liveness, match'}
          >
            <ShieldCheck size={14} />
            <span>{enrollFirstTime ? 'Enroll & Capture' : t.ready ? 'Capture & Verify' : 'Hold Steady…'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
