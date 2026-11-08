// backend/utils/faceVerifyServer.js
// Server-side 1:1 biometric face verification engine.
//
// Supports two descriptor generations:
//   1. 128-D neural embeddings (@vladmandic/face-api ResNet-34) — matched via
//      Euclidean distance with a strict d <= 0.45 pass threshold.
//   2. Legacy 64-D geometric signatures (faceDetectionEngine) — matched via
//      cosine similarity (>= FACE_LEGACY_COSINE_MATCH_THRESHOLD).
//
// Every punch / verify request is checked against the employee's OWN stored
// descriptor (1:1 identity), never against other employees.

import { FACE_MATCH_MIN_THRESHOLD } from './validationEngine.js';

export const FACE_DESCRIPTOR_LENGTH = 128;
export const LEGACY_FACE_SIGNATURE_LENGTH = 64;
export const FACE_EUCLIDEAN_MATCH_THRESHOLD = 0.45;

// Server accepts WebP (preferred) or JPEG (WebView fallback) reference payloads
export const FACE_PHOTO_MIME_RE = /^data:image\/(webp|jpeg);/;
export const FACE_PHOTO_MAX_LENGTH = 150_000; // ~150KB compressed data URL
export const FACE_PHOTO_MIN_LENGTH = 1_000; // reject obviously empty captures

// ── Vector helpers ──────────────────────────────────────────────────────────

/** True when value is a finite-number array of exactly the requested length. */
export function isValidNumericVector(value, length = null) {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (length && value.length !== length) return false;
  return value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** Exact Euclidean distance d = sqrt(sum((a[i]-b[i])^2)) between two vectors. */
export function euclideanDistance(vecA, vecB) {
  if (!isValidNumericVector(vecA) || !isValidNumericVector(vecB) || vecA.length !== vecB.length) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    const delta = vecA[i] - vecB[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/** Cosine similarity (0.00–1.00) between two vectors, or null when unusable. */
export function cosineSimilarity(vecA, vecB) {
  if (!isValidNumericVector(vecA) || !isValidNumericVector(vecB) || vecA.length !== vecB.length) {
    return null;
  }
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

/** Converts a 128-D Euclidean distance to a human-readable match percentage. */
export function matchPctFromDistance(distance) {
  if (distance == null) return null;
  return Math.round(Math.max(0, Math.min(100, (1 - distance / 0.9) * 100)));
}

/** Converts a cosine similarity (0.00–1.00) to a match percentage. */
export function matchPctFromSimilarity(similarity) {
  if (similarity == null) return null;
  return Math.round(similarity * 100);
}

// ── 1:1 Matcher ─────────────────────────────────────────────────────────────

/**
 * Verifies a live descriptor against the employee's stored descriptor (1:1).
 * Returns:
 *   { valid, method, matchScore (0–1), matchPct (0–100), distance, threshold }
 * `valid` is true only when the descriptor belongs to the enrolled employee.
 * Returns `valid: false, incomplete: true` when either side is missing so
 * callers can skip (provisional enrollment flow) instead of blocking.
 */
export function verifyFaceDescriptor(storedDescriptor, liveDescriptor) {
  if (!Array.isArray(storedDescriptor) || !Array.isArray(liveDescriptor)) {
    return { valid: false, incomplete: true, reason: 'MISSING_DESCRIPTOR' };
  }
  if (storedDescriptor.length !== liveDescriptor.length) {
    return {
      valid: false,
      incomplete: true,
      reason: 'DESCRIPTOR_LENGTH_MISMATCH',
    };
  }

  if (storedDescriptor.length === FACE_DESCRIPTOR_LENGTH) {
    if (!isValidNumericVector(liveDescriptor) || !isValidNumericVector(storedDescriptor)) {
      return { valid: false, incomplete: true, reason: 'MALFORMED_VECTOR' };
    }
    const distance = euclideanDistance(storedDescriptor, liveDescriptor);
    const similarity = 1 - distance / (2 * Math.SQRT2 || 1); // normalized-space similarity estimate
    const matchPct = matchPctFromDistance(distance);
    const valid = distance <= FACE_EUCLIDEAN_MATCH_THRESHOLD;
    return {
      valid,
      method: 'EUCLIDEAN_128D',
      matchScore: Math.max(0, Math.min(1, Math.round(similarity * 1000) / 1000)),
      matchPct,
      distance: Math.round(distance * 10000) / 10000,
      threshold: FACE_EUCLIDEAN_MATCH_THRESHOLD,
    };
  }

  if (storedDescriptor.length === LEGACY_FACE_SIGNATURE_LENGTH) {
    if (!isValidNumericVector(liveDescriptor) || !isValidNumericVector(storedDescriptor)) {
      return { valid: false, incomplete: true, reason: 'MALFORMED_VECTOR' };
    }
    const similarity = cosineSimilarity(storedDescriptor, liveDescriptor);
    const matchPct = matchPctFromSimilarity(similarity);
    const valid = similarity >= FACE_MATCH_MIN_THRESHOLD;
    return {
      valid,
      method: 'COSINE_64D',
      matchScore: similarity,
      matchPct,
      distance: null,
      threshold: FACE_MATCH_MIN_THRESHOLD,
    };
  }

  return { valid: false, incomplete: true, reason: 'UNSUPPORTED_DESCRIPTOR_LENGTH' };
}

/** Safely parses a stored JSON descriptor column into a numeric array. */
export function parseStoredDescriptor(jsonText) {
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    return isValidNumericVector(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Enrollment payload validation ───────────────────────────────────────────

/**
 * Validates an enrollment payload before persistence:
 *   - referencePhoto: WebP/JPEG data URL within size bounds
 *   - descriptor:     valid numeric vector of the requested length
 * Returns { ok: true } or { ok: false, error }.
 */
export function validateFaceEnrollmentPayload({ referencePhoto, descriptor, descriptorLength = FACE_DESCRIPTOR_LENGTH } = {}) {
  if (typeof referencePhoto !== 'string' || !FACE_PHOTO_MIME_RE.test(referencePhoto)) {
    return { ok: false, error: 'referencePhoto must be a WebP/JPEG data:image URL.' };
  }
  if (
    referencePhoto.length < FACE_PHOTO_MIN_LENGTH ||
    referencePhoto.length > FACE_PHOTO_MAX_LENGTH
  ) {
    return { ok: false, error: `referencePhoto size must be between 1KB and ${Math.round(FACE_PHOTO_MAX_LENGTH / 1000)}KB.` };
  }
  if (!isValidNumericVector(descriptor, descriptorLength)) {
    return { ok: false, error: `faceDescriptor must be a numeric vector of length ${descriptorLength}.` };
  }
  return { ok: true };
}

/** Validates a verify-face request body (live descriptor + liveness flag). */
export function validateFaceVerifyPayload({ liveDescriptor } = {}) {
  if (
    !isValidNumericVector(liveDescriptor) ||
    ![FACE_DESCRIPTOR_LENGTH, LEGACY_FACE_SIGNATURE_LENGTH].includes(liveDescriptor.length)
  ) {
    return { ok: false, error: 'liveDescriptor must be a numeric vector of length 128 (or legacy 64).' };
  }
  return { ok: true };
}
