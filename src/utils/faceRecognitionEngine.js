// src/utils/faceRecognitionEngine.js
// Accurate 128-D neural 1:1 face recognition engine (@vladmandic/face-api).
//
// Primary path: TinyFaceDetector + 68-pt landmark net + ResNet-34 face
// recognition net producing a 128-float embedding, loaded from the jsDelivr
// CDN at runtime (no build-time dependency, ~zero startup cost until used).
// Fallback path: the zero-dependency geometric engine in
// faceDetectionEngine.js (64-D signature) so the app keeps working offline
// or when the CDN/WebView blocks the neural runtime.
import {
  detectSingleFace,
  extractFaceSignature,
  FACE_CAPTURE_WIDTH,
  FACE_CAPTURE_HEIGHT,
} from './faceDetectionEngine.js';

export const FACE_DESCRIPTOR_LENGTH = 128;
export const LEGACY_FACE_SIGNATURE_LENGTH = 64;
export const FACE_EUCLIDEAN_MATCH_THRESHOLD = 0.45;

const FACE_API_VERSION = '1.7.15';
const FACE_API_BASE = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}`;

const engineState = {
  status: 'idle', // idle | loading | ready | unavailable
  mode: 'GEOMETRIC_FALLBACK', // NEURAL_128D | GEOMETRIC_FALLBACK
  faceapi: null,
  error: null,
};

let initPromise = null;

export function getEngineStatus() {
  return engineState;
}

/** Human-readable engine mode tag for telemetry readouts. */
export function getEngineMode() {
  return engineState.status === 'ready' && engineState.mode === 'NEURAL_128D'
    ? 'NEURAL_128D'
    : 'GEOMETRIC_FALLBACK';
}

// ── Model initialization ────────────────────────────────────────────────────

/**
 * Loads the neural runtime once and caches it:
 *   tinyFaceDetector + faceLandmark68TinyNet + faceRecognitionNet (128-D).
 * Resolves with { status, mode } without throwing; call sites fall back to
 * the geometric engine on 'unavailable'.
 */
export function initFaceModels() {
  if (initPromise) return initPromise;
  if (engineState.status === 'ready') {
    return Promise.resolve({ status: 'ready', mode: engineState.mode });
  }
  if (engineState.status === 'unavailable') {
    return Promise.resolve({ status: 'unavailable', mode: engineState.mode });
  }

  engineState.status = 'loading';
  initPromise = (async () => {
    try {
      const mod = await import(
        /* @vite-ignore */ `${FACE_API_BASE}/dist/face-api.esm.js`
      );
      const faceapi = mod.default || mod;

      await faceapi.nets.tinyFaceDetector.loadFromUri(`${FACE_API_BASE}/model`);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(`${FACE_API_BASE}/model`);
      await faceapi.nets.faceRecognitionNet.loadFromUri(`${FACE_API_BASE}/model`);

      engineState.faceapi = faceapi;
      engineState.status = 'ready';
      engineState.mode = 'NEURAL_128D';
      engineState.error = null;
      return { status: 'ready', mode: engineState.mode };
    } catch (err) {
      engineState.status = 'unavailable';
      engineState.mode = 'GEOMETRIC_FALLBACK';
      engineState.error = err?.message || String(err);
      return { status: 'unavailable', mode: engineState.mode };
    }
  })();

  return initPromise;
}

// ── Detection & descriptor extraction ───────────────────────────────────────

/**
 * Detects exactly one face on the analysis canvas and extracts a descriptor.
 * Uses the neural 128-D pipeline when the models are ready; otherwise falls
 * back to the geometric YCbCr/reticle detector (64-D).
 * Returns { detected, descriptor, box, method, reason, faceCount }.
 */
export async function detectAndExtractDescriptor(canvas, ctx) {
  if (!canvas) return { detected: false, faceCount: null, reason: 'NO_FRAME' };

  const useNeural =
    engineState.status === 'ready' && engineState.faceapi && engineState.mode === 'NEURAL_128D';

  if (useNeural) {
    try {
      const options = new engineState.faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.4,
      });
      const result = await engineState.faceapi
        .detectSingleFace(canvas, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      const descriptor = result?.descriptor;
      if (!result || !descriptor) {
        return { detected: false, faceCount: 0, reason: 'POSITION FACE INSIDE RETICLE', method: 'NEURAL_128D' };
      }
      const box = result.detection?.box;
      const frameArea = FACE_CAPTURE_WIDTH * FACE_CAPTURE_HEIGHT;
      const areaRatio = box ? (box.width * box.height) / frameArea : 0;
      if (areaRatio < 0.08) {
        return { detected: false, faceCount: 1, reason: 'MOVE CLOSER TO CAMERA', method: 'NEURAL_128D' };
      }
      return {
        detected: true,
        faceCount: 1,
        descriptor,
        box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
        method: 'NEURAL_128D',
        reason: 'FACE LOCKED · LANDMARKS OK',
      };
    } catch (err) {
      // Neural detection hiccup — degrade to the geometric fallback for this frame
      engineState.error = err?.message || String(err);
      // fall through
    }
  }

  // Geometric fallback: single-face detection + 64-D signature extraction
  const face = await detectSingleFace(canvas, ctx, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);
  if (!face?.detected) {
    return {
      detected: false,
      faceCount: face?.faceCount ?? null,
      reason: face?.reason || 'POSITION FACE INSIDE RETICLE',
      method: 'GEOMETRIC_FALLBACK',
    };
  }
  const signature = extractFaceSignature(ctx, face.box, FACE_CAPTURE_WIDTH, FACE_CAPTURE_HEIGHT);
  if (!signature) {
    return { detected: false, faceCount: 1, reason: 'SIGNATURE EXTRACTION FAILED', method: 'GEOMETRIC_FALLBACK' };
  }
  return {
    detected: true,
    faceCount: 1,
    descriptor: signature,
    box: face.box || null,
    method: 'GEOMETRIC_FALLBACK',
    reason: 'FACE LOCKED · CANVAS RETICLE',
  };
}

// ── 1:1 matchers ────────────────────────────────────────────────────────────

function euclideanDistance(vecA, vecB) {
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    const delta = vecA[i] - vecB[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1;
  return Math.max(0, Math.min(1, dot / denom));
}

function toPlainVector(descriptor) {
  if (!descriptor) return null;
  if (Array.isArray(descriptor)) return descriptor;
  if (typeof descriptor.length === 'number') return Array.from(descriptor);
  return null;
}

/**
 * 1:1 identity comparison between an enrolled descriptor and a live one.
 * Returns { pass, matchScore (0–1), matchPct (0–100), distance, method } or
 * null when either vector is unusable.
 */
export function matchDescriptors(enrolledDescriptor, liveDescriptor) {
  const enrolled = toPlainVector(enrolledDescriptor);
  const live = toPlainVector(liveDescriptor);
  if (
    !Array.isArray(enrolled) || !Array.isArray(live) ||
    enrolled.length !== live.length ||
    enrolled.length === 0 ||
    !enrolled.every((v) => typeof v === 'number' && Number.isFinite(v)) ||
    !live.every((v) => typeof v === 'number' && Number.isFinite(v))
  ) {
    return null;
  }

  if (enrolled.length === FACE_DESCRIPTOR_LENGTH) {
    const distance = euclideanDistance(enrolled, live);
    const matchScore = Math.max(0, Math.min(1, 1 - distance / (2 * Math.SQRT2 || 1)));
    return {
      pass: matchScore > 0.75 && distance <= FACE_EUCLIDEAN_MATCH_THRESHOLD,
      matchScore,
      matchPct: Math.round(Math.max(0, Math.min(100, matchScore * 100))),
      matchPctDistance: Math.round(Math.max(0, Math.min(100, (1 - distance / 0.9) * 100))),
      distance,
      method: 'EUCLIDEAN_128D',
    };
  }

  // Legacy 64-D geometric signature: cosine similarity
  const similarity = cosineSimilarity(enrolled, live);
  return {
    pass: similarity >= 0.5,
    matchScore: similarity,
    matchPct: Math.round(similarity * 100),
    matchPctDistance: null,
    distance: null,
    method: 'COSINE_64D',
  };
}

export default {
  initFaceModels,
  detectAndExtractDescriptor,
  matchDescriptors,
  getEngineStatus,
  getEngineMode,
  FACE_DESCRIPTOR_LENGTH,
  LEGACY_FACE_SIGNATURE_LENGTH,
  FACE_EUCLIDEAN_MATCH_THRESHOLD,
};
