export function formatTime(isoString) {
  if (!isoString) return '--:--';
  return new Date(isoString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(isoString) {
  if (!isoString) return '---';
  return new Date(isoString).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDuration(hours) {
  if (!hours || hours <= 0) return '0h 0m';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
}

export function formatElapsed(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function confidenceLabel(score) {
  if (score >= 80) return { label: 'High', color: 'success' };
  if (score >= 60) return { label: 'Medium', color: 'warning' };
  return { label: 'Low', color: 'danger' };
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function getWeekDates() {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

export function groupRecordsByDay(records = []) {
  const groups = {};
  records.forEach(r => {
    const timeVal = r.recorded_at || r.recordedAt || r.createdAt || new Date();
    const day = new Date(timeVal).toDateString();
    if (!groups[day]) groups[day] = [];
    groups[day].push(r);
  });
  return groups;
}

/**
 * Resolves a human-readable employee name from any record, team list, or auth user.
 * Strips unknown ID hashes, numbers, or messy tokens and produces clean names.
 */
export function getEmployeeName(recordOrUser, teamMembers = [], currentUser = null) {
  if (!recordOrUser) return 'Team Member';

  // 1. Explicit name property
  const directName = recordOrUser.userName || recordOrUser.name || recordOrUser.user_name || recordOrUser.displayName;
  if (directName && !directName.startsWith('usr_') && !directName.startsWith('tok_') && directName.length < 50) {
    return directName;
  }

  const targetId = recordOrUser.user_id || recordOrUser.userId || recordOrUser.id;
  const targetEmail = recordOrUser.userEmail || recordOrUser.email || recordOrUser.user?.email;

  // 2. Lookup in teamMembers array
  if (Array.isArray(teamMembers) && teamMembers.length > 0) {
    const match = teamMembers.find(
      (m) => (targetId && m.id === targetId) || (targetEmail && m.email?.toLowerCase() === targetEmail.toLowerCase())
    );
    if (match && match.name) return match.name;
  }

  // 3. Match with currentUser
  if (currentUser && ((targetId && currentUser.id === targetId) || (targetEmail && currentUser.email === targetEmail))) {
    if (currentUser.name) return currentUser.name;
  }

  // 4. Clean up email into a recognizable human name
  if (targetEmail && targetEmail.includes('@')) {
    if (targetEmail.toLowerCase() === 'mrelectricalworks02@gmail.com') {
      return 'Mr. Electric (Admin)';
    }
    const usernamePart = targetEmail.split('@')[0];
    const cleaned = usernamePart
      .replace(/[._\d-]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    if (cleaned.length >= 2) return cleaned;
  }

  // 5. Friendly fallback instead of unknown numbers
  return 'Technician / Staff';
}

/**
 * Returns an avatar emoji or formatted initials
 */
export function getEmployeeAvatar(recordOrUser, teamMembers = []) {
  if (recordOrUser?.avatar) return recordOrUser.avatar;
  const targetId = recordOrUser?.user_id || recordOrUser?.userId || recordOrUser?.id;
  if (Array.isArray(teamMembers)) {
    const match = teamMembers.find((m) => m.id === targetId);
    if (match?.avatar) return match.avatar;
  }
  return '⚡';
}

