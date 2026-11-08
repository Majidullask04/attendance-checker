// backend/utils/audit.js
// Immutable audit-trail writer for security-relevant events
// (biometric enrollment, verification, resets, face-mismatch blocks).

import { randomUUID } from 'crypto';
import db from '../db.js';

/**
 * Writes one row to audit_logs. Never throws — audit logging is best-effort
 * so a logging failure can never break a live verification flow.
 *
 * @param {object} params
 * @param {string|null} params.actorEmail  Acting user's email
 * @param {string} params.action           e.g. ENROLL_FACE_ID, FACE_MISMATCH_BLOCKED
 * @param {string|null} [params.entityType]
 * @param {string|null} [params.entityId]
 * @param {string|null} [params.details]   Human-readable one-line summary
 */
export async function writeAudit({ actorEmail, action, entityType = null, entityId = null, details = null } = {}) {
  if (!action) return;
  try {
    await db.runAsync(
      `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), actorEmail || null, action, entityType, entityId, details]
    );
  } catch (err) {
    console.warn('audit log write failed:', err.message);
  }
}

/** Normalizes a user row into the safe face-status fields sent to clients. */
export function buildFaceStatus(userRow) {
  if (!userRow) {
    return { faceEnrolled: false, faceEnrolledAt: null, hasReferencePhoto: false };
  }
  const hasDescriptor = Boolean(userRow.face_descriptor || userRow.face_signature);
  return {
    faceEnrolled: userRow.face_enrolled === 1 || userRow.face_enrolled === true || (hasDescriptor && userRow.face_enrolled !== 0),
    faceEnrolledAt: userRow.face_enrolled_at || null,
    hasReferencePhoto: Boolean(userRow.reference_photo),
  };
}
