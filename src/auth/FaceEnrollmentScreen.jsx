// src/auth/FaceEnrollmentScreen.jsx
// Stage 3 of the 5-stage auth lifecycle: mandatory biometric enrollment.
// Captures the employee's official MR. ELECTRICAL WORKS Reference ID Photo
// plus a 128-D neural face descriptor (neural engine with geometric
// fallback), then enrolls it via POST /api/auth/enroll-face.
// Hallmark Vantage: #121417 dark readout chassis, copper #B35010 corner
// brackets, breaker-blue #0E639C telemetry, JetBrains Mono readout.
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
import { useAuth } from './AuthContext.jsx';
import { api } from '../api/client.js';
import { ScanFace, ShieldCheck, CameraOff, IdCard, RefreshCw } from 'lucide-react';

const LOOP_INTERVAL_MS = 400;
const LIVENESS_STREAK_REQUIRED = 2;

export default function FaceEnrollmentScreen() {
  const { user, refreshUser } = useAuth();
  const userId = user?.id;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const prevFrameRef = useRef(null);
  const livenessStreakRef = useRef(0);
  const descriptorRef = useRef(null);
  const busyRef = useRef(false);

  const [cameraError, setCameraError] = useState(null);
  const [engineStatus, setEngineStatus] = useState(() => getEngineStatus());
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [telemetry, setTelemetry] = useState({
    brightness: 0,
    sharpness: 0,
    faceLock: false,
    faceLockReason: 'INITIALIZING',
    livenessPct: 0,
    livenessPass: false,
    matchPct: null,
    descriptorReady: false,
    ready: false,
  });

  // Stage 1: load neural models (never throws — falls back gracefully)
  useEffect(() => {
    let mounted = true;
    initFaceModels().then((state) => {
      if (mounted) setEngineStatus({ ...state, error: getEngineStatus().error });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Camera + analysis loop
  useEffect(() => {
    let cancelled = false;

    const teardown = () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

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
          const play = videoRef.current.play();
          if (play && typeof play.catch === 'function') {
            play.catch(() => { /* muted autoplay allowed */ });
          }
        }
      } catch (err) {
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access to enroll your Face ID.'
            : `Camera unavailable: ${err?.message || 'no video device found'}`
        );
        return;
      }

      loopRef.current = setInterval(async () => {
        if (busyRef.current) return; // no overlapping heavy detections
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);
        const imageData = ctx.getImageData(0, 0, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);

        // Gate 1: illumination & sharpness
        const quality = analyzeImageQuality(imageData);

        // Gate 2: 3-frame micro-motion liveness (blocks printed photo spoofing)
        let liveness = { passed: false, motionPct: 0, reason: 'WAITING' };
        if (quality.passed && prevFrameRef.current) {
          liveness = computeLivenessFrameDelta(prevFrameRef.current, imageData);
        }
        prevFrameRef.current = imageData;
        livenessStreakRef.current = liveness.passed
          ? Math.min(livenessStreakRef.current + 1, 6)
          : 0;

        // Gate 3+4: single face + descriptor extraction (neural or fallback)
        let face = { detected: false, descriptor: null, reason: quality.passed ? 'SCANNING' : quality.reason };
        if (quality.passed) {
          busyRef.current = true;
          try {
            const result = await detectAndExtractDescriptor(canvas, ctx);
            face = result;
          } catch {
            face = { detected: false, reason: 'Detection error — retry' };
          } finally {
            busyRef.current = false;
          }
          if (face.detected && face.descriptor) {
            descriptorRef.current = face.descriptor;
          }
        }

        const livenessPass = quality.passed && livenessStreakRef.current >= LIVENESS_STREAK_REQUIRED;
        const descriptorReady = Boolean(descriptorRef.current);
        const descriptorLen = descriptorRef.current?.length || 0;
        const ready = quality.passed && face.detected && livenessPass && descriptorReady;

        setTelemetry({
          brightness: quality.meanBrightness,
          sharpness: quality.sharpnessScore,
          faceLock: face.detected,
          faceLockReason: face.reason || (face.detected ? 'FACE LOCKED' : 'SCANNING'),
          livenessPct: liveness.motionPct,
          livenessPass,
          matchPct: descriptorReady && descriptorLen === 128 ? 100 : captureFallbackPct(descriptorLen),
          descriptorReady,
          ready,
        });
      }, LOOP_INTERVAL_MS);
    };

    start();
    return () => {
      cancelled = true;
      teardown();
    };
  }, []);

  const handleEnroll = useCallback(async () => {
    const canvas = canvasRef.current;
    const descriptor = descriptorRef.current;
    if (!canvas || !descriptor || enrolling) return;

    setEnrolling(true);
    setEnrollError('');
    try {
      const timestampIso = new Date().toISOString();
      let dataUrl = canvas.toDataURL('image/webp', 0.6);
      if (!dataUrl.startsWith('data:image/webp;')) {
        // Safari / WebView without WebP encoder — deterministic JPEG fallback
        dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      }

      // Verify the captured frame round-trips against itself (1:1 sanity)
      const sanity = matchDescriptors(descriptor, descriptor);
      if (!sanity?.pass) {
        throw new Error('Descriptor self-check failed — recapture in better lighting.');
      }

      const selfieSha256 = await computeSelfieSHA256(dataUrl, `enroll|${userId || ''}`, timestampIso);
      if (!selfieSha256) throw new Error('Photo digest computation failed.');

      setCapturedPreview(dataUrl);
      await api.enrollFace({
        referencePhoto: dataUrl,
        faceDescriptor: Array.from(descriptor),
        fallbackSignature: descriptor.length === 64 ? Array.from(descriptor) : null,
      });

      await refreshUser(); // advances the auth lifecycle past Stage 3
    } catch (err) {
      setEnrollError(err?.message || 'Face enrollment failed. Please try again.');
      setCapturedPreview(null);
      setEnrolling(false);
    }
  }, [enrolling, refreshUser, userId]);

  const t = telemetry;
  const neuralReady = engineStatus.status === 'ready';

  return (
    <div className="face-enroll-screen">
      <div className="face-enroll-shell fade-in">
        {/* Enrollment header — identity card preview */}
        <div className="face-enroll-header">
          <div className="face-enroll-title">
            <IdCard size={18} className="text-accent" />
            <div>
              <h1>Face ID Enrollment — Reference ID Photo</h1>
              <p>
                Capture your official MR. ELECTRICAL WORKS reference photo. Every future attendance
                punch and access check is verified 1:1 against this enrollment.
              </p>
            </div>
          </div>
          <div className="face-enroll-idcard">
            <div className="face-enroll-idcard-name">{user?.name || 'Employee'}</div>
            <div className="face-enroll-idcard-row font-mono">ID {user?.id || '--'}</div>
            <div className="face-enroll-idcard-row">{user?.department || 'Field'}</div>
            <div className="face-enroll-idcard-row font-mono">{user?.email}</div>
          </div>
        </div>

        <div className="face-enroll-grid">
          {/* Dark readout chassis viewfinder */}
          <div className="face-modal">
            <div className="face-modal-header">
              <div className="face-modal-title">
                <ScanFace size={16} />
                <span>Reference Capture — {neuralReady ? 'NEURAL 128-D ENGINE' : 'GEOMETRIC FALLBACK ENGINE'}</span>
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

            <div className="face-viewfinder">
              <span className="face-bracket face-bracket--tl" />
              <span className="face-bracket face-bracket--tr" />
              <span className="face-bracket face-bracket--bl" />
              <span className="face-bracket face-bracket--br" />
              <span className={`face-lock-indicator ${t.faceLock ? 'face-lock-indicator--locked' : ''}`} />

              <video ref={videoRef} className="face-video" playsInline muted autoPlay />
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

            <div className="face-telemetry font-mono">
              <div className="face-telemetry-row">
                <span className="face-telemetry-label">LIGHTING</span>
                <span className={`face-telemetry-value ${t.brightness >= 40 && t.brightness <= 230 ? 'text-success' : 'text-warning'}`}>
                  {t.brightness} · {t.sharpness.toFixed(1)}
                </span>
              </div>
              <div className="face-telemetry-row">
                <span className="face-telemetry-label">SINGLE FACE</span>
                <span className={`face-telemetry-value ${t.faceLock ? 'text-success' : 'text-warning'}`}>
                  {t.faceLock ? 'LOCKED · 1 FACE' : t.faceLockReason.toUpperCase()}
                </span>
              </div>
              <div className="face-telemetry-row">
                <span className="face-telemetry-label">LIVENESS</span>
                <span className={`face-telemetry-value ${t.livenessPass ? 'text-success' : 'text-warning'}`}>
                  {t.livenessPass ? 'LIVE MOTION VERIFIED' : `${t.livenessPct.toFixed(1)}% MOTION`}
                </span>
              </div>
              <div className="face-telemetry-row">
                <span className="face-telemetry-label">128-D VECTOR</span>
                <span className={`face-telemetry-value ${t.descriptorReady ? 'text-success' : 'text-info'}`}>
                  {t.descriptorReady ? 'READY' : 'EXTRACTING…'}
                </span>
              </div>
            </div>

            {enrollError && !enrolling && !capturedPreview && (
              <div className="face-camera-error" role="alert">
                <CameraOff size={14} />
                <span>{enrollError}</span>
              </div>
            )}

            <div className="face-modal-actions">
              <button
                className="btn-primary"
                onClick={handleEnroll}
                disabled={!t.ready || enrolling || Boolean(cameraError)}
                title={t.ready ? 'Capture and enroll your reference photo' : 'Complete all gates: lighting, face lock, liveness, vector'}
              >
                <ShieldCheck size={14} />
                <span>{enrolling ? 'Enrolling…' : capturedPreview ? 'Enrolled' : 'Capture & Enroll Face ID'}</span>
              </button>
            </div>
          </div>

          {/* Preview card — mirrors the side-by-side verification panel */}
          <aside className="face-enroll-aside">
            <div className="face-modal">
              <div className="face-modal-header">
                <div className="face-modal-title">
                  <ShieldCheck size={16} />
                  <span>Enrollment Preview</span>
                </div>
              </div>
              <div className="face-reference-panel face-reference-panel--preview">
                {capturedPreview ? (
                  <img src={capturedPreview} alt="Captured reference photo preview" />
                ) : (
                  <div className="face-reference-empty font-mono">AWAITING CAPTURE</div>
                )}
              </div>
              <div className="face-telemetry font-mono">
                <div className="face-telemetry-row">
                  <span className="face-telemetry-label">EMPLOYEE</span>
                  <span className="face-telemetry-value">{user?.name || '--'}</span>
                </div>
                <div className="face-telemetry-row">
                  <span className="face-telemetry-label">DEPARTMENT</span>
                  <span className="face-telemetry-value">{user?.department || 'Field'}</span>
                </div>
                <div className="face-telemetry-row">
                  <span className="face-telemetry-label">STATUS</span>
                  <span className={`face-telemetry-value ${capturedPreview ? 'text-success' : 'text-warning'}`}>
                    {capturedPreview ? 'ENROLLED · PENDING SYNC' : t.ready ? 'READY TO CAPTURE' : 'GATES IN PROGRESS'}
                  </span>
                </div>
              </div>
              <p className="face-enroll-note">
                After enrollment completes, your attendance check-in opens a side-by-side 1:1
                comparison against this reference photo. A different face is rejected with an
                identity-mismatch fault and logged in the audit ledger.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Approximate readable percentage for the legacy 64-D fallback vector. */
function captureFallbackPct(length) {
  if (!length) return null;
  if (length === 128) return 100;
  return Math.round((length / 64) * 100);
}
