import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api, { getAccessToken } from '../services/api';
import { useAuth } from './AuthContext';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';

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
    ({ type = 'info', title, message, duration = 4500, link = null }) => {
      if (!message && !title) return;

      const dedupeKey = `${type}:${title || ''}:${message || ''}`;
      const now = Date.now();
      const lastSeen = recentToastsRef.current.get(dedupeKey);

      // Deduplication: prevent identical toasts within 2500ms
      if (lastSeen && now - lastSeen < 2500) {
        return;
      }
      recentToastsRef.current.set(dedupeKey, now);

      if (recentToastsRef.current.size > 50) {
        for (const [key, timestamp] of recentToastsRef.current.entries()) {
          if (now - timestamp > 5000) {
            recentToastsRef.current.delete(key);
          }
        }
      }

      const id = `${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast = { id, type, title, message, duration, link };

      setToasts((prev) => [...prev.slice(-4), newToast]);
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

  // --- Persistent In-App Notifications ---
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Data change subscribers for dashboard & approval live updates
  const dataSubscribersRef = useRef(new Set());

  const subscribeDataChange = useCallback((callback) => {
    dataSubscribersRef.current.add(callback);
    return () => {
      dataSubscribersRef.current.delete(callback);
    };
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/notifications/unread-count');
      if (typeof res.data?.unreadCount === 'number') {
        setUnreadCount(res.data.unreadCount);
      }
    } catch (err) {
      // Ignore background refresh errors
    }
  }, [isAuthenticated]);

  const fetchNotifications = useCallback(async (params = { limit: 25 }) => {
    if (!isAuthenticated) return;
    try {
      setLoadingNotifications(true);
      const queryStr = new URLSearchParams(params).toString();
      const res = await api.get(`/notifications?${queryStr}`);
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch notifications:', err.message);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isAuthenticated]);

  // Socket Connection Management & Event Handling
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setIsSocketConnected(false);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const authToken = getAccessToken();
    fetchNotifications();

    const socket = connectSocket(authToken);
    if (!socket) return;

    const handleConnect = () => {
      setIsSocketConnected(true);
    };

    const handleDisconnect = () => {
      setIsSocketConnected(false);
    };

    const handleNewNotification = (notification) => {
      if (!notification) return;

      // Update state: prepend notification and increment unread count
      setNotifications((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
      setUnreadCount((prev) => prev + 1);

      // Trigger toast UNLESS user is already on the page the notification links to
      const currentPath = window.location.pathname;
      const targetLink = notification.link ? notification.link.split('?')[0] : null;

      if (!targetLink || currentPath !== targetLink) {
        showToast({
          type: notification.type === 'security' ? 'error' : 'info',
          title: notification.title,
          message: notification.message,
          link: notification.link,
          duration: 5000,
        });
      }
    };

    const handleDataChanged = (eventData) => {
      dataSubscribersRef.current.forEach((cb) => {
        try {
          cb(eventData);
        } catch (err) {
          console.error('[NotificationContext] Subscriber callback error:', err);
        }
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('notification:new', handleNewNotification);
    socket.on('attendance:updated', (payload) => handleDataChanged({ event: 'attendance:updated', ...payload }));
    socket.on('leave:updated', (payload) => handleDataChanged({ event: 'leave:updated', ...payload }));
    socket.on('overtime:updated', (payload) => handleDataChanged({ event: 'overtime:updated', ...payload }));

    if (socket.connected) {
      setIsSocketConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('notification:new', handleNewNotification);
      socket.off('attendance:updated');
      socket.off('leave:updated');
      socket.off('overtime:updated');
    };
  }, [isAuthenticated, fetchNotifications, showToast]);

  // Fallback Polling: if socket disconnected, poll unread count every 60s
  useEffect(() => {
    if (!isAuthenticated) return;

    // Check every 60s if socket is disconnected
    const interval = setInterval(() => {
      const socket = getSocket();
      if (!socket || !socket.connected) {
        fetchUnreadCount();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchUnreadCount]);

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
    isSocketConnected,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead,
    subscribeDataChange,
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
