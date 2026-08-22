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
  login: (email) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),
  me: () => request('/auth/me'),

  // QR endpoints
  getCurrentQR: () => request('/qr-token/current'),
  regenerateQR: (locationId, locationName) =>
    request('/qr-token/regenerate', {
      method: 'POST',
      body: JSON.stringify({ locationId, locationName }),
    }),

  // Attendance endpoints (with offline fallback)
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
  getRecords: (userId) => request(`/attendance/records${userId ? `?userId=${userId}` : ''}`),
  getTeam: () => request('/attendance/team'),
  getAudit: () => request('/attendance/audit'),
  correctRecord: (id, reason) =>
    request(`/attendance/correct/${id}`, { method: 'PATCH', body: JSON.stringify({ reason }) }),

  // Offline sync
  syncOffline: syncOfflineQueue,
  getOfflineQueue,
  clearOfflineQueue,
};
