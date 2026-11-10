import './index.css';
import './App.css';
import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth, AUTH_BYPASS } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';
import SignupScreen from './auth/SignupScreen.jsx';
import PendingApproval from './auth/PendingApproval.jsx';
import FaceEnrollmentScreen from './auth/FaceEnrollmentScreen.jsx';
import { useAttendanceStore } from './store/useStore.js';
import { getEmployeeName, renderAvatar, getInitials } from './utils/formatters.js';
import Sidebar from './components/Sidebar.jsx';
import MobileNav from './components/MobileNav.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import AdminGuard from './components/AdminGuard.jsx';
import { ToastContainer } from './components/Toast.jsx';
import { WifiOff, RefreshCw, LogOut, Clock, ArrowUpCircle, Menu } from 'lucide-react';

// Code-split each screen into its own chunk so the initial bundle stays lean
// (face/QR/team/payroll modules load on demand when the screen opens).
const SCREENS = {
  dashboard: { comp: lazy(() => import('./screens/Dashboard.jsx')), requiresAdmin: false },
  checkin: { comp: lazy(() => import('./screens/CheckIn.jsx')), requiresAdmin: false },
  myrecords: { comp: lazy(() => import('./screens/MyRecords.jsx')), requiresAdmin: false },
  team: { comp: lazy(() => import('./screens/Team.jsx')), requiresAdmin: true },
  audit: { comp: lazy(() => import('./screens/AuditLog.jsx')), requiresAdmin: true },
  approvals: { comp: lazy(() => import('./screens/AdminApprovals.jsx')), requiresAdmin: true },
};

function AuthGate() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const { user, isLoading, pendingApproval, isAuthBypassed, isAdmin } = useAuth();

  // DIRECT ACCESS MODE: Open platform directly without any login, Google auth, or approval page
  if (AUTH_BYPASS || isAuthBypassed) {
    return <AppContent />;
  }

  if (isLoading) {
    return (
      <div className="login-screen-wrap">
        <div className="login-card fade-in" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="live-pulse-dot" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Loading session credentials…</p>
        </div>
      </div>
    );
  }

  if (pendingApproval) return <PendingApproval />;

  if (!user) {
    return mode === 'login'
      ? <LoginScreen onToggle={() => setMode('signup')} />
      : <SignupScreen onToggle={() => setMode('login')} />;
  }

  // Stage 3 of the auth lifecycle: an approved employee who has not yet
  // enrolled a Face ID reference photo is routed to enrollment first.
  // Admins are exempt — administrator accounts skip face/photo entirely.
  if (!isAdmin && !user.faceEnrolled) {
    return <FaceEnrollmentScreen />;
  }

  return <AppContent />;
}

function ScreenLoader() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div className="live-pulse-dot" style={{ margin: '0 auto 16px' }} />
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Loading…</p>
    </div>
  );
}

function AppContent() {
  const { user, isAdmin, logout } = useAuth();
  const store = useAttendanceStore();
  const {
    activeScreen,
    setActiveScreen,
    toasts = [],
    dismissToast,
    stats = {},
    isOnline,
    offlineQueue = [],
    isSyncing,
    syncOfflineQueue,
    pendingWorkflows,
  } = store;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const screenConfig = SCREENS[activeScreen] ?? SCREENS.dashboard;
  const ScreenComponent = screenConfig.comp;
  const qLen = (offlineQueue || []).length;

  return (
    <div className="app-layout">
      {/* Sidebar with Mobile Drawer support */}
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        currentUser={user}
        stats={stats || {}}
        pendingWorkflows={pendingWorkflows || 0}
        isOnline={isOnline}
        offlineQueue={qLen}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="app-header-left">
            <button
              className="header-mobile-menu-btn mobile-only interactive-item"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            {!isOnline && (
              <div className="header-offline-badge">
                <WifiOff size={13} />
                <span className="hide-on-compact">Offline Mode</span>
                {qLen > 0 && <span className="font-mono">({qLen})</span>}
              </div>
            )}
            {isSyncing && (
              <div className="header-syncing">
                <RefreshCw size={13} className="spin-anim" />
                <span className="hide-on-compact">Syncing…</span>
              </div>
            )}
          </div>

          <div className="app-header-right">
            {qLen > 0 && isOnline && !isSyncing && (
              <button
                id="btn-sync-now"
                className="btn-sync interactive-item"
                onClick={syncOfflineQueue}
              >
                <ArrowUpCircle size={14} />
                <span>Sync {qLen}</span>
              </button>
            )}

            <div className="header-clock font-mono hide-on-mobile" id="header-clock">
              <Clock size={13} className="text-muted" />
              <span>{currentTime}</span>
            </div>

            <div className="header-user">
              <span className="header-user-avatar">{renderAvatar(user?.avatar, getInitials(user?.email || user?.name || ''))}</span>
              <div className="header-user-info-text hide-on-compact">
                <span className="header-user-name">{getEmployeeName(user)}</span>
                <span className={`header-role-pill ${isAdmin ? 'pill-admin' : 'pill-user'}`}>
                  {isAdmin ? 'Admin' : 'Technician'}
                </span>
              </div>
            </div>

            <button
              id="btn-header-logout"
              className="btn-header-logout interactive-item"
              onClick={logout}
              title={AUTH_BYPASS ? 'Direct Access Mode (Authentication bypassed)' : 'Sign Out'}
            >
              <LogOut size={14} />
              <span className="hide-on-mobile">{AUTH_BYPASS ? 'Open Mode' : 'Sign Out'}</span>
            </button>
          </div>
        </header>

        {/* Screen Content Protected with Admin Email Verification Guard */}
        <main className="app-content" id="main-content" role="main">
          {screenConfig.requiresAdmin ? (
            <AdminGuard onBack={() => setActiveScreen('dashboard')}>
              <Suspense fallback={<ScreenLoader />}>
                <ScreenComponent store={store} />
              </Suspense>
            </AdminGuard>
          ) : (
            <Suspense fallback={<ScreenLoader />}>
              <ScreenComponent store={store} />
            </Suspense>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        onOpenMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Floating Garden-Skills Tweaks Panel */}
      <TweaksPanel />

      {/* Sonner Toast Stack */}
      <ToastContainer toasts={toasts || []} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
