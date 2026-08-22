import { useState } from 'react';

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',    icon: '◉', badge: null },
  { id: 'checkin',    label: 'Check In/Out', icon: '⊙', badge: null },
  { id: 'myrecords',  label: 'My Records',   icon: '≡', badge: null },
  { id: 'team',       label: 'Team',         icon: '⊗', badge: null },
  { id: 'audit',      label: 'Audit Log',    icon: '⊡', badge: null },
];

export default function Sidebar({ activeScreen, setActiveScreen, currentUser, stats, isOnline, offlineQueue }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⚡</div>
          {!collapsed && (
            <div className="sidebar-logo-text">
              <span className="sidebar-logo-name">MrElectric</span>
              <span className="sidebar-logo-sub">Attendance</span>
            </div>
          )}
        </div>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label="Toggle sidebar">
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* User */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">{currentUser.avatar}</div>
        {!collapsed && (
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{currentUser.name}</div>
            <div className="sidebar-user-role">{currentUser.department} · {currentUser.role}</div>
          </div>
        )}
      </div>

      {/* Online indicator */}
      {!collapsed && (
        <div className={`sidebar-online-badge ${isOnline ? 'online' : 'offline'}`}>
          <span className="sidebar-online-dot" />
          {isOnline ? 'Online' : 'Offline Mode'}
          {offlineQueue > 0 && <span className="sidebar-online-queue">{offlineQueue} queued</span>}
        </div>
      )}

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const badge = item.id === 'audit' && stats.flaggedRecords > 0 ? stats.flaggedRecords : null;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`sidebar-nav-item ${activeScreen === item.id ? 'active' : ''}`}
              onClick={() => setActiveScreen(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
              {badge && <span className="sidebar-nav-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="sidebar-version">
            <span className="sidebar-version-text">v1.0.0</span>
            <span className="sidebar-version-dot" />
            <span className="sidebar-version-text">Production</span>
          </div>
        )}
      </div>
    </aside>
  );
}
