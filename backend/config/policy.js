/**
 * backend/config/policy.js
 * Single source of truth for shift schedule, timezone, break limits & OT.
 */

export const POLICY = {
  TIMEZONE: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  // Check-in window
  CHECK_IN_START: process.env.CHECK_IN_START || '06:00',
  CHECK_IN_END: process.env.CHECK_IN_END || '09:00', // On-time deadline; scans after this are Late

  // Break policy
  BREAK_NOTIFY: process.env.BREAK_NOTIFY || '13:50', // 1:50 PM notification
  BREAK_MINUTES_DEFAULT: 30,
  BREAK_MINUTES_MAX: 40,

  // Workday end
  WORK_END: process.env.WORK_END || '17:00', // 5:00 PM full day completion

  // Overtime starts after WORK_END
  OT_ENABLED: true,
};

/**
 * Returns components of a Date in the configured timeZone.
 * Defaults to policy timezone.
 */
export function getZonedDateTime(date = new Date(), timeZone = POLICY.TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dateString = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute,
    second,
    timeString,
    dateString,
    totalMinutes: hour * 60 + minute,
  };
}

/**
 * Computes explicit [from, to) UTC ISO bounds for a calendar day in the target time zone.
 * E.g., for "2026-09-10" in Asia/Kolkata:
 * 00:00:00 IST = 2026-09-09T18:30:00.000Z
 * next day 00:00:00 IST = 2026-09-10T18:30:00.000Z
 */
export function getDayBounds(dateInput = null, timeZone = POLICY.TIMEZONE) {
  let dateStr;
  if (!dateInput) {
    const zoned = getZonedDateTime(new Date(), timeZone);
    dateStr = zoned.dateString;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    dateStr = dateInput;
  } else {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const zoned = getZonedDateTime(d, timeZone);
    dateStr = zoned.dateString;
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');

  // Determine the exact timezone offset for target date
  const anchorDate = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  });
  const parts = fmt.formatToParts(anchorDate);
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value; // e.g. 'GMT+05:30'
  const offsetMatch = tzPart?.match(/GMT([+-])(\d{2}):(\d{2})/);

  let offsetMinutes = 330; // default IST (+5:30)
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    offsetMinutes = sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3], 10));
  }

  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60 * 1000;
  const endUtcMs = Date.UTC(year, month - 1, day + 1, 0, 0, 0) - offsetMinutes * 60 * 1000;

  return {
    dateString: dateStr,
    from: new Date(startUtcMs).toISOString(),
    to: new Date(endUtcMs).toISOString(),
    timezone: timeZone,
    offset: tzPart || 'GMT+05:30',
  };
}

/**
 * Parse HH:MM to minutes since midnight
 */
export function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return h * 60 + m;
}

/**
 * Categorize a scan event based on the current policy schedule.
 */
export function evaluateScanStatus(recordedAt = new Date(), currentType = 'check_in') {
  const zoned = getZonedDateTime(recordedAt, POLICY.TIMEZONE);
  const currentMinutes = zoned.totalMinutes;
  const onTimeMinutes = timeToMinutes(POLICY.CHECK_IN_END); // 09:00 = 540
  const workEndMinutes = timeToMinutes(POLICY.WORK_END);    // 17:00 = 1020

  if (currentType === 'check_in') {
    return currentMinutes <= onTimeMinutes ? 'on_time' : 'late';
  }

  if (currentType === 'check_out') {
    return currentMinutes >= workEndMinutes ? 'full_day' : 'early_leave';
  }

  return 'normal';
}

export default POLICY;
