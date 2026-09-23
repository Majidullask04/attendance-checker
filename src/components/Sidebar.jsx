import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  LayoutDashboard,
  QrCode,
  History,
  UserCheck,
  Users,
  ShieldAlert,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
  X,
} from 'lucide-react';

export default function Sidebar({
  activeScreen,
  setActiveScreen,
  currentUser,
  stats = {},
  isOnline,
  offlineQueue = 0,
  isMobileOpen = false,
  onCloseMobile = () => {},
}) {
  const { logout, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: <LayoutDashboard size={18} strokeWidth={2} />, 
      badge: null 
    },
    {
      id: 'checkin',
      label: isAdmin ? 'Station QR Manager' : 'Scan & Check In',
      icon: <QrCode size={18} strokeWidth={2} />,
      badge: null,
    },
    { 
      id: 'myrecords', 
      label: 'My Records', 
      icon: <History size={18} strokeWidth={2} />, 
      badge: null 
    },
    ...(isAdmin
      ? [
          { 
            id: 'approvals', 
            label: 'Pending Approvals', 
            icon: <UserCheck size={18} strokeWidth={2} />, 
            badge: null 
          },
          { 
            id: 'team', 
            label: 'Team Overview', 
            icon: <Users size={18} strokeWidth={2} />, 
            badge: null 
          },
          {
            id: 'audit',
            label: 'Audit & Fraud Log',
            icon: <ShieldAlert size={18} strokeWidth={2} />,
            badge: stats.flaggedRecords > 0 ? stats.flaggedRecords : null,
          },
        ]
      : []),
  ];

  const handleNavClick = (id) => {
    setActiveScreen(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Zap size={18} className="zap-icon" />
            </div>
            {(!collapsed || isMobileOpen) && (
              <div className="sidebar-logo-text">
                <span className="sidebar-logo-name">MrElectric</span>
                <span className="sidebar-logo-sub">Attendance Ops</span>
              </div>
            )}
          </div>
          
          {/* Desktop collapse button */}
          <button
            className="sidebar-collapse-btn desktop-only"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar width"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Mobile Close Button */}
          <button
            className="sidebar-close-mobile-btn mobile-only"
            onClick={onCloseMobile}
            aria-label="Close sidebar navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Identity Card */}
        {currentUser && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{currentUser.avatar || '👤'}</div>
            {(!collapsed || isMobileOpen) && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name" title={currentUser.name}>
                  {currentUser.name}
                </div>
                <div className="sidebar-user-role-wrap">
                  <span className={`role-badge ${isAdmin ? 'role-badge--admin' : 'role-badge--user'}`}>
                    {isAdmin ? '👑 Admin' : '👷 Technician'}
                  </span>
                  <span className="sidebar-user-dept">{currentUser.department || 'Operations'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Online Status Badge */}
        {(!collapsed || isMobileOpen) && (
          <div className={`sidebar-online-badge ${isOnline ? 'online' : 'offline'}`}>
            <span className="sidebar-online-dot" />
            <span className="sidebar-online-text">
              {isOnline ? 'Network Live' : 'Offline Mode'}
            </span>
            {offlineQueue > 0 && (
              <span className="sidebar-online-queue">{offlineQueue} queued</span>
            )}
          </div>
        )}

        {/* Navigation List */}
        <nav className="sidebar-nav" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.id)}
                title={collapsed && !isMobileOpen ? item.label : undefined}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                {(!collapsed || isMobileOpen) && <span className="sidebar-nav-label">{item.label}</span>}
                {item.badge && <span className="sidebar-nav-badge">{item.badge}</span>}
                {isActive && <span className="sidebar-active-indicator" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="sidebar-footer">
          <button
            id="btn-sidebar-logout"
            className="sidebar-logout-btn"
            onClick={logout}
            title={collapsed && !isMobileOpen ? 'Sign Out' : undefined}
          >
            <span className="logout-icon"><LogOut size={16} /></span>
            {(!collapsed || isMobileOpen) && <span className="logout-text">Sign Out</span>}
          </button>

          {(!collapsed || isMobileOpen) && (
            <div className="sidebar-version">
              <span className="sidebar-version-text">v2.3 · Neon & Google Verified</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
