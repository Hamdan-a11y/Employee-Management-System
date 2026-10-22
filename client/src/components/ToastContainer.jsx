import React, { useEffect, useState, useRef } from 'react';
import { useNotification } from '../context/NotificationContext';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X 
} from 'lucide-react';
import './ToastContainer.css';

const ToastItem = ({ toast, onDismiss }) => {
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef(Date.now());
  const remainingTimeRef = useRef(toast.duration || 4000);

  useEffect(() => {
    if (isPaused) return;

    startTimeRef.current = Date.now();
    const intervalTime = 50;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newRemaining = Math.max(0, remainingTimeRef.current - elapsed);
      const totalDuration = toast.duration || 4000;
      const pct = (newRemaining / totalDuration) * 100;
      setProgress(pct);

      if (newRemaining <= 0) {
        clearInterval(timer);
        onDismiss(toast.id);
      }
    }, intervalTime);

    return () => {
      clearInterval(timer);
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    };
  }, [isPaused, toast.id, toast.duration, onDismiss]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 size={18} className="toast-icon success" />;
      case 'error':
        return <AlertCircle size={18} className="toast-icon error" />;
      case 'warning':
        return <AlertTriangle size={18} className="toast-icon warning" />;
      case 'info':
      default:
        return <Info size={18} className="toast-icon info" />;
    }
  };

  return (
    <div
      className={`toast-item toast-${toast.type || 'info'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
    >
      <div className="toast-body">
        <div className="toast-icon-wrapper">{getIcon()}</div>
        <div className="toast-text-content">
          {toast.title && <span className="toast-title">{toast.title}</span>}
          <p className="toast-message">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="toast-close-btn"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>

      {toast.duration > 0 && (
        <div className="toast-progress-track">
          <div
            className={`toast-progress-bar toast-progress-${toast.type || 'info'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

const ToastContainer = () => {
  const { toasts, removeToast } = useNotification();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
