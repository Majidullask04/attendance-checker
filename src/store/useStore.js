import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

const LOCATIONS = [
  { id: 'loc-001', name: 'Main HQ & Warehouse', lat: 28.6139, lng: 77.2090, radius: 150, wifi_ssid: 'MrElectric-HQ' },
  { id: 'loc-002', name: 'Site Alpha (Commercial)', lat: 28.6200, lng: 77.2150, radius: 200, wifi_ssid: 'SiteAlpha-Net' },
  { id: 'loc-003', name: 'Site Beta (Industrial)', lat: 28.6080, lng: 77.2010, radius: 200, wifi_ssid: 'SiteBeta-Net' },
];

const VALID_TRANSITIONS = {
  idle: ['checking_in'],
  checking_in: ['checked_in', 'idle'],
  checked_in: ['on_break', 'checking_out'],
  on_break: ['checked_in'],
  checking_out: ['idle'],
};

function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function useAttendanceStore() {
  const { user: authUser } = useAuth();
  const [attendanceState, setAttendanceState] = useState('idle');
  const [records, setRecords] = useState([]);
  const [teamSummary, setTeamSummary] = useState([]);
  const [auditRecords, setAuditRecords] = useState([]);
  const [currentQRToken, setCurrentQRToken] = useState(null);
  const [activeLocation, setActiveLocation] = useState(LOCATIONS[0]);
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const [currentCheckIn, setCurrentCheckIn] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isLoading, setIsLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(api.getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);

  // Online / offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setOfflineQueue(api.getOfflineQueue());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setOfflineQueue(api.getOfflineQueue());
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Load Data from API ────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    if (!authUser) return;
    try {
      const data = await api.getRecords();
      const recs = data.records || [];
      setRecords(recs);

      // Check if user is currently checked in today
      const today = new Date().toDateString();
      const todayRecs = recs.filter((r) => new Date(r.recorded_at || r.recordedAt).toDateString() === today);
      const lastIn = [...todayRecs].reverse().find((r) => (r.record_type === 'check_in' || r.recordType === 'check_in'));
      const lastOut = [...todayRecs].reverse().find((r) => (r.record_type === 'check_out' || r.recordType === 'check_out'));

      if (lastIn && (!lastOut || new Date(lastOut.recorded_at || lastOut.recordedAt) < new Date(lastIn.recorded_at || lastIn.recordedAt))) {
        setCurrentCheckIn(lastIn);
        setAttendanceState('checked_in');
      } else {
        setCurrentCheckIn(null);
        setAttendanceState('idle');
      }
    } catch (err) {
      console.error('Error loading records:', err);
    }
  }, [authUser?.id]);

  const loadCurrentQR = useCallback(async () => {
    try {
      const data = await api.getCurrentQR();
      setCurrentQRToken({
        tokenId: data.token,
        token: data.token,
        locationId: data.locationId || 'loc-001',
        locationName: data.locationName || 'Main HQ & Warehouse',
        generatedAt: data.generatedAt,
      });
    } catch (err) {
      console.warn('Could not fetch active QR:', err);
    }
  }, []);

  const loadTeamData = useCallback(async () => {
    if (authUser?.role !== 'admin') return;
    try {
      const data = await api.getTeam();
      setTeamSummary(data.team || []);
    } catch (err) {
      console.error('Error loading team data:', err);
    }
  }, [authUser?.role]);

  const loadAuditData = useCallback(async () => {
    if (authUser?.role !== 'admin') return;
    try {
      const data = await api.getAudit();
      setAuditRecords(data.records || []);
    } catch (err) {
      console.error('Error loading audit data:', err);
    }
  }, [authUser?.role]);

  const syncOfflineQueue = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await api.syncOffline();
      setOfflineQueue(api.getOfflineQueue());
      if (res.synced > 0) {
        addToast(`✓ Synced ${res.synced} offline record(s) to server!`, 'success');
        await loadRecords();
        if (authUser?.role === 'admin') {
          await loadTeamData();
          await loadAuditData();
        }
      }
    } catch (err) {
      addToast(`Sync error: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, authUser?.role, addToast, loadRecords, loadTeamData, loadAuditData]);

  // Initial load
  useEffect(() => {
    if (authUser) {
      loadRecords();
      loadCurrentQR();
      if (authUser.role === 'admin') {
        loadTeamData();
        loadAuditData();
      }

      // Auto-sync offline queue if any
      const queue = api.getOfflineQueue();
      if (queue.length > 0 && navigator.onLine) {
        syncOfflineQueue();
      }
    }
  }, [authUser?.id, authUser?.role, loadRecords, loadCurrentQR, loadTeamData, loadAuditData, syncOfflineQueue]);

  // ── Admin Polling: live refresh every 10 seconds ──────────────────────────
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const intervalId = setInterval(() => {
      loadTeamData();
      loadAuditData();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [authUser?.role, loadTeamData, loadAuditData]);

  // ── QR Actions ────────────────────────────────────────────────────────────
  const generateNewQRToken = useCallback(
    async (location = activeLocation) => {
      setQrLoading(true);
      try {
        const data = await api.regenerateQR(location.id, location.name);
        const newToken = {
          tokenId: data.token,
          token: data.token,
          locationId: data.locationId,
          locationName: data.locationName || location.name,
          generatedAt: data.generatedAt,
        };
        setCurrentQRToken(newToken);
        addToast('New Station QR generated. Previous QR is now invalid.', 'success');
        return newToken;
      } catch (err) {
        addToast(err.message || 'Failed to regenerate QR token', 'error');
      } finally {
        setQrLoading(false);
      }
    },
    [activeLocation, addToast]
  );

  // ── Check In / Check Out via API ──────────────────────────────────────────
  const checkInWithQR = useCallback(
    async (scannedData) => {
      if (!canTransition(attendanceState, 'checking_in')) {
        addToast('Invalid transition state for Check In.', 'error');
        return { success: false };
      }

      setAttendanceState('checking_in');
      setIsLoading(true);

      try {
        let payload;
        try {
          payload = typeof scannedData === 'string' ? JSON.parse(scannedData) : scannedData;
        } catch {
          payload = { token: scannedData };
        }

        const res = await api.checkIn({
          qrPayload: payload,
          latitude: activeLocation.lat + (Math.random() - 0.5) * 0.0004,
          longitude: activeLocation.lng + (Math.random() - 0.5) * 0.0004,
          accuracyMeters: Math.floor(Math.random() * 8) + 4,
          deviceId: authUser?.deviceId || 'web-client',
          deviceTimestamp: new Date().toISOString(),
        });

        if (res.offline) {
          setOfflineQueue(api.getOfflineQueue());
          const localRecord = {
            id: `offline-${Date.now()}`,
            user_id: authUser?.id,
            record_type: 'check_in',
            recorded_at: new Date().toISOString(),
            qr_token: payload?.t || payload?.token,
            status: 'verified',
            is_offline_sync: 1,
          };
          setCurrentCheckIn(localRecord);
          setAttendanceState('checked_in');
          addToast('📵 Saved offline. Will sync when connection is restored.', 'info', 6000);
          return { success: true, offline: true };
        }

        setCurrentCheckIn(res.record);
        setAttendanceState('checked_in');
        addToast('✓ Checked in successfully via Station QR!', 'success');
        await loadRecords();
        if (authUser?.role === 'admin') {
          loadTeamData();
          loadAuditData();
        }
        return { success: true, record: res.record };
      } catch (err) {
        setAttendanceState('idle');
        addToast(`❌ Check-In Failed: ${err.message}`, 'error', 6000);
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [attendanceState, activeLocation, authUser, addToast, loadRecords, loadTeamData, loadAuditData]
  );

  const checkOutWithQR = useCallback(
    async (scannedData) => {
      if (!canTransition(attendanceState, 'checking_out')) {
        addToast('Invalid transition state for Check Out.', 'error');
        return { success: false };
      }

      setAttendanceState('checking_out');
      setIsLoading(true);

      try {
        let payload;
        try {
          payload = typeof scannedData === 'string' ? JSON.parse(scannedData) : scannedData;
        } catch {
          payload = { token: scannedData };
        }

        const res = await api.checkOut({
          qrPayload: payload,
          latitude: activeLocation.lat + (Math.random() - 0.5) * 0.0004,
          longitude: activeLocation.lng + (Math.random() - 0.5) * 0.0004,
          accuracyMeters: Math.floor(Math.random() * 8) + 4,
          deviceId: authUser?.deviceId || 'web-client',
          deviceTimestamp: new Date().toISOString(),
        });

        if (res.offline) {
          setOfflineQueue(api.getOfflineQueue());
          setCurrentCheckIn(null);
          setAttendanceState('idle');
          addToast('📵 Checkout saved offline. Will sync when connection is restored.', 'info', 6000);
          return { success: true, offline: true };
        }

        setCurrentCheckIn(null);
        setAttendanceState('idle');
        addToast('✓ Checked out successfully. Shift completed!', 'success');
        await loadRecords();
        if (authUser?.role === 'admin') {
          loadTeamData();
          loadAuditData();
        }
        return { success: true, record: res.record };
      } catch (err) {
        setAttendanceState('checked_in');
        addToast(`❌ Check-Out Failed: ${err.message}`, 'error', 6000);
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [attendanceState, activeLocation, authUser, addToast, loadRecords, loadTeamData, loadAuditData]
  );

  // ── Breaks ────────────────────────────────────────────────────────────────
  const startBreak = useCallback(() => {
    if (!canTransition(attendanceState, 'on_break')) return;
    setAttendanceState('on_break');
    addToast('Break started. Shift timer paused.', 'info');
  }, [attendanceState, addToast]);

  const endBreak = useCallback(() => {
    if (!canTransition(attendanceState, 'checked_in')) return;
    setAttendanceState('checked_in');
    addToast('Welcome back! Break ended.', 'success');
  }, [attendanceState, addToast]);

  // ── Record Correction (Admin Only) ────────────────────────────────────────
  const correctRecord = useCallback(
    async (recordId, reason) => {
      try {
        await api.correctRecord(recordId, reason);
        addToast('Record marked as corrected with immutable audit trail entry.', 'success');
        await loadAuditData();
        await loadRecords();
        await loadTeamData();
      } catch (err) {
        addToast(err.message || 'Failed to correct record', 'error');
      }
    },
    [addToast, loadAuditData, loadRecords, loadTeamData]
  );

  // ── Derived Data ──────────────────────────────────────────────────────────
  const myRecords = records;
  const today = new Date().toDateString();
  const todayRecords = records.filter(
    (r) => new Date(r.recorded_at || r.recordedAt).toDateString() === today
  );

  const stats = {
    presentToday: teamSummary.filter((e) => e.status === 'present').length,
    absentToday: teamSummary.filter((e) => e.status === 'absent').length,
    checkedOut: teamSummary.filter((e) => e.status === 'checked_out').length,
    flaggedRecords: auditRecords.filter((r) => r.status === 'flagged').length,
    totalEmployees: teamSummary.length || 6,
  };

  return {
    currentUser: authUser,
    attendanceState,
    records,
    myRecords,
    todayRecords,
    teamSummary,
    auditRecords,
    currentQRToken,
    generateNewQRToken,
    qrLoading,
    isOnline,
    isLoading,
    offlineQueue: offlineQueue || [],
    isSyncing,
    syncOfflineQueue,
    activeScreen,
    setActiveScreen,
    toasts,
    addToast,
    dismissToast,
    currentCheckIn,
    activeLocation,
    setActiveLocation,
    checkInWithQR,
    checkOutWithQR,
    startBreak,
    endBreak,
    correctRecord,
    loadRecords,
    loadTeamData,
    loadAuditData,
    loadCurrentQR,
    stats,
    locations: LOCATIONS,
    VALID_TRANSITIONS,
    canTransition,
  };
}
