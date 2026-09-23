import { useState, useEffect } from 'react';
import { Sliders, X, Sparkles, Moon, Sun, Smartphone, Laptop, Zap, Shield, Eye } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ADMIN_EMAIL } from '../config/auth.js';

export default function TweaksPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('app_tweak_theme') || 'obsidian');
  const [motionMode, setMotionMode] = useState(() => localStorage.getItem('app_tweak_motion') || 'snappy');
  const [density, setDensity] = useState(() => localStorage.getItem('app_tweak_density') || 'comfortable');

  const { user, isAdmin } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_tweak_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motionMode);
    localStorage.setItem('app_tweak_motion', motionMode);
  }, [motionMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    localStorage.setItem('app_tweak_density', density);
  }, [density]);

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        className="tweaks-floating-trigger interactive-item"
        onClick={() => setIsOpen((o) => !o)}
        title="Open Design & Motion Tweaks (Garden-Skills)"
        aria-label="Open Tweaks Panel"
      >
        <Sparkles size={16} />
        <span className="tweaks-trigger-text">Tweaks</span>
      </button>

      {/* Floating Tweaks Panel */}
      {isOpen && (
        <div className="tweaks-panel-overlay" onClick={() => setIsOpen(false)}>
          <div
            className="tweaks-panel fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Design System Tweaks"
          >
            <div className="tweaks-header">
              <div className="tweaks-title-wrap">
                <Sliders size={16} className="text-accent" />
                <span className="tweaks-title">Garden-Skills Tweaks</span>
              </div>
              <button
                className="tweaks-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close Tweaks"
              >
                <X size={14} />
              </button>
            </div>

            <div className="tweaks-body">
              {/* Theme Palette */}
              <div className="tweak-section">
                <label className="tweak-label">Visual Palette</label>
                <div className="tweak-options-grid">
                  {[
                    { id: 'obsidian', label: 'Obsidian Deep' },
                    { id: 'electric', label: 'Electric Blue' },
                    { id: 'emerald', label: 'Emerald Ops' },
                    { id: 'high-contrast', label: 'Contrast Studio' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={`tweak-btn ${theme === t.id ? 'active' : ''}`}
                      onClick={() => setTheme(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion Calibration */}
              <div className="tweak-section">
                <label className="tweak-label">Motion Calibration</label>
                <div className="tweak-options-grid">
                  {[
                    { id: 'snappy', label: 'Snappy (140ms)' },
                    { id: 'fluid', label: 'Fluid Apple (240ms)' },
                    { id: 'reduced', label: 'Reduced Motion' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      className={`tweak-btn ${motionMode === m.id ? 'active' : ''}`}
                      onClick={() => setMotionMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Density */}
              <div className="tweak-section">
                <label className="tweak-label">Information Density</label>
                <div className="tweak-options-grid">
                  <button
                    className={`tweak-btn ${density === 'comfortable' ? 'active' : ''}`}
                    onClick={() => setDensity('comfortable')}
                  >
                    Comfortable (Default)
                  </button>
                  <button
                    className={`tweak-btn ${density === 'compact' ? 'active' : ''}`}
                    onClick={() => setDensity('compact')}
                  >
                    Compact (High Data)
                  </button>
                </div>
              </div>

              {/* Verified Identity Status */}
              <div className="tweak-section">
                <label className="tweak-label">Security & Auth Context</label>
                <div className="tweak-auth-badge">
                  <div className="tweak-auth-email font-mono">
                    {user?.email || 'Guest / Not Signed In'}
                  </div>
                  <div className="tweak-auth-role">
                    {isAdmin ? (
                      <span className="badge badge--success">
                        <Shield size={12} /> Verified Admin ({ADMIN_EMAIL})
                      </span>
                    ) : (
                      <span className="badge badge--neutral">
                        <Zap size={12} /> Standard Employee
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
