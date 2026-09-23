const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ── Offline Queue ──────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = 'attendance_offline_queue';

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addToOfflineQueue(entry) {
  const queue = getOfflineQueue();
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

// ── Core Request Handler ───────────────────────────────────────────────────
async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  // SECURITY NOTE: localStorage is used for JWT to support static file hosting.
  // In a production deployment with a custom domain, migrate to httpOnly cookies.
  const token = localStorage.getItem('attendance_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

// ── Offline-Aware Check-In/Out ─────────────────────────────────────────────
async function offlineAwareRequest(path, options, offlineEntry) {
  try {
    return await request(path, options);
  } catch (err) {
    // If it's a network error (not a server rejection), queue for offline sync
    const isNetworkError = !navigator.onLine || 
                           err instanceof TypeError || 
                           err.message === 'Failed to fetch' || 
                           err.message.includes('NetworkError');
                           
    if (isNetworkError) {
      addToOfflineQueue(offlineEntry);
      return {
        success: true,
        offline: true,
        message: 'Saved offline. Will sync when connection is restored.',
      };
    }
    throw err; // Re-throw server-side rejections (400, 401, etc.)
  }
}

// ── Sync Offline Queue ─────────────────────────────────────────────────────
async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, total: 0 };

  try {
    const result = await request('/attendance/sync-batch', {
      method: 'POST',
      body: JSON.stringify({ records: queue }),
    });
    clearOfflineQueue();
    return result;
  } catch (err) {
    console.warn('Offline sync failed, will retry later:', err);
    return { synced: 0, total: queue.length, error: err.message };
  }
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const queue = getOfflineQueue();
    if (queue.length > 0) {
      console.log(`Back online — syncing ${queue.length} queued records…`);
      syncOfflineQueue();
    }
  });
}

export const api = {
  // Auth endpoints
  signup: (payload) => request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  neonSync: (payload) => request('/auth/neon-sync', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),

  // Admin approval endpoints
  getPendingUsers: () => request('/auth/pending'),
  approveUser: (id) => request(`/auth/approve/${id}`, { method: 'POST' }),
  rejectUser: (id) => request(`/auth/reject/${id}`, { method: 'POST' }),

  // QR endpoints
  getCurrentQR: () => request('/qr-token/current'),
  regenerateQR: (locationId, locationName) =>
    request('/qr-token/regenerate', {
      method: 'POST',
      body: JSON.stringify({ locationId, locationName }),
    }),

  // Attendance endpoints (with offline fallback)
  getPolicy: () => request('/attendance/policy'),
  checkIn: (payload) =>
    offlineAwareRequest(
      '/attendance/check-in',
      { method: 'POST', body: JSON.stringify(payload) },
      { type: 'check_in', qrPayload: payload.qrPayload, timestamp: payload.deviceTimestamp, deviceId: payload.deviceId, latitude: payload.latitude, longitude: payload.longitude }
    ),
  checkOut: (payload) =>
    offlineAwareRequest(
      '/attendance/check-out',
      { method: 'POST', body: JSON.stringify(payload) },
      { type: 'check_out', qrPayload: payload.qrPayload, timestamp: payload.deviceTimestamp, deviceId: payload.deviceId, latitude: payload.latitude, longitude: payload.longitude }
    ),
  startBreak: (payload = {}) =>
    request('/attendance/break', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', ...payload }),
    }),
  endBreak: (payload) =>
    request('/attendance/break', {
      method: 'POST',
      body: JSON.stringify({ action: 'end', ...payload }),
    }),
  startOT: (payload) =>
    request('/attendance/ot', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', ...payload }),
    }),
  endOT: (payload) =>
    request('/attendance/ot', {
      method: 'POST',
      body: JSON.stringify({ action: 'end', ...payload }),
    }),
  smartScan: (payload) =>
    request('/attendance/scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getRecords: (userId, date) => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (date) params.append('date', date);
    const qs = params.toString();
    return request(`/attendance/records${qs ? `?${qs}` : ''}`);
  },
  getTeam: (date) => request(`/attendance/team${date ? `?date=${date}` : ''}`),
  getSummary: (date) => request(`/attendance/summary${date ? `?date=${date}` : ''}`),
  getAudit: () => request('/attendance/audit'),
  correctRecord: (id, reason) =>
    request(`/attendance/correct/${id}`, { method: 'PATCH', body: JSON.stringify({ reason }) }),

  downloadReportPDF: async (date) => {
    const token = localStorage.getItem('attendance_token');
    const url = `${API_BASE}/attendance/report/pdf${date ? `?date=${date}` : ''}`;
    const res = await fetch(url, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to download PDF report');
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `attendance-report-${date || new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  },

  // Offline sync
  syncOffline: syncOfflineQueue,
  getOfflineQueue,
  clearOfflineQueue,
};
