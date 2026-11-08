// backend/utils/validationEngine.js
// Layer 3: Zoho People-style validation rules engine.
// Deterministic 5-gate pipeline applied before any punch is accepted:
//   Gate 1 — Duplicate punch cooldown (120s)
//   Gate 2 — Strict shift state machine sequence
//   Gate 3 — Multi-site geofence (Haversine)
//   Gate 4 — IST shift margin, grace period & round-off
//   Gate 5 — Full-day / half-day / deviation / overtime rollup
import { POLICY, getZonedDateTime, timeToMinutes } from '../config/policy.js';

export const STANDARD_SHIFT_MINUTES = 480; // 8.0 hours
export const FULL_DAY_ROUND_OFF_MINUTES = 470; // 10-min total round-off buffer
export const MAX_DAILY_OT_MINUTES = 240; // 4h OT cap

/**
 * Haversine distance in meters between two GPS coordinates.
 * Returns null when any coordinate is missing/non-numeric.
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || Number.isNaN(lat1) ||
    typeof lon1 !== 'number' || Number.isNaN(lon1) ||
    typeof lat2 !== 'number' || Number.isNaN(lat2) ||
    typeof lon2 !== 'number' || Number.isNaN(lon2)
  ) {
    return null;
  }
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, a))), Math.sqrt(Math.min(1, Math.max(0, 1 - a))));
  return Math.round(R * c);
}

/**
 * Gate 4 — Evaluates IST (Asia/Kolkata) shift arrival classification:
 *   06:00–09:00 IST -> ON_TIME
 *   09:00–09:15 IST -> GRACE_BUFFER (15-min Zoho grace rule)
 *   > 09:15 IST     -> LATE_ARRIVAL
 * Returns { dateIST, minutesOfDay, arrivalStatus }.
 */
export function classifyISTArrival(timestampMs = Date.now()) {
  const at = timestampMs instanceof Date ? timestampMs.getTime() : Number(timestampMs) || Date.now();
  const zoned = getZonedDateTime(new Date(at), POLICY.TIMEZONE);
  const minutesOfDay = zoned.totalMinutes;
  const onTimeLimit = timeToMinutes(POLICY.CHECK_IN_END); // 540
  const graceLimit = onTimeLimit + POLICY.CHECK_IN_GRACE_MINUTES; // 555

  let arrivalStatus = 'ON_TIME';
  if (minutesOfDay > onTimeLimit && minutesOfDay <= graceLimit) {
    arrivalStatus = 'GRACE_BUFFER';
  } else if (minutesOfDay > graceLimit) {
    arrivalStatus = 'LATE_ARRIVAL';
  }

  return { dateIST: zoned.dateString, minutesOfDay, arrivalStatus };
}

/**
 * Gates 1+2 — Validates duplicate punch cooldown & strict sequence transition.
 * existingRecordsToday: rows with `record_type` and `recorded_at` (or `timestamp`).
 */
export function validatePunchSequence(existingRecordsToday = [], nextType, nowMs = Date.now()) {
  const tsOf = (r) => new Date(r.recorded_at || r.timestamp).getTime();
  const sorted = [...existingRecordsToday].sort((a, b) => tsOf(a) - tsOf(b));
  const lastRecord = sorted[sorted.length - 1];

  // Gate 1: duplicate punch cooldown (identical type within 120s)
  const lastSameType = [...sorted].reverse().find((r) => r.record_type === nextType);
  if (lastSameType) {
    const elapsedSeconds = (nowMs - tsOf(lastSameType)) / 1000;
    if (elapsedSeconds >= 0 && elapsedSeconds < 120) {
      return {
        valid: false,
        code: 'DUPLICATE_PUNCH_COOLDOWN',
        message: `Duplicate ${nextType} punch blocked — please wait ${Math.ceil(120 - elapsedSeconds)}s (2-minute cooldown).`,
      };
    }
  }

  if (lastRecord) {
    const elapsedSeconds = (nowMs - tsOf(lastRecord)) / 1000;
    if (lastRecord.record_type === nextType && elapsedSeconds < 120) {
      return {
        valid: false,
        code: 'DUPLICATE_PUNCH_COOLDOWN',
        message: `Duplicate ${nextType} blocked. Please wait ${Math.ceil(120 - elapsedSeconds)}s.`,
      };
    }
  }

  const hasCheckIn = sorted.some((r) => r.record_type === 'check_in');
  const hasCheckOut = sorted.some((r) => r.record_type === 'check_out');
  const lastBreakStart = [...sorted].reverse().find((r) => r.record_type === 'break_start');
  const lastBreakEnd = [...sorted].reverse().find((r) => r.record_type === 'break_end');
  const isOnBreak =
    lastBreakStart &&
    (!lastBreakEnd || tsOf(lastBreakStart) > tsOf(lastBreakEnd));

  if (nextType === 'check_in' && hasCheckIn && !hasCheckOut) {
    return { valid: false, code: 'ALREADY_CHECKED_IN', message: 'Already checked in for today.' };
  }
  if ((nextType === 'break_start' || nextType === 'check_out' || nextType === 'ot_start') && !hasCheckIn) {
    return { valid: false, code: 'MISSING_CHECK_IN', message: 'Check in first before logging break, check-out or overtime.' };
  }
  if (nextType === 'break_start' && isOnBreak) {
    return { valid: false, code: 'ALREADY_ON_BREAK', message: 'Break is already active.' };
  }
  if (nextType === 'break_end' && !isOnBreak) {
    return { valid: false, code: 'NO_ACTIVE_BREAK', message: 'No active break to end.' };
  }
  if (nextType === 'ot_start' && isOnBreak) {
    return { valid: false, code: 'BREAK_OPEN', message: 'End the active break before starting overtime.' };
  }

  // Auto-close signal: checkout with an open break must close it at the same instant
  return { valid: true, autoCloseBreak: nextType === 'check_out' && isOnBreak };
}

/**
 * Gate 5 — Computes the Zoho People daily rollup:
 *   gross / break / permission / effective / deficit / overtime minutes,
 *   day_status and payable_days.
 * records: attendance rows for one day (record_type + recorded_at).
 * workflows: approved workflow_requests rows for the same user/date.
 */
export function computeDailyAttendanceSummary(records = [], workflows = []) {
  const tsOf = (r) => new Date(r.recorded_at || r.timestamp).getTime();
  const sorted = [...records].sort((a, b) => tsOf(a) - tsOf(b));

  const firstCheckInRec = sorted.find((r) => r.record_type === 'check_in');
  const lastCheckOutRec = [...sorted].reverse().find((r) => r.record_type === 'check_out');

  let grossMinutes = 0;
  if (firstCheckInRec && lastCheckOutRec) {
    grossMinutes = Math.max(0, Math.round((tsOf(lastCheckOutRec) - tsOf(firstCheckInRec)) / 60000));
  }

  // Sum break intervals (never double-count an open break after checkout auto-close)
  let breakMinutes = 0;
  let openBreakStart = null;
  for (const r of sorted) {
    if (r.record_type === 'break_start') {
      openBreakStart = tsOf(r);
    } else if (r.record_type === 'break_end' && openBreakStart) {
      breakMinutes += Math.max(0, Math.round((tsOf(r) - openBreakStart) / 60000));
      openBreakStart = null;
    }
  }

  // Sum overtime intervals (capped at max daily OT)
  let overtimeMinutes = 0;
  let openOtStart = null;
  for (const r of sorted) {
    if (r.record_type === 'ot_start') {
      openOtStart = tsOf(r);
    } else if (r.record_type === 'ot_end' && openOtStart) {
      overtimeMinutes += Math.max(0, Math.round((tsOf(r) - openOtStart) / 60000));
      openOtStart = null;
    }
  }
  overtimeMinutes = Math.min(overtimeMinutes, MAX_DAILY_OT_MINUTES);

  const approved = (workflows || []).filter((w) => w.status === 'APPROVED' || w.status === 'approved');
  const hasApprovedOD = approved.some((w) => w.request_type === 'ON_DUTY');
  const hasApprovedReg = approved.some((w) => w.request_type === 'REGULARIZATION');
  const permissionMinutes = approved
    .filter((w) => w.request_type === 'PERMISSION')
    .reduce((sum, w) => sum + Math.min(Number(w.permission_minutes || 0) || 0, 120), 0);

  const effectiveMinutes = Math.max(0, grossMinutes - breakMinutes + permissionMinutes);
  const deviationDeficitMinutes = hasApprovedOD || hasApprovedReg
    ? 0
    : Math.max(0, STANDARD_SHIFT_MINUTES - effectiveMinutes);

  let dayStatus = 'ABSENT';
  let payableDays = 0.0;

  if (hasApprovedOD) {
    dayStatus = 'ON_DUTY';
    payableDays = 1.0;
  } else if (hasApprovedReg) {
    dayStatus = 'REGULARIZED';
    payableDays = 1.0;
  } else if (effectiveMinutes >= FULL_DAY_ROUND_OFF_MINUTES) {
    dayStatus = 'FULL_DAY';
    payableDays = 1.0;
  } else if (effectiveMinutes >= 240) {
    dayStatus = 'HALF_DAY';
    payableDays = 0.5;
  } else if (firstCheckInRec && !lastCheckOutRec) {
    dayStatus = 'ACTIVE_SHIFT';
    payableDays = 0.5;
  } else if (effectiveMinutes > 0) {
    dayStatus = 'SHORTFALL';
    payableDays = 0.0;
  }

  const arrivalStatus = firstCheckInRec
    ? classifyISTArrival(tsOf(firstCheckInRec)).arrivalStatus
    : null;

  return {
    firstCheckIn: firstCheckInRec ? new Date(tsOf(firstCheckInRec)).toISOString() : null,
    lastCheckOut: lastCheckOutRec ? new Date(tsOf(lastCheckOutRec)).toISOString() : null,
    grossMinutes,
    breakMinutes,
    permissionMinutes,
    effectiveMinutes,
    deviationDeficitMinutes,
    overtimeMinutes,
    arrivalStatus,
    dayStatus,
    payableDays,
    siteCode: firstCheckInRec?.site_code || firstCheckInRec?.site_ref || 'MREW-HQ-HYD',
  };
}

/**
 * Maps low-level arrival status to human label (used in responses).
 */
export function arrivalStatusLabel(arrivalStatus) {
  switch (arrivalStatus) {
    case 'ON_TIME':
      return 'On Time';
    case 'GRACE_BUFFER':
      return 'Grace Window (09:00–09:15)';
    case 'LATE_ARRIVAL':
      return 'Late Arrival';
    default:
      return 'Not Recorded';
  }
}

export default {
  calculateDistanceMeters,
  classifyISTArrival,
  validatePunchSequence,
  computeDailyAttendanceSummary,
  arrivalStatusLabel,
  STANDARD_SHIFT_MINUTES,
  MAX_DAILY_OT_MINUTES,
};
