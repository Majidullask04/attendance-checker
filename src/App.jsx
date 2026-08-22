import './index.css';
import './App.css';
import { useAttendanceStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import Dashboard from './screens/Dashboard';
import CheckIn from './screens/CheckIn';
import MyRecords from './screens/MyRecords';
import Team from './screens/Team';
import AuditLog from './screens/AuditLog';

const SCREENS = {
  dashboard: Dashboard,
  checkin:   CheckIn,
  myrecords: MyRecords,
  team:      Team,
  audit:     AuditLog,
};

export default function App() {
  const store = useAttendanceStore();
  const { activeScreen, setActiveScreen, toasts, dismissToast,
          currentUser, stats, isOnline, offlineQueue, isSyncing, syncOfflineQueue } = store;

  const Screen = SCREENS[activeScreen] ?? Dashboard;

  return (
    <div className="app-layout">
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        currentUser={currentUser}
        stats={stats}
        isOnline={isOnline}
        offlineQueue={offlineQueue.length}
      />

      <div className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="app-header-left">
            {!isOnline && (
              <div className="header-offline-badge">
                <span className="offline-dot" /> Offline
                {offlineQueue.length > 0 && ` · ${offlineQueue.length} queued`}
              </div>
            )}
            {isSyncing && (
              <div className="header-syncing">
                <span className="syncing-spinner" /> Syncing…
              </div>
            )}
          </div>
          <div className="app-header-right">
            {offlineQueue.length > 0 && isOnline && !isSyncing && (
              <button
                id="btn-sync-now"
                className="btn-sync"
                onClick={syncOfflineQueue}
              >
                ↑ Sync {offlineQueue.length} record{offlineQueue.length > 1 ? 's' : ''}
              </button>
            )}
            <div className="header-clock" id="header-clock">
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="header-user">
              <span className="header-user-avatar">{currentUser.avatar}</span>
              <span className="header-user-name">{currentUser.name}</span>
            </div>
          </div>
        </header>

        {/* Screen Content */}
        <main className="app-content" id="main-content" role="main">
          <Screen store={store} />
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
