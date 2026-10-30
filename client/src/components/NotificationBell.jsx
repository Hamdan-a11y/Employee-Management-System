import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import {
  Bell,
  Minus,
  RotateCw,
  Check,
  X,
  ExternalLink,
  ShieldAlert,
  User,
  UserCheck,
  Briefcase,
  Inbox
} from 'lucide-react';
import './NotificationBell.css';

const formatTimestamp = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
};

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    loadingNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead,
    fetchNotifications
  } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const popoverRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    if (notif.link) {
      setIsOpen(false);
      navigate(notif.link);
    }
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'unread') return !notif.is_read;
    return true;
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'security':
        return <ShieldAlert size={18} strokeWidth={2} />;
      case 'account':
        return <User size={18} strokeWidth={2} />;
      case 'profile':
        return <UserCheck size={18} strokeWidth={2} />;
      case 'system':
      default:
        return <Bell size={18} strokeWidth={2} />;
    }
  };

  return (
    <div className="notif-bell-container" ref={popoverRef}>
      <button
        type="button"
        onClick={handleToggle}
        className={`notif-bell-btn ${isOpen ? 'active' : ''}`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <span className="notif-icon-wrap">
          <Bell size={16} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="notif-badge" title={`${unreadCount} unread notifications`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="notif-popover" role="dialog" aria-modal="true" aria-label="Notifications panel">
          {/* Header Row */}
          <div className="notif-header">
            <span className="notif-header-title">Notifications</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="notif-minimize-btn"
              title="Close panel"
              aria-label="Close notifications"
            >
              <Minus size={16} />
            </button>
          </div>

          {/* Subheader Toolbar */}
          <div className="notif-toolbar">
            <div className="notif-segmented-pill">
              <button
                type="button"
                className={`notif-pill-btn ${filter === 'unread' ? 'active' : ''}`}
                onClick={() => setFilter('unread')}
              >
                Unread
              </button>
              <button
                type="button"
                className={`notif-pill-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
            </div>

            <button
              type="button"
              onClick={markAllAsRead}
              className="notif-mark-all-btn"
              disabled={unreadCount === 0}
              aria-label="Mark all as read (read all)"
              title="Mark all notifications as read"
            >
              Mark all as read
            </button>

            <button
              type="button"
              onClick={() => fetchNotifications()}
              className="notif-refresh-icon-btn"
              title="Refresh notifications"
              aria-label="Refresh notifications"
            >
              <RotateCw size={14} className={loadingNotifications ? 'spin-icon' : ''} />
            </button>
          </div>

          {/* Notification List */}
          <div className="notif-list">
            {loadingNotifications && notifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="notif-spinner" />
                <p>Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="notif-empty-icon-wrapper">
                  <Bell size={22} strokeWidth={2} />
                </div>
                <p className="notif-empty-title">All caught up!</p>
                <p className="notif-empty-desc">
                  {filter === 'unread'
                    ? 'No unread notifications right now.'
                    : 'The instance has been successfully created and is now available to use.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.is_read ? 'read' : 'unread'} ${notif.link ? 'clickable' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-item-icon-box">
                    {getTypeIcon(notif.type)}
                  </div>

                  <div className="notif-item-body">
                    <div className="notif-item-title">{notif.title}</div>
                    <div className="notif-item-msg">{notif.message}</div>
                    <div className="notif-item-time">{formatTimestamp(notif.created_at)}</div>

                    {notif.link && (
                      <span className="notif-item-link-hint">
                        <span>View details</span>
                        <ExternalLink size={11} />
                      </span>
                    )}
                  </div>

                  <div className="notif-item-actions" onClick={(e) => e.stopPropagation()}>
                    {!notif.is_read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notif.id)}
                        className="notif-action-btn read-btn"
                        title="Mark as read"
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteNotification(notif.id)}
                      className="notif-action-btn delete-btn"
                      title="Remove notification"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
