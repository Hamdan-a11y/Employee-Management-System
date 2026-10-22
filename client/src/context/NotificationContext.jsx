import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // --- Toasts (Ephemeral in-app feedback) ---
  const [toasts, setToasts] = useState([]);
  const recentToastsRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = 'info', title, message, duration = 4000 }) => {
      if (!message && !title) return;

      const dedupeKey = `${type}:${title || ''}:${message || ''}`;
      const now = Date.now();
      const lastSeen = recentToastsRef.current.get(dedupeKey);

      // Deduplication: prevent identical toasts within 2500ms
      if (lastSeen && now - lastSeen < 2500) {
        return;
      }
      recentToastsRef.current.set(dedupeKey, now);

      // Clean up deduplication cache periodically
      if (recentToastsRef.current.size > 50) {
        for (const [key, timestamp] of recentToastsRef.current.entries()) {
          if (now - timestamp > 5000) {
            recentToastsRef.current.delete(key);
          }
        }
      }

      const id = `${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // Keep at most 5 toasts stacked
    },
    []
  );

  const success = useCallback(
    (message, title = 'Success') => showToast({ type: 'success', title, message }),
    [showToast]
  );
  const error = useCallback(
    (message, title = 'Error') => showToast({ type: 'error', title, message, duration: 5500 }),
    [showToast]
  );
  const warning = useCallback(
    (message, title = 'Warning') => showToast({ type: 'warning', title, message }),
    [showToast]
  );
  const info = useCallback(
    (message, title = 'Notice') => showToast({ type: 'info', title, message }),
    [showToast]
  );

  // --- Persistent In-App Notifications (Notification Center) ---
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoadingNotifications(true);
      const res = await api.get('/notifications?limit=25');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch in-app notifications:', err.message);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isAuthenticated]);

  // Initial fetch and interval refresh on authentication
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      const interval = setInterval(() => {
        fetchNotifications();
      }, 45000); // Check for new notifications every 45 seconds

      return () => clearInterval(interval);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err.message);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      success('All notifications marked as read.');
    } catch (err) {
      error('Failed to mark all notifications as read.');
    }
  };

  const deleteNotification = async (id) => {
    try {
      const target = notifications.find((n) => n.id === id);
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      error('Failed to delete notification.');
    }
  };

  const clearRead = async () => {
    try {
      await api.delete('/notifications');
      setNotifications((prev) => prev.filter((n) => !n.is_read));
      success('Read notifications cleared.');
    } catch (err) {
      error('Failed to clear read notifications.');
    }
  };

  const value = {
    // Toasts
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
    // Persistent Notifications
    notifications,
    unreadCount,
    loadingNotifications,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
