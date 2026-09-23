import { LayoutDashboard, QrCode, History, Users, Menu, UserCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function MobileNav({ activeScreen, setActiveScreen, onOpenMenu }) {
  const { isAdmin } = useAuth();

  return (
    <nav className="mobile-bottom-nav mobile-only" aria-label="Mobile Navigation Bar">
      <button
        className={`mobile-nav-btn interactive-item ${activeScreen === 'dashboard' ? 'active' : ''}`}
        onClick={() => setActiveScreen('dashboard')}
      >
        <LayoutDashboard size={20} />
        <span>Dashboard</span>
      </button>

      <button
        className={`mobile-nav-btn mobile-nav-btn--primary interactive-item ${activeScreen === 'checkin' ? 'active' : ''}`}
        onClick={() => setActiveScreen('checkin')}
      >
        <div className="mobile-nav-qr-glow">
          <QrCode size={22} />
        </div>
        <span>{isAdmin ? 'Station' : 'Scan'}</span>
      </button>

      <button
        className={`mobile-nav-btn interactive-item ${activeScreen === 'myrecords' ? 'active' : ''}`}
        onClick={() => setActiveScreen('myrecords')}
      >
        <History size={20} />
        <span>Records</span>
      </button>

      {isAdmin ? (
        <button
          className={`mobile-nav-btn interactive-item ${activeScreen === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveScreen('approvals')}
        >
          <UserCheck size={20} />
          <span>Approvals</span>
        </button>
      ) : (
        <button
          className="mobile-nav-btn interactive-item"
          onClick={onOpenMenu}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      )}

      {isAdmin && (
        <button
          className="mobile-nav-btn interactive-item"
          onClick={onOpenMenu}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      )}
    </nav>
  );
}
