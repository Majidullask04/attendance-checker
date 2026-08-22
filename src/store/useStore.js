import { useState, useCallback, useEffect } from 'react';

// ── Seed Data ────────────────────────────────────────────────────────────────

const EMPLOYEES = [
  { id: 'emp-001', name: 'Arjun Mehta',    role: 'senior',   department: 'Electrical',   avatar: '👷', deviceId: 'dev-a1b2' },
  { id: 'emp-002', name: 'Priya Sharma',   role: 'employee', department: 'Electrical',   avatar: '👩‍🔧', deviceId: 'dev-c3d4' },
  { id: 'emp-003', name: 'Rahul Singh',    role: 'employee', department: 'Plumbing',     avatar: '🧑‍🔧', deviceId: 'dev-e5f6' },
  { id: 'emp-004', name: 'Deepa Nair',     role: 'employee', department: 'Electrical',   avatar: '👩‍💼', deviceId: 'dev-g7h8' },
  { id: 'emp-005', name: 'Vikram Joshi',   role: 'employee', department: 'HVAC',         avatar: '👨‍🔬', deviceId: 'dev-i9j0' },
];

const LOCATIONS = [
  { id: 'loc-001', name: 'Main Warehouse',   lat: 28.6139, lng: 77.2090, radius: 150, wifi_ssid: 'MrElectric-HQ' },
  { id: 'loc-002', name: 'Site Alpha',       lat: 28.6200, lng: 77.2150, radius: 200, wifi_ssid: 'SiteAlpha-Net' },
  { id: 'loc-003', name: 'Site Beta',        lat: 28.6080, lng: 77.2010, radius: 200, wifi_ssid: 'SiteBeta-Net'  },
];

function generatePastRecords() {
  const records = [];
  const today = new Date();
  
  for (let dayOffset = 6; dayOffset >= 1; dayOffset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends

    EMPLOYEES.forEach((emp, idx) => {
      const absent = Math.random() < 0.08;
      if (absent) return;

      const checkInHour  = 8 + Math.floor(Math.random() * 2);
      const checkInMin   = Math.floor(Math.random() * 45);
      const hoursWorked  = 7.5 + (Math.random() - 0.5);
      const loc          = LOCATIONS[idx % LOCATIONS.length];
      const confidence   = Math.random() < 0.1 ? Math.floor(Math.random() * 60) + 20 : Math.floor(Math.random() * 20) + 80;

      const ci = new Date(date);
      ci.setHours(checkInHour, checkInMin, 0, 0);
      const co = new Date(ci.getTime() + hoursWorked * 3600 * 1000);

      records.push({
        id: `rec-${Date.now()}-${emp.id}-${dayOffset}-in`,
        userId: emp.id,
        locationId: loc.id,
        recordType: 'check_in',
        recordedAt: ci.toISOString(),
        deviceTimestamp: ci.toISOString(),
        latitude: loc.lat + (Math.random() - 0.5) * 0.001,
        longitude: loc.lng + (Math.random() - 0.5) * 0.001,
        accuracyMeters: Math.floor(Math.random() * 20) + 5,
        deviceId: emp.deviceId,
        isOfflineSync: Math.random() < 0.05,
        verifiedBy: Math.random() < 0.3 ? 'wifi' : 'gps',
        confidenceScore: confidence,
        status: confidence < 50 ? 'flagged' : 'verified',
        createdAt: ci.toISOString(),
      });
      records.push({
        id: `rec-${Date.now()}-${emp.id}-${dayOffset}-out`,
        userId: emp.id,
        locationId: loc.id,
        recordType: 'check_out',
        recordedAt: co.toISOString(),
        deviceTimestamp: co.toISOString(),
        latitude: loc.lat + (Math.random() - 0.5) * 0.001,
        longitude: loc.lng + (Math.random() - 0.5) * 0.001,
        accuracyMeters: Math.floor(Math.random() * 20) + 5,
        deviceId: emp.deviceId,
        isOfflineSync: false,
        verifiedBy: Math.random() < 0.3 ? 'wifi' : 'gps',
        confidenceScore: confidence,
        status: confidence < 50 ? 'flagged' : 'verified',
        createdAt: co.toISOString(),
      });
    });
  }
  return records;
}

// ── State Machine ─────────────────────────────────────────────────────────────
// Valid transitions:
//   idle       → checking_in
//   checking_in → checked_in
//   checked_in  → on_break | checking_out
//   on_break    → checked_in
//   checking_out → idle

const VALID_TRANSITIONS = {
  idle:         ['checking_in'],
  checking_in:  ['checked_in', 'idle'],
  checked_in:   ['on_break', 'checking_out'],
  on_break:     ['checked_in'],
  checking_out: ['idle'],
};

function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Main Store Hook ────────────────────────────────────────────────────────────
export function useAttendanceStore() {
  const [currentUser]    = useState(EMPLOYEES[0]);
  const [attendanceState, setAttendanceState] = useState('idle'); // state machine
  const [records, setRecords]       = useState(generatePastRecords);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isOnline, setIsOnline]     = useState(true);
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [toasts, setToasts]         = useState([]);
  const [currentCheckIn, setCurrentCheckIn] = useState(null);
  const [activeLocation] = useState(LOCATIONS[0]);
  const [isSyncing, setIsSyncing]   = useState(false);

  // Simulate online/offline toggling
  useEffect(() => {
    const handler = () => setIsOnline(navigator.onLine);
    window.addEventListener('online',  handler);
    window.addEventListener('offline', handler);
    return () => { window.removeEventListener('online', handler); window.removeEventListener('offline', handler); };
  }, []);

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [isOnline]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || offlineQueue.length === 0) return;
    setIsSyncing(true);
    addToast(`Syncing ${offlineQueue.length} offline record(s)…`, 'info');
    await new Promise(r => setTimeout(r, 1500));
    setRecords(prev => [...prev, ...offlineQueue]);
    setOfflineQueue([]);
    setIsSyncing(false);
    addToast('Offline records synced successfully', 'success');
  }, [isOnline, offlineQueue, addToast]);

  const checkIn = useCallback(async () => {
    if (!canTransition(attendanceState, 'checking_in')) {
      addToast('Invalid state transition', 'error'); return;
    }
    setAttendanceState('checking_in');

    // Simulate validation: geofence check, duplicate check, clock drift check
    await new Promise(r => setTimeout(r, 1800));

    const confidence = isOnline ? (Math.random() < 0.1 ? 45 : Math.floor(Math.random()*15)+85) : 75;
    const now = new Date();
    const record = {
      id: `rec-${Date.now()}-${currentUser.id}-in`,
      userId: currentUser.id,
      locationId: activeLocation.id,
      recordType: 'check_in',
      recordedAt: now.toISOString(),
      deviceTimestamp: now.toISOString(),
      latitude: activeLocation.lat + (Math.random() - 0.5) * 0.0005,
      longitude: activeLocation.lng + (Math.random() - 0.5) * 0.0005,
      accuracyMeters: Math.floor(Math.random() * 10) + 5,
      deviceId: currentUser.deviceId,
      isOfflineSync: !isOnline,
      verifiedBy: isOnline ? (Math.random() < 0.4 ? 'wifi' : 'gps') : 'gps',
      confidenceScore: confidence,
      status: confidence < 60 ? 'flagged' : 'verified',
      createdAt: now.toISOString(),
    };

    setCurrentCheckIn(record);

    if (isOnline) {
      setRecords(prev => [...prev, record]);
      addToast('Checked in successfully ✓', 'success');
    } else {
      setOfflineQueue(prev => [...prev, record]);
      addToast('Offline: Check-in queued for sync', 'warning');
    }

    if (confidence < 60) {
      addToast('⚠ Low confidence score — flagged for manager review', 'warning', 6000);
    }

    setAttendanceState('checked_in');
  }, [attendanceState, currentUser, activeLocation, isOnline, addToast]);

  const checkOut = useCallback(async () => {
    if (!canTransition(attendanceState, 'checking_out')) {
      addToast('Invalid state transition', 'error'); return;
    }
    setAttendanceState('checking_out');
    await new Promise(r => setTimeout(r, 1200));

    const now = new Date();
    const record = {
      id: `rec-${Date.now()}-${currentUser.id}-out`,
      userId: currentUser.id,
      locationId: activeLocation.id,
      recordType: 'check_out',
      recordedAt: now.toISOString(),
      deviceTimestamp: now.toISOString(),
      latitude: activeLocation.lat + (Math.random() - 0.5) * 0.0005,
      longitude: activeLocation.lng + (Math.random() - 0.5) * 0.0005,
      accuracyMeters: Math.floor(Math.random() * 10) + 5,
      deviceId: currentUser.deviceId,
      isOfflineSync: !isOnline,
      verifiedBy: isOnline ? 'gps' : 'gps',
      confidenceScore: 92,
      status: 'verified',
      createdAt: now.toISOString(),
    };

    if (isOnline) {
      setRecords(prev => [...prev, record]);
    } else {
      setOfflineQueue(prev => [...prev, record]);
    }

    setCurrentCheckIn(null);
    setAttendanceState('idle');
    addToast('Checked out. Have a great rest of your day!', 'success');
  }, [attendanceState, currentUser, activeLocation, isOnline, addToast]);

  const startBreak = useCallback(async () => {
    if (!canTransition(attendanceState, 'on_break')) return;
    setAttendanceState('on_break');
    addToast('Break started', 'info');
  }, [attendanceState]);

  const endBreak = useCallback(async () => {
    if (!canTransition(attendanceState, 'checked_in')) return;
    setAttendanceState('checked_in');
    addToast('Welcome back!', 'success');
  }, [attendanceState]);

  const correctRecord = useCallback((recordId, newTime, reason, managerId) => {
    // Append-only: never mutate original, create a correction record
    setRecords(prev => prev.map(r =>
      r.id === recordId
        ? { ...r, status: 'corrected', correctedAt: new Date().toISOString(), correctionReason: reason }
        : r
    ));
    addToast('Correction saved — audit trail updated', 'success');
  }, [addToast]);

  // ── Derived Data ────────────────────────────────────────────────────────────
  const myRecords = records.filter(r => r.userId === currentUser.id);

  const todayRecords = records.filter(r => {
    const d = new Date(r.recordedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const teamSummary = EMPLOYEES.map(emp => {
    const empRecords = records.filter(r => {
      const d = new Date(r.recordedAt);
      return r.userId === emp.id && d.toDateString() === new Date().toDateString();
    });
    const ci = empRecords.find(r => r.recordType === 'check_in');
    const co = empRecords.find(r => r.recordType === 'check_out');
    let hoursWorked = 0;
    if (ci && co) {
      hoursWorked = (new Date(co.recordedAt) - new Date(ci.recordedAt)) / 3600000;
    } else if (ci && attendanceState !== 'idle' && emp.id === currentUser.id) {
      hoursWorked = (Date.now() - new Date(ci.recordedAt)) / 3600000;
    }
    const flagged = empRecords.some(r => r.status === 'flagged');
    return {
      ...emp,
      status: co ? 'checked_out' : ci ? 'present' : 'absent',
      checkInTime: ci?.recordedAt,
      checkOutTime: co?.recordedAt,
      hoursWorked: Math.max(0, hoursWorked),
      flagged,
    };
  });

  const stats = {
    presentToday: teamSummary.filter(e => e.status === 'present').length,
    absentToday:  teamSummary.filter(e => e.status === 'absent').length,
    checkedOut:   teamSummary.filter(e => e.status === 'checked_out').length,
    flaggedRecords: records.filter(r => r.status === 'flagged').length,
    offlineQueue: offlineQueue.length,
    totalEmployees: EMPLOYEES.length,
  };

  return {
    currentUser, attendanceState, records, myRecords, todayRecords,
    offlineQueue, isOnline, activeScreen, setActiveScreen,
    toasts, addToast, dismissToast,
    currentCheckIn, activeLocation, isSyncing,
    checkIn, checkOut, startBreak, endBreak, correctRecord, syncOfflineQueue,
    teamSummary, stats, employees: EMPLOYEES, locations: LOCATIONS,
    VALID_TRANSITIONS, canTransition,
  };
}
