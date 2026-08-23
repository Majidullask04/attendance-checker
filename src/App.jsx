import './index.css';
import './App.css';
import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';
import SignupScreen from './auth/SignupScreen.jsx';
import PendingApproval from './auth/PendingApproval.jsx';
import { useAttendanceStore } from './store/useStore.js';
import Sidebar from './components/Sidebar.jsx';
import { ToastContainer } from './components/Toast.jsx';
import Dashboard from './screens/Dashboard.jsx';
import CheckIn from './screens/CheckIn.jsx';
import MyRecords from './screens/MyRecords.jsx';
import Team from './screens/Team.jsx';
import AuditLog from './screens/AuditLog.jsx';
import AdminApprovals from './screens/AdminApprovals.jsx';

const SCREENS = {
  dashboard: Dashboard,
  checkin: CheckIn,
  myrecords: MyRecords,
  team: Team,
  audit: AuditLog,
  approvals: AdminApprovals,
};

function AuthGate() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const { user, isLoading, pendingApproval } = useAuth();

  if (isLoading) {
    return (
      <div className="login-screen-wrap">
        <div className="login-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="live-pulse-dot" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading session…</p>
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
  
  return <AppContent />;
}

function AppContent() {
  const { user, isAdmin, logout } = useAuth();
  const store = useAttendanceStore();
  const {
    activeScreen,
    setActiveScreen,
    toasts,
    dismissToast,
    stats,
    isOnline,
    offlineQueue = [],
    isSyncing,
    syncOfflineQueue,
  } = store;

  const ScreenComponent = SCREENS[activeScreen] ?? Dashboard;
  const qLen = (offlineQueue || []).length;

  return (
    <div className="app-layout">
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        currentUser={user}
        stats={stats || {}}
        isOnline={isOnline}
        offlineQueue={qLen}
      />

      <div className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="app-header-left">
            {!isOnline && (
              <div className="header-offline-badge">
                <span className="offline-dot" /> Offline Mode
                {qLen > 0 && ` · ${qLen} queued`}
              </div>
            )}
            {isSyncing && (
              <div className="header-syncing">
                <span className="syncing-spinner" /> Syncing Records…
              </div>
            )}
          </div>

          <div className="app-header-right">
            {qLen > 0 && isOnline && !isSyncing && (
              <button
                id="btn-sync-now"
                className="btn-sync"
                onClick={syncOfflineQueue}
              >
                ↑ Sync {qLen} record{qLen > 1 ? 's' : ''}
              </button>
            )}

            <div className="header-clock font-mono" id="header-clock">
              {new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </div>

            <div className="header-user">
              <span className="header-user-avatar">{user?.avatar || '👤'}</span>
              <div className="header-user-info-text">
                <span className="header-user-name">{user?.name || user?.email}</span>
                <span className={`header-role-pill ${isAdmin ? 'pill-admin' : 'pill-user'}`}>
                  {isAdmin ? 'Admin' : 'User'}
                </span>
              </div>
            </div>

            <button
              id="btn-header-logout"
              className="btn-header-logout"
              onClick={logout}
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Screen Content */}
        <main className="app-content" id="main-content" role="main">
          <ScreenComponent store={store} />
        </main>
      </div>

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
