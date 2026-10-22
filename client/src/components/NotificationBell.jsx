import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  ExternalLink,
  ShieldAlert,
  User,
  UserCheck,
  Briefcase,
  Layers,
  Sparkles,
  Inbox
} from 'lucide-react';
import './NotificationBell.css';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const past = new Date(dateStr);
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        return <ShieldAlert size={16} className="notif-type-icon icon-security" />;
      case 'account':
        return <User size={16} className="notif-type-icon icon-account" />;
      case 'profile':
        return <UserCheck size={16} className="notif-type-icon icon-profile" />;
      case 'system':
      default:
        return <Briefcase size={16} className="notif-type-icon icon-system" />;
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
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge" title={`${unreadCount} unread notifications`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notif-popover" role="dialog" aria-modal="true" aria-label="Notifications panel">
          {/* Popover Header */}
          <div className="notif-header">
            <div className="notif-header-title-row">
              <div className="notif-title-group">
                <span className="notif-title">Notifications</span>
                {unreadCount > 0 && (
                  <span className="notif-header-count">{unreadCount} new</span>
                )}
              </div>

              <div className="notif-header-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="notif-header-btn"
                    title="Mark all notifications as read"
                  >
                    <CheckCheck size={14} />
                    <span>Read all</span>
                  </button>
                )}
                {notifications.some((n) => n.is_read) && (
                  <button
                    type="button"
                    onClick={clearRead}
                    className="notif-header-btn text-muted"
                    title="Clear all read notifications"
                  >
                    <Trash2 size={13} />
                    <span>Clear read</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="notif-tabs">
              <button
                type="button"
                className={`notif-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                className={`notif-tab ${filter === 'unread' ? 'active' : ''}`}
                onClick={() => setFilter('unread')}
              >
                Unread ({unreadCount})
              </button>
            </div>
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
                  <Inbox size={26} />
                </div>
                <p className="notif-empty-title">All caught up!</p>
                <p className="notif-empty-desc">
                  {filter === 'unread'
                    ? 'No unread notifications right now.'
                    : 'Important activity and account updates will appear here.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.is_read ? 'read' : 'unread'} ${notif.link ? 'clickable' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-item-icon-col">
                    {getTypeIcon(notif.type)}
                  </div>

                  <div className="notif-item-content">
                    <div className="notif-item-top">
                      <span className="notif-item-title">{notif.title}</span>
                      <span className="notif-item-time">{formatTimeAgo(notif.created_at)}</span>
                    </div>

                    <p className="notif-item-msg">{notif.message}</p>

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
