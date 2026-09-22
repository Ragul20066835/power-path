import React from 'react';
import { AlertCircle, CheckCircle2, Info, X, Zap } from 'lucide-react';

/**
 * ToastNotification - Floating Glassmorphism Alert & Status Pill
 */
export function ToastNotification({ toast, onDismiss }) {
  if (!toast) return null;

  const icons = {
    error: <AlertCircle size={18} className="toast-icon text-rose-400" />,
    success: <CheckCircle2 size={18} className="toast-icon text-emerald-400" />,
    info: <Info size={18} className="toast-icon text-cyan-400" />
  };

  return (
    <div
      className={`toast-container glass-panel toast-${toast.type || 'info'} animate-slide-down`}
      role="status"
      aria-live="polite"
    >
      <div className="toast-content">
        <div className={`toast-icon-wrap toast-halo-${toast.type || 'info'}`}>
          {icons[toast.type] || icons.info}
        </div>
        <div className="toast-text-group">
          <span className="toast-title font-tech">{toast.title}</span>
          {toast.message && (
            <span className="toast-message font-sans">{toast.message}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss alert"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default ToastNotification;
