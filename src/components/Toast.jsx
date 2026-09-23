import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="toast-icon-svg text-success" size={18} strokeWidth={2.2} />,
  error: <AlertCircle className="toast-icon-svg text-danger" size={18} strokeWidth={2.2} />,
  warning: <AlertTriangle className="toast-icon-svg text-warning" size={18} strokeWidth={2.2} />,
  info: <Info className="toast-icon-svg text-info" size={18} strokeWidth={2.2} />,
};

export function ToastItem({ toast, index, total, isHovered, onDismiss }) {
  const { id, message, type = 'info' } = toast;
  const reverseIndex = total - 1 - index; // 0 is top-most
  const isTop = reverseIndex === 0;

  // Sonner stack transformation calculation
  let transformStyle = {};
  if (isHovered) {
    // Expanded view on hover
    transformStyle = {
      transform: `translateY(-${reverseIndex * 64}px) scale(1)`,
      opacity: 1,
      zIndex: 100 - reverseIndex,
    };
  } else {
    // Stacked view
    const scale = Math.max(0.82, 1 - reverseIndex * 0.06);
    const translateY = -reverseIndex * 10;
    const opacity = reverseIndex > 3 ? 0 : 1 - reverseIndex * 0.18;
    transformStyle = {
      transform: `translateY(${translateY}px) scale(${scale})`,
      opacity: opacity,
      zIndex: 100 - reverseIndex,
      pointerEvents: isTop ? 'auto' : 'none',
    };
  }

  return (
    <div
      className={`sonner-toast sonner-toast--${type} ${isTop ? 'sonner-toast--top' : ''}`}
      style={transformStyle}
      role="alert"
      aria-live="polite"
    >
      <div className="sonner-toast-content">
        <div className="sonner-icon-wrap">{ICONS[type] || ICONS.info}</div>
        <div className="sonner-message">{message}</div>
      </div>
      <button
        className="sonner-close-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts = [], onDismiss }) {
  const [isHovered, setIsHovered] = useState(false);

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="sonner-toaster-container"
      role="region"
      aria-label="Notifications"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="sonner-toast-stack">
        {toasts.map((toast, index) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            index={index}
            total={toasts.length}
            isHovered={isHovered}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

export default ToastContainer;
