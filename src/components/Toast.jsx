import { useEffect, useRef } from 'react';

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

export default function Toast({ id, message, type = 'info', onDismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.style.animation = 'toastIn 0.3s ease forwards';
  }, []);
  return (
    <div ref={ref} className={`toast toast--${type}`} role="alert" aria-live="polite">
      <span className="toast-icon">{ICONS[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-dismiss" onClick={() => onDismiss(id)} aria-label="Dismiss">✕</button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
