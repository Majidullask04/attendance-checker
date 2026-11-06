/**
 * backend/utils/qrSign.js
 * 30-second rotating QR payload signing (anti-screenshot / anti-replay).
 * A signed payload carries { l, t, g, exp, sig } where exp closes the current
 * 30s window and sig is an HMAC over (token, window bucket) keyed by JWT_SECRET.
 * Old screenshots fail both the signature check (wrong bucket) and the age check.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'mrelectric_secure_jwt_token_key_2026_dev';

export const QR_WINDOW_SECONDS = 30;
// Grace past window close: covers clock skew and time-in-flight while scanning.
export const QR_MAX_AGE_SECONDS = 45;

function hmac(token, bucket) {
  return createHmac('sha256', JWT_SECRET)
    .update(`qr:${token}:${bucket}`)
    .digest('hex')
    .slice(0, 32);
}

/** Signs the current window for a station token. Returns { exp, sig, windowSec }. */
export function signQRPayload(token, nowMs = Date.now()) {
  const bucket = Math.floor(nowMs / 1000 / QR_WINDOW_SECONDS);
  return {
    exp: (bucket + 1) * QR_WINDOW_SECONDS, // epoch seconds when this window closes
    sig: hmac(token, bucket),
    windowSec: QR_WINDOW_SECONDS,
  };
}

/**
 * Verifies a scanned payload's signature and freshness.
 * Returns null when valid, or a human-readable rejection reason.
 */
export function verifyQRSignedWindow({ token, exp, sig }) {
  if (exp === undefined || sig === undefined) {
    return 'QR payload is unsigned. Please scan the live station QR code on the admin screen.';
  }
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum % QR_WINDOW_SECONDS !== 0) {
    return 'QR payload has a malformed expiry window.';
  }
  if (typeof sig !== 'string' || sig.length < 16) {
    return 'QR payload signature is missing or malformed.';
  }

  const bucket = expNum / QR_WINDOW_SECONDS - 1;
  if (bucket < 0) return 'QR payload expiry window is invalid.';

  const expected = hmac(token, bucket);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return 'QR signature does not match the active station token.';
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > expNum + QR_MAX_AGE_SECONDS) {
    return 'QR code has expired. Ask the admin for the current station QR — codes rotate every 30 seconds.';
  }
  if (nowSec < expNum - QR_WINDOW_SECONDS * 2) {
    return 'QR payload is not valid yet. Regenerate the station QR code.';
  }
  return null;
}
