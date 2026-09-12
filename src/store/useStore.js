import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { POLICY, getZonedNow } from '../config/policy.js';

const LOCATIONS = [
  { id: 'loc-001', name: 'Main HQ & Warehouse', lat: 28.6139, lng: 77.2090, radius: 150, wifi_ssid: 'MrElectric-HQ' },
  { id: 'loc-002', name: 'Site Alpha (Commercial)', lat: 28.6200, lng: 77.2150, radius: 200, wifi_ssid: 'SiteAlpha-Net' },
  { id: 'loc-003', name: 'Site Beta (Industrial)', lat: 28.6080, lng: 77.2010, radius: 200, wifi_ssid: 'SiteBeta-Net' },
];

const VALID_TRANSITIONS = {
  idle: ['checking_in'],
  checking_in: ['checked_in', 'idle'],
  checked_in: ['on_break', 'checking_out', 'ot_active'],
  on_break: ['checked_in'],
  ot_active: ['checked_in', 'idle', 'checking_out'],
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
  const [breakStartTime, setBreakStartTime] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isLoading, setIsLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(api.getOfflineQueue());
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getZonedNow().dateString);

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

  // Request browser notification permission once if supported
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
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
  const loadRecords = useCallback(async (date = null) => {
    if (!authUser) return;
    try {
      const data = await api.getRecords(null, date);
      const recs = data.records || [];
      setRecords(recs);

      // Determine today's state in IST
      const todayDateStr = getZonedNow().dateString;
      const todayRecs = recs.filter((r) => {
        const d = r.recorded_at || r.recordedAt;
        if (!d) return false;
        return new Date(d).toISOString().slice(0, 10) === todayDateStr ||
               new Date(d).toLocaleDateString('en-CA', { timeZone: POLICY.TIMEZONE }) === todayDateStr;
      });

      const lastIn = [...todayRecs].reverse().find((r) => r.record_type === 'check_in' || r.recordType === 'check_in');
      const lastOut = [...todayRecs].reverse().find((r) => r.record_type === 'check_out' || r.recordType === 'check_out');
      const lastBreakStart = [...todayRecs].reverse().find((r) => r.record_type === 'break_start' || r.recordType === 'break_start');
      const lastBreakEnd = [...todayRecs].reverse().find((r) => r.record_type === 'break_end' || r.recordType === 'break_end');
      const lastOtStart = [...todayRecs].reverse().find((r) => r.record_type === 'ot_start' || r.recordType === 'ot_start');
      const lastOtEnd = [...todayRecs].reverse().find((r) => r.record_type === 'ot_end' || r.recordType === 'ot_end');

      const isBreakActive = lastBreakStart && (!lastBreakEnd || new Date(lastBreakEnd.recorded_at) < new Date(lastBreakStart.recorded_at));
      const isOtActive = lastOtStart && (!lastOtEnd || new Date(lastOtEnd.recorded_at) < new Date(lastOtStart.recorded_at));
      const isShiftActive = lastIn && (!lastOut || new Date(lastOut.recorded_at) < new Date(lastIn.recorded_at));

      if (isBreakActive) {
        setAttendanceState('on_break');
        setBreakStartTime(lastBreakStart.recorded_at || lastBreakStart.recordedAt);
        setCurrentCheckIn(lastIn);
      } else if (isOtActive) {
        setAttendanceState('ot_active');
        setCurrentCheckIn(lastIn);
        setBreakStartTime(null);
      } else if (isShiftActive) {
        setAttendanceState('checked_in');
        setCurrentCheckIn(lastIn);
        setBreakStartTime(null);
      } else {
        setAttendanceState('idle');
        setCurrentCheckIn(null);
        setBreakStartTime(null);
      }
    } catch (err) {
      console.error('Error loading records:', err);
    }
  }, [authUser]);

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

  const loadTeamData = useCallback(async (date = selectedDate) => {
    if (authUser?.role !== 'admin') return;
    try {
      const data = await api.getTeam(date);
      setTeamSummary(data.team || []);
    } catch (err) {
      console.error('Error loading team data:', err);
    }
  }, [authUser?.role, selectedDate]);

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

      const queue = api.getOfflineQueue();
      if (queue.length > 0 && navigator.onLine) {
        syncOfflineQueue();
      }
    }
  }, [authUser, loadRecords, loadCurrentQR, loadTeamData, loadAuditData, syncOfflineQueue]);

  // ── Admin Polling: live refresh every 10 seconds ──────────────────────────
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const intervalId = setInterval(() => {
      loadTeamData(selectedDate);
      loadAuditData();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [authUser, selectedDate, loadTeamData, loadAuditData]);

  // ── 1:50 PM Break Notification Checker ────────────────────────────────────
  useEffect(() => {
    if (!authUser || attendanceState !== 'checked_in') return;

    const check150Notification = () => {
      const zoned = getZonedNow(POLICY.TIMEZONE);
      if (zoned.timeString === POLICY.BREAK_NOTIFY) {
        const storageKey = `break_notified_${zoned.dateString}`;
        if (!sessionStorage.getItem(storageKey)) {
          sessionStorage.setItem(storageKey, 'true');
          addToast('☕ It is 1:50 PM! Time for your 30-min break. Tap "Take Break" to begin the countdown.', 'warning', 10000);

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification('Mr. Electricals — Afternoon Break', {
                body: "It's 1:50 PM! Time for your 30-minute scheduled break. Tap to start your break timer.",
              });
            } catch (e) {
              console.warn('Browser notification error:', e);
            }
          }
        }
      }
    };

    const timer = setInterval(check150Notification, 15000);
    return () => clearInterval(timer);
  }, [authUser, attendanceState, addToast]);

  // ── QR Token Generation ───────────────────────────────────────────────────
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
        const timingMsg = res.timing === 'late' ? '⚠ Checked In (Late after 9:00 AM)' : '✓ Checked in on-time (Present)!';
        addToast(timingMsg, res.timing === 'late' ? 'warning' : 'success');
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
  const startBreak = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.startBreak();
      setAttendanceState('on_break');
      setBreakStartTime(res.record?.recorded_at || new Date().toISOString());
      addToast('☕ Break started! Countdown running (30-40 min).', 'warning');
      await loadRecords();
    } catch (err) {
      addToast(err.message || 'Failed to start break', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, loadRecords]);

  const endBreak = useCallback(
    async (scannedData) => {
      setIsLoading(true);
      try {
        let payload;
        try {
          payload = typeof scannedData === 'string' ? JSON.parse(scannedData) : scannedData;
        } catch {
          payload = { token: scannedData };
        }

        const res = await api.endBreak({ qrPayload: payload });
        setAttendanceState('checked_in');
        setBreakStartTime(null);
        addToast('✓ Break ended via QR Scan! Welcome back to shift.', 'success');
        await loadRecords();
        if (authUser?.role === 'admin') {
          loadTeamData();
        }
        return { success: true, record: res.record };
      } catch (err) {
        addToast(`❌ Resume Failed: ${err.message}`, 'error');
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [authUser?.role, addToast, loadRecords, loadTeamData]
  );

  // ── Overtime (OT) ─────────────────────────────────────────────────────────
  const startOT = useCallback(
    async (scannedData) => {
      setIsLoading(true);
      try {
        let payload;
        try {
          payload = typeof scannedData === 'string' ? JSON.parse(scannedData) : scannedData;
        } catch {
          payload = { token: scannedData };
        }

        const res = await api.startOT({ qrPayload: payload });
        setAttendanceState('ot_active');
        addToast('⏫ Overtime started! Extra work timer is running.', 'success');
        await loadRecords();
        if (authUser?.role === 'admin') {
          loadTeamData();
        }
        return { success: true, record: res.record };
      } catch (err) {
        addToast(`❌ OT Start Failed: ${err.message}`, 'error');
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [authUser?.role, addToast, loadRecords, loadTeamData]
  );

  const endOT = useCallback(
    async (scannedData) => {
      setIsLoading(true);
      try {
        let payload;
        try {
          payload = typeof scannedData === 'string' ? JSON.parse(scannedData) : scannedData;
        } catch {
          payload = { token: scannedData };
        }

        const res = await api.endOT({ qrPayload: payload });
        setAttendanceState('checked_in');
        addToast('⏹ Overtime ended. Great work!', 'info');
        await loadRecords();
        if (authUser?.role === 'admin') {
          loadTeamData();
        }
        return { success: true, record: res.record };
      } catch (err) {
        addToast(`❌ OT End Failed: ${err.message}`, 'error');
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [authUser?.role, addToast, loadRecords, loadTeamData]
  );

  // ── PDF Export ────────────────────────────────────────────────────────────
  const downloadReportPDF = useCallback(
    async (date = selectedDate) => {
      try {
        addToast('Generating PDF attendance report…', 'info');
        await api.downloadReportPDF(date);
        addToast('✓ PDF attendance report downloaded successfully!', 'success');
      } catch (err) {
        addToast(err.message || 'Failed to download report', 'error');
      }
    },
    [selectedDate, addToast]
  );

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
    presentToday: teamSummary.filter((e) => ['present', 'checked_out'].includes(e.status)).length,
    lateToday: teamSummary.filter((e) => e.isLate || e.status === 'late').length,
    halfDayToday: teamSummary.filter((e) => e.status === 'half_day').length,
    absentToday: teamSummary.filter((e) => e.status === 'absent').length,
    checkedOut: teamSummary.filter((e) => e.status === 'checked_out').length,
    otToday: teamSummary.filter((e) => e.status === 'overtime' || e.otHours > 0).length,
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
    breakStartTime,
    activeLocation,
    setActiveLocation,
    selectedDate,
    setSelectedDate,
    checkInWithQR,
    checkOutWithQR,
    startBreak,
    endBreak,
    startOT,
    endOT,
    downloadReportPDF,
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

export default useAttendanceStore;
