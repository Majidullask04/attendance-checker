// src/utils/attendancePolicy.js
// Client-side mirror of the Layer 3 validation & policy engine
// (Zoho People-style IST windows, geofence math and day classification).

export const STANDARD_SHIFT_MINUTES = 480; // 8.0 hours
export const FULL_DAY_ROUND_OFF_MINUTES = 470; // 10-min round-off buffer
export const MAX_DAILY_OT_MINUTES = 240; // 4h OT cap
export const DUPLICATE_PUNCH_COOLDOWN_SECONDS = 120;

/**
 * Haversine distance in meters between two GPS coordinates (null-safe).
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

export const WORK_MODE_META = {
  hq: { label: 'HQ Workshop', code: 'HQ_WORKSHOP' },
  site: { label: 'EPC Project Site', code: 'EPC_PROJECT_SITE' },
  onduty: { label: 'On-Duty Visit', code: 'ON_DUTY_VISIT' },
};

/**
 * Vantage-colored day-status codes used by the monthly muster roll matrix.
 */
export const MUSTER_DAY_CODES = {
  P: { label: 'Present (Full Day)', color: '#156E3F' },
  HD: { label: 'Half Day', color: '#9A5B13' },
  OD: { label: 'On-Duty', color: '#0E639C' },
  REG: { label: 'Regularized', color: '#6A5ACD' },
  OT: { label: 'Overtime', color: '#B35010' },
  A: { label: 'Absent / LOP', color: '#A82810' },
  WO: { label: 'Week Off', color: '#8B9097' },
};

export default {
  calculateDistanceMeters,
  WORK_MODE_META,
  MUSTER_DAY_CODES,
  STANDARD_SHIFT_MINUTES,
  MAX_DAILY_OT_MINUTES,
  DUPLICATE_PUNCH_COOLDOWN_SECONDS,
};
