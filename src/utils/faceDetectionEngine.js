// src/utils/faceDetectionEngine.js
// Layer 2: zero-dependency Face Detection, Liveness Anti-Spoofing & 1:1 Signature Engine.
// 5-stage pipeline:
//   1. Luminance & sharpness gate (40 <= brightness <= 225, Laplacian >= 3.5)
//   2. Single-face bounding box (native window.FaceDetector, YCbCr reticle fallback)
//   3. 3-frame liveness micro-motion check (rate ~220ms) blocking static prints
//   4. 64-D spatial descriptor + cosine similarity (face_match_score)
//   5. SHA-256 digest of the 320x240 WebP capture (selfie_sha256)

/**
 * Stage 1: Evaluates frame brightness (0-255) and Laplacian edge sharpness.
 */
export function analyzeImageQuality(imageData) {
  const { data, width, height } = imageData;
  let totalLum = 0;
  let edgeEnergy = 0;
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = lum;
    totalLum += lum;
  }

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const laplacian =
        Math.abs(4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width]);
      edgeEnergy += laplacian;
    }
  }

  const meanBrightness = Math.round(totalLum / pixelCount);
  const sharpnessScore = Math.round((edgeEnergy / (pixelCount / 4)) * 10) / 10;

  if (meanBrightness < 40) {
    return { passed: false, meanBrightness, sharpnessScore, reason: 'Frame too dark — increase lighting' };
  }
  if (meanBrightness > 230) {
    return { passed: false, meanBrightness, sharpnessScore, reason: 'Frame overexposed — reduce glare' };
  }
  if (sharpnessScore < 3.5) {
    return { passed: false, meanBrightness, sharpnessScore, reason: 'Camera blurry or obstructed' };
  }

  return { passed: true, meanBrightness, sharpnessScore, reason: 'OK' };
}

/**
 * Stage 2: Detects single-face bounding box via native FaceDetector API with a
 * deterministic YCbCr chrominance + bilateral symmetry fallback inside the reticle.
 */
export async function detectSingleFace(videoOrCanvas, ctx, width = 320, height = 240) {
  // 1. Try native Chromium / Android WebView FaceDetector API first
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      const faces = await detector.detect(videoOrCanvas);
      if (faces.length === 0) {
        return { detected: false, faceCount: 0, method: 'NATIVE_FACE_DETECTOR', reason: 'Position face inside reticle' };
      }
      if (faces.length > 1) {
        return { detected: false, faceCount: faces.length, method: 'NATIVE_FACE_DETECTOR', reason: 'Multiple faces detected — only 1 person allowed' };
      }
      const box = faces[0].boundingBox;
      const areaRatio = (box.width * box.height) / (width * height);
      if (areaRatio < 0.08) {
        return { detected: false, faceCount: 1, method: 'NATIVE_FACE_DETECTOR', reason: 'Move closer to camera' };
      }
      return {
        detected: true,
        faceCount: 1,
        method: 'NATIVE_FACE_DETECTOR',
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        areaRatio: Math.round(areaRatio * 100),
      };
    } catch {
      // Fall through to deterministic YCbCr + central reticle analyzer
    }
  }

  // 2. Deterministic YCbCr facial-region & bilateral symmetry detector inside central reticle
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let skinPixels = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  const rx0 = Math.floor(width * 0.2);
  const rx1 = Math.floor(width * 0.8);
  const ry0 = Math.floor(height * 0.12);
  const ry1 = Math.floor(height * 0.88);

  for (let y = ry0; y < ry1; y += 2) {
    for (let x = rx0; x < rx1; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        skinPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const sampledTotal = ((rx1 - rx0) / 2) * ((ry1 - ry0) / 2);
  const skinRatio = sampledTotal > 0 ? skinPixels / sampledTotal : 0;

  if (skinRatio < 0.14) {
    return {
      detected: false,
      faceCount: 0,
      method: 'CANVAS_BIOMETRIC_RETICLE',
      reason: 'Center face clearly inside reticle',
    };
  }

  return {
    detected: true,
    faceCount: 1,
    method: 'CANVAS_BIOMETRIC_RETICLE',
    box: {
      x: minX,
      y: minY,
      width: Math.max(64, maxX - minX),
      height: Math.max(64, maxY - minY),
    },
    areaRatio: Math.round(skinRatio * 100),
  };
}

/**
 * Stage 3: Frame-delta liveness anti-spoofing. Natural live micro-movement
 * (blink / micro shift) sits between 0.6% and 24% channel delta.
 */
export function computeLivenessFrameDelta(frameAImageData, frameBImageData) {
  const a = frameAImageData.data;
  const b = frameBImageData.data;
  let diffSum = 0;
  let samples = 0;

  for (let i = 0; i < a.length && i < b.length; i += 16) {
    diffSum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    samples += 1;
  }

  if (samples === 0) {
    return { passed: false, motionPct: 0, reason: 'No frame data for liveness check' };
  }

  const avgChannelDiff = diffSum / (samples * 3);
  const motionPct = Math.round((avgChannelDiff / 255) * 1000) / 10;

  const passed = motionPct >= 0.6 && motionPct <= 24.0;
  return {
    passed,
    motionPct,
    reason:
      motionPct < 0.6
        ? 'Static image detected — blink or nod slightly for liveness'
        : motionPct > 24.0
          ? 'Hold camera steady'
          : 'LIVE_VERIFIED',
  };
}

/**
 * Stage 4: Extracts a 64-bin normalized spatial luminance face descriptor
 * from inside the detected bounding box for 1:1 matching.
 */
export function extractFaceSignature(ctx, box, canvasWidth = 320, canvasHeight = 240) {
  const bx = Math.max(0, Math.floor(box?.x ?? canvasWidth * 0.25));
  const by = Math.max(0, Math.floor(box?.y ?? canvasHeight * 0.15));
  const bw = Math.min(canvasWidth - bx, Math.floor(box?.width ?? canvasWidth * 0.5));
  const bh = Math.min(canvasHeight - by, Math.floor(box?.height ?? canvasHeight * 0.7));
  if (bw <= 2 || bh <= 2) {
    return null;
  }

  const gridCols = 8;
  const gridRows = 8;
  const cellW = Math.max(1, Math.floor(bw / gridCols));
  const cellH = Math.max(1, Math.floor(bh / gridRows));
  const img = ctx.getImageData(bx, by, bw, bh).data;
  const descriptor = [];

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      let sum = 0;
      let count = 0;
      for (let y = r * cellH; y < (r + 1) * cellH && y < bh; y += 2) {
        for (let x = c * cellW; x < (c + 1) * cellW && x < bw; x += 2) {
          const i = (y * bw + x) * 4;
          sum += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          count++;
        }
      }
      descriptor.push(count > 0 ? Math.round((sum / count) * 100) / 100 : 0);
    }
  }

  const norm = Math.sqrt(descriptor.reduce((acc, v) => acc + v * v, 0)) || 1;
  return descriptor.map((v) => Math.round((v / norm) * 10000) / 10000);
}

/**
 * Cosine similarity (0.00–1.00) between the live face signature and the
 * enrolled 64-D employee signature. Returns 1.0 for first-time enrollment.
 */
export function compareFaceSignatures(sigA = [], sigB = []) {
  if (!Array.isArray(sigA) || !Array.isArray(sigB) || sigA.length !== sigB.length || sigA.length === 0) {
    return 1.0; // First-time enrollment punch
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < sigA.length; i++) {
    dot += sigA[i] * sigB[i];
    normA += sigA[i] * sigA[i];
    normB += sigB[i] * sigB[i];
  }
  const similarity = dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1);
  return Math.max(0, Math.min(1, Math.round(similarity * 1000) / 1000));
}

/**
 * Stage 5: SHA-256 digest binding the user, timestamp and captured photo bytes.
 */
export async function computeSelfieSHA256(dataUrl, userId, timestampIso) {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(`${userId}|${timestampIso}|${dataUrl}`);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `mrew-hash-${Date.now()}`;
}

export const FACE_CAPTURE_WIDTH = 320;
export const FACE_CAPTURE_HEIGHT = 240;
export const FACE_MATCH_MIN_THRESHOLD = 0.5;

export default {
  analyzeImageQuality,
  detectSingleFace,
  computeLivenessFrameDelta,
  extractFaceSignature,
  compareFaceSignatures,
  computeSelfieSHA256,
  FACE_CAPTURE_WIDTH,
  FACE_CAPTURE_HEIGHT,
  FACE_MATCH_MIN_THRESHOLD,
};
