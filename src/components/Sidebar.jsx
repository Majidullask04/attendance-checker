import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Sidebar({
  activeScreen,
  setActiveScreen,
  currentUser,
  stats,
  isOnline,
  offlineQueue,
}) {
  const { logout, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◉', badge: null },
    {
      id: 'checkin',
      label: isAdmin ? 'QR Code Manager' : 'Scan & Check In',
      icon: isAdmin ? '⚡' : '⊙',
      badge: null,
    },
    { id: 'myrecords', label: 'My Records', icon: '≡', badge: null },
    ...(isAdmin
      ? [
          { id: 'approvals', label: 'Pending Approvals', icon: '👤', badge: null },
          { id: 'team', label: 'Team Overview', icon: '⊗', badge: null },
          {
            id: 'audit',
            label: 'Audit & Fraud Log',
            icon: '⊡',
            badge: stats.flaggedRecords > 0 ? stats.flaggedRecords : null,
          },
        ]
      : []),
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⚡</div>
          {!collapsed && (
            <div className="sidebar-logo-text">
              <span className="sidebar-logo-name">MrElectric</span>
              <span className="sidebar-logo-sub">Attendance Ops</span>
            </div>
          )}
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar width"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* User Identity Card */}
      {currentUser && (
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{currentUser.avatar}</div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser.name}</div>
              <div className="sidebar-user-role-wrap">
                <span className={`role-badge ${isAdmin ? 'role-badge--admin' : 'role-badge--user'}`}>
                  {isAdmin ? '👑 Admin' : '👷 Employee'}
                </span>
                <span className="sidebar-user-dept">{currentUser.department}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Online Status Badge */}
      {!collapsed && (
        <div className={`sidebar-online-badge ${isOnline ? 'online' : 'offline'}`}>
          <span className="sidebar-online-dot" />
          <span>{isOnline ? 'Network Online' : 'Offline Mode'}</span>
          {offlineQueue > 0 && (
            <span className="sidebar-online-queue">{offlineQueue} queued</span>
          )}
        </div>
      )}

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            className={`sidebar-nav-item ${activeScreen === item.id ? 'active' : ''}`}
            onClick={() => setActiveScreen(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
            {item.badge && <span className="sidebar-nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="sidebar-footer">
        <button
          id="btn-sidebar-logout"
          className="sidebar-logout-btn"
          onClick={logout}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <span className="logout-icon">⎋</span>
          {!collapsed && <span className="logout-text">Sign Out</span>}
        </button>

        {!collapsed && (
          <div className="sidebar-version">
            <span className="sidebar-version-text">v2.1 · QR Secure</span>
          </div>
        )}
      </div>
    </aside>
  );
}
