import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useNotification } from '../context/NotificationContext';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  ExternalLink,
  ShieldAlert,
  User,
  UserCheck,
  Clock,
  Filter,
  RefreshCw,
  Inbox,
  AlertCircle
} from 'lucide-react';
import './Notifications.css';

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

const Notifications = () => {
  const navigate = useNavigate();
  const {
    unreadCount,
    fetchNotifications: refreshHeaderNotifs,
    subscribeDataChange
  } = useNotification();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unread'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'system' | 'profile' | 'account' | 'security'

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        page,
        limit: 15,
        status: statusFilter,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      };
      const queryStr = new URLSearchParams(params).toString();
      const res = await api.get(`/notifications?${queryStr}`);
      setItems(res.data.notifications || []);
      setTotalPages(res.data.totalPages || 1);
      setTotalCount(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refetch when live notifications arrive
  useEffect(() => {
    const unsubscribe = subscribeDataChange(() => {
      loadNotifications();
    });
    return unsubscribe;
  }, [subscribeDataChange, loadNotifications]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_read: 1 } : item))
      );
      refreshHeaderNotifs();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setItems((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
      refreshHeaderNotifs();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      refreshHeaderNotifs();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleItemClick = async (item) => {
    if (!item.is_read) {
      await handleMarkAsRead(item.id);
    }
    if (item.link) {
      navigate(item.link);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'security':
        return <ShieldAlert size={18} className="notif-type-icon text-rose-500" />;
      case 'account':
        return <User size={18} className="notif-type-icon text-indigo-500" />;
      case 'profile':
        return <UserCheck size={18} className="notif-type-icon text-amber-500" />;
      case 'system':
      default:
        return <Bell size={18} className="notif-type-icon text-sky-500" />;
    }
  };

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <div className="notif-page-container">
          {/* Header */}
          <div className="notif-page-header">
            <div>
              <h1 className="notif-page-title">Notification Center</h1>
              <p className="notif-page-subtitle">
                Real-time alerts, attendance reminders, leave updates, and system events.
              </p>
            </div>
            <div className="notif-header-actions">
              <button
                type="button"
                className="notif-btn-secondary"
                onClick={loadNotifications}
                title="Refresh"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="notif-btn-primary"
                onClick={handleMarkAllAsRead}
                disabled={items.every((n) => n.is_read)}
              >
                <CheckCheck size={16} />
                <span>Mark All as Read</span>
              </button>
            </div>
          </div>

          {/* Stat Summary Cards */}
          <div className="notif-stats-grid">
            <div className="notif-stat-card">
              <div className="notif-stat-label">Total Notifications</div>
              <div className="notif-stat-value">{totalCount}</div>
            </div>
            <div className="notif-stat-card">
              <div className="notif-stat-label">Unread Alerts</div>
              <div className="notif-stat-value text-sky-600">{unreadCount}</div>
            </div>
            <div className="notif-stat-card">
              <div className="notif-stat-label">Active Connection</div>
              <div className="notif-stat-value text-emerald-600">Real-Time</div>
            </div>
          </div>

          {/* Filter Chips Toolbar */}
          <div className="notif-filter-bar">
            <div className="notif-chip-group">
              <span className="notif-filter-label">
                <Filter size={14} /> Status:
              </span>
              <button
                type="button"
                className={`notif-filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setStatusFilter('all');
                  setPage(1);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={`notif-filter-chip ${statusFilter === 'unread' ? 'active' : ''}`}
                onClick={() => {
                  setStatusFilter('unread');
                  setPage(1);
                }}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <div className="notif-chip-group">
              <span className="notif-filter-label">Category:</span>
              {['all', 'system', 'profile', 'account', 'security'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`notif-filter-chip ${typeFilter === t ? 'active' : ''}`}
                  onClick={() => {
                    setTypeFilter(t);
                    setPage(1);
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Content States */}
          {error && (
            <div className="notif-error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="notif-page-empty">
              <div className="notif-spinner" />
              <p>Loading notification center...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="notif-page-empty">
              <div className="notif-empty-icon-wrap">
                <Inbox size={32} />
              </div>
              <h3 className="notif-empty-heading">No notifications found</h3>
              <p className="notif-empty-subtext">
                {statusFilter === 'unread'
                  ? 'You have caught up with all unread notifications.'
                  : 'You do not have any notifications matching this filter.'}
              </p>
            </div>
          ) : (
            <div className="notif-card-list">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`notif-page-item ${item.is_read ? 'is-read' : 'is-unread'} ${
                    item.link ? 'has-link' : ''
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="notif-page-item-icon">
                    {getTypeIcon(item.type)}
                  </div>

                  <div className="notif-page-item-content">
                    <div className="notif-item-header-line">
                      <h4 className="notif-page-item-title">{item.title}</h4>
                      <span className="notif-badge-pill">{item.type}</span>
                      {!item.is_read && <span className="notif-unread-dot" />}
                    </div>

                    <p className="notif-page-item-message">{item.message}</p>

                    <div className="notif-item-footer-line">
                      <span className="notif-time-badge">
                        <Clock size={12} />
                        {formatTimestamp(item.created_at)}
                      </span>
                      {item.link && (
                        <span className="notif-link-badge">
                          <span>View related record</span>
                          <ExternalLink size={12} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="notif-page-item-actions" onClick={(e) => e.stopPropagation()}>
                    {!item.is_read && (
                      <button
                        type="button"
                        className="notif-item-btn read"
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        title="Mark as read"
                      >
                        <Check size={14} />
                        <span>Read</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="notif-item-btn delete"
                      onClick={(e) => handleDelete(item.id, e)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="notif-pagination">
              <button
                type="button"
                className="notif-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="notif-page-info">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="notif-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Notifications;
