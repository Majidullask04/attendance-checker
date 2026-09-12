/**
 * src/config/policy.js
 * Client-side schedule policy configuration mirroring backend rules.
 */

export const POLICY = {
  TIMEZONE: 'Asia/Kolkata',
  // Check-in window
  CHECK_IN_START: '06:00',
  CHECK_IN_END: '09:00', // After 9:00 AM is late

  // Break window
  BREAK_NOTIFY: '13:50', // 1:50 PM notification
  BREAK_MINUTES_DEFAULT: 30,
  BREAK_MINUTES_MAX: 40,

  // Workday end
  WORK_END: '17:00', // 5:00 PM full day completion

  // Overtime starts after WORK_END
  OT_ENABLED: true,
};

export function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return h * 60 + m;
}

export function getZonedNow(timeZone = POLICY.TIMEZONE) {
  const now = new Date();
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

  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const second = parseInt(parts.second, 10);

  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute,
    second,
    timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    totalMinutes: hour * 60 + minute,
    dateString: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export default POLICY;
