import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useNotification } from '../context/NotificationContext';
import {
  ShieldAlert,
  AlertCircle,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Lock,
  UserX,
  KeyRound,
  Gauge,
  Laptop,
  Ban,
} from 'lucide-react';
import './SecurityEvents.css';

const EVENT_TYPE_LABELS = {
  login_failed: { label: 'Login Failed', badge: 'warning', icon: UserX },
  lockout: { label: 'Account Lockout', badge: 'danger', icon: Lock },
  token_reuse: { label: 'Token Reuse', badge: 'danger', icon: KeyRound },
  rate_limit: { label: 'Rate Limit', badge: 'warning', icon: Gauge },
  new_device: { label: 'New Device', badge: 'info', icon: Laptop },
  permission_denied: { label: 'Permission Denied', badge: 'danger', icon: Ban },
};

const SecurityEvents = () => {
  const { error: notifyError } = useNotification();

  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit: 20 };
      if (typeFilter !== 'all') params.type = typeFilter;
      if (userFilter !== 'all') params.userId = userFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/security-events', { params });
      setEvents(res.data?.events || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      setStats(res.data?.stats || {});
      if (Array.isArray(res.data?.users)) {
        setUsers(res.data.users);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load security events.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, userFilter, startDate, endDate, notifyError]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleResetFilters = () => {
    setTypeFilter('all');
    setUserFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="security-events-main">
        <div className="se-header">
          <div className="se-title-group">
            <div className="se-title-row">
              <h1 className="se-title">Security Events</h1>
              <span className="se-scope-pill admin">
                <ShieldAlert size={13} />
                Admin Only
              </span>
            </div>
            <p className="se-subtitle">
              Monitor failed logins, lockouts, refresh token reuse, rate-limit violations, new device sign-ins, and access denials.
            </p>
          </div>
          <button className="se-refresh-btn" onClick={fetchEvents} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Summary Stats Grid */}
        <div className="se-stats-grid">
          <div className="se-stat-card">
            <span className="se-stat-label">Total Events</span>
            <strong className="se-stat-value">{Number(stats.totalCount || 0)}</strong>
          </div>
          <div className="se-stat-card">
            <span className="se-stat-label">Failed Logins</span>
            <strong className="se-stat-value">{Number(stats.loginFailedCount || 0)}</strong>
          </div>
          <div className="se-stat-card">
            <span className="se-stat-label">Lockouts</span>
            <strong className="se-stat-value danger">{Number(stats.lockoutCount || 0)}</strong>
          </div>
          <div className="se-stat-card">
            <span className="se-stat-label">Token Reuse</span>
            <strong className="se-stat-value danger">{Number(stats.tokenReuseCount || 0)}</strong>
          </div>
          <div className="se-stat-card">
            <span className="se-stat-label">New Devices</span>
            <strong className="se-stat-value">{Number(stats.newDeviceCount || 0)}</strong>
          </div>
          <div className="se-stat-card">
            <span className="se-stat-label">Permission Denied</span>
            <strong className="se-stat-value">{Number(stats.permissionDeniedCount || 0)}</strong>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="se-filters-card">
          <div className="se-filter-item">
            <label htmlFor="se-type">Event Type</label>
            <select
              id="se-type"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Types</option>
              <option value="login_failed">Login Failed</option>
              <option value="lockout">Lockout</option>
              <option value="token_reuse">Token Reuse</option>
              <option value="rate_limit">Rate Limit</option>
              <option value="new_device">New Device</option>
              <option value="permission_denied">Permission Denied</option>
            </select>
          </div>

          <div className="se-filter-item">
            <label htmlFor="se-user">User</label>
            <select
              id="se-user"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="se-filter-item">
            <label htmlFor="se-start">Start Date</label>
            <input
              id="se-start"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            />
          </div>

          <div className="se-filter-item">
            <label htmlFor="se-end">End Date</label>
            <input
              id="se-end"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            />
          </div>

          <button className="se-reset-btn" onClick={handleResetFilters}>
            <Filter size={14} />
            Reset
          </button>
        </div>

        {/* Content Card */}
        <div className="se-table-card">
          {loading ? (
            <div className="se-state-box">
              <RefreshCw size={24} className="spin" />
              <p>Loading security events...</p>
            </div>
          ) : error ? (
            <div className="se-state-box error">
              <AlertCircle size={24} />
              <p>{error}</p>
              <button className="se-retry-btn" onClick={fetchEvents}>
                Try Again
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="se-state-box">
              <ShieldAlert size={28} />
              <p>No security events match the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="se-table-wrap">
                <table className="se-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>User</th>
                      <th>IP Address</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const meta = EVENT_TYPE_LABELS[ev.type] || { label: ev.type, badge: 'info', icon: ShieldAlert };
                      const IconComp = meta.icon;
                      return (
                        <tr key={ev.id}>
                          <td className="se-time-cell">
                            {new Date(ev.created_at).toLocaleString()}
                          </td>
                          <td>
                            <span className={`se-badge ${meta.badge}`}>
                              <IconComp size={12} />
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            {ev.user_email ? (
                              <div className="se-user-cell">
                                <strong>{ev.user_name}</strong>
                                <span>{ev.user_email}</span>
                              </div>
                            ) : (
                              <span className="se-muted">Anonymous / Unknown</span>
                            )}
                          </td>
                          <td className="se-ip-cell">{ev.ip || '—'}</td>
                          <td className="se-details-cell">{ev.details || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="se-pagination">
                <span className="se-page-info">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="se-page-btns">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default SecurityEvents;
