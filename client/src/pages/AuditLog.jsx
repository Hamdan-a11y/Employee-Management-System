import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  History,
  Search,
  Filter,
  PlusCircle,
  Edit3,
  Trash2,
  Clock,
  User,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  ArrowUpRight
} from 'lucide-react';
import './AuditLog.css';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [stats, setStats] = useState({ total: 0, creates: 0, updates: 0, deletes: 0 });

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch audit logs from backend
  const fetchAuditLogs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const params = {
        page,
        limit: 20,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        search: debouncedSearch.trim() || undefined
      };

      const res = await api.get('/audit-logs', { params });
      setLogs(res.data.logs || []);
      setPagination(res.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      if (res.data.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, actionFilter, debouncedSearch]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Handle action tab filter click
  const handleActionChange = (action) => {
    setActionFilter(action);
    setPage(1);
  };

  // Format relative timestamp
  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Render Action Badge
  const renderActionBadge = (action) => {
    switch (action) {
      case 'CREATE':
        return (
          <span className="audit-badge audit-badge-create">
            <PlusCircle size={13} />
            <span>CREATE</span>
          </span>
        );
      case 'UPDATE':
        return (
          <span className="audit-badge audit-badge-update">
            <Edit3 size={13} />
            <span>UPDATE</span>
          </span>
        );
      case 'DELETE':
        return (
          <span className="audit-badge audit-badge-delete">
            <Trash2 size={13} />
            <span>DELETE</span>
          </span>
        );
      case 'RESTORE':
        return (
          <span className="audit-badge audit-badge-restore">
            <RotateCcw size={13} />
            <span>RESTORE</span>
          </span>
        );
      default:
        return <span className="audit-badge">{action}</span>;
    }
  };

  return (
    <div className="app-container">
      <Sidebar />

      <main className="audit-main">
        <div className="audit-container">
          {/* Header */}
          <div className="audit-header">
            <div>
              <h1 className="audit-title">System Audit Log</h1>
              <p className="audit-subtitle">
                Immutable, chronological activity trail tracking all employee creations, modifications, and deletions.
              </p>
            </div>

            <button
              onClick={() => fetchAuditLogs(true)}
              className="btn btn-secondary audit-refresh-btn"
              disabled={refreshing || loading}
              title="Refresh logs"
            >
              <RefreshCw size={15} className={refreshing ? 'audit-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Metric Summary Cards */}
          <div className="audit-stats-grid">
            <div className="audit-stat-card">
              <div className="audit-stat-header">
                <span className="audit-stat-label">Total Audit Events</span>
                <History size={18} className="audit-stat-icon icon-total" />
              </div>
              <div className="audit-stat-value">{stats.total.toLocaleString()}</div>
              <div className="audit-stat-desc">All historical recorded actions</div>
            </div>

            <div className="audit-stat-card">
              <div className="audit-stat-header">
                <span className="audit-stat-label">Records Created</span>
                <PlusCircle size={18} className="audit-stat-icon icon-create" />
              </div>
              <div className="audit-stat-value text-success">{stats.creates.toLocaleString()}</div>
              <div className="audit-stat-desc">Personnel additions & imports</div>
            </div>

            <div className="audit-stat-card">
              <div className="audit-stat-header">
                <span className="audit-stat-label">Records Updated</span>
                <Edit3 size={18} className="audit-stat-icon icon-update" />
              </div>
              <div className="audit-stat-value text-primary">{stats.updates.toLocaleString()}</div>
              <div className="audit-stat-desc">Profile, photo & contact updates</div>
            </div>

            <div className="audit-stat-card">
              <div className="audit-stat-header">
                <span className="audit-stat-label">Records Deleted</span>
                <Trash2 size={18} className="audit-stat-icon icon-delete" />
              </div>
              <div className="audit-stat-value text-danger">{stats.deletes.toLocaleString()}</div>
              <div className="audit-stat-desc">Permanent personnel removals</div>
            </div>
          </div>

          {/* Filters & Search Card */}
          <div className="audit-filter-card">
            <div className="audit-search-wrapper">
              <Search size={16} className="audit-search-icon" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by employee, user name, email, or details..."
                className="audit-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="audit-search-clear"
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="audit-action-pills">
              <button
                type="button"
                onClick={() => handleActionChange('all')}
                className={`audit-pill-btn ${actionFilter === 'all' ? 'active' : ''}`}
              >
                All Actions
              </button>
              <button
                type="button"
                onClick={() => handleActionChange('CREATE')}
                className={`audit-pill-btn pill-create ${actionFilter === 'CREATE' ? 'active' : ''}`}
              >
                <PlusCircle size={13} />
                <span>Created</span>
              </button>
              <button
                type="button"
                onClick={() => handleActionChange('UPDATE')}
                className={`audit-pill-btn pill-update ${actionFilter === 'UPDATE' ? 'active' : ''}`}
              >
                <Edit3 size={13} />
                <span>Updated</span>
              </button>
              <button
                type="button"
                onClick={() => handleActionChange('DELETE')}
                className={`audit-pill-btn pill-delete ${actionFilter === 'DELETE' ? 'active' : ''}`}
              >
                <Trash2 size={13} />
                <span>Deleted</span>
              </button>
              <button
                type="button"
                onClick={() => handleActionChange('RESTORE')}
                className={`audit-pill-btn pill-restore ${actionFilter === 'RESTORE' ? 'active' : ''}`}
              >
                <RotateCcw size={13} />
                <span>Restored</span>
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="audit-error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Audit Logs Table */}
          <div className="audit-table-card">
            <div className="audit-table-responsive">
              <table className="audit-table">
                <thead>
                  <tr className="audit-table-head">
                    <th className="audit-th">Timestamp</th>
                    <th className="audit-th">Action</th>
                    <th className="audit-th">Employee Involved</th>
                    <th className="audit-th">Performed By</th>
                    <th className="audit-th">Details</th>
                    <th className="audit-th text-right">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="audit-table-loading">
                        <div className="audit-loading-wrapper">
                          <div className="audit-spinner"></div>
                          <span>Retrieving audit trail records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="audit-table-empty">
                        <div className="audit-empty-wrapper">
                          <History size={36} className="audit-empty-icon" />
                          <span className="audit-empty-title">No audit records found</span>
                          <span className="audit-empty-desc">
                            {search || actionFilter !== 'all'
                              ? 'No logs matched your active filter criteria. Try clearing search or filters.'
                              : 'System activity will appear here as team members create, update, or remove personnel.'}
                          </span>
                          {(search || actionFilter !== 'all') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearch('');
                                setActionFilter('all');
                              }}
                              className="btn btn-secondary btn-sm"
                            >
                              Reset Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isDeleted = log.action === 'DELETE';
                      return (
                        <tr key={log.id} className="audit-tr">
                          {/* Timestamp */}
                          <td className="audit-td">
                            <div className="audit-time-col">
                              <span className="audit-time-primary">
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              <span className="audit-date-secondary">
                                {new Date(log.created_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              <span className="audit-time-ago">{formatTimeAgo(log.created_at)}</span>
                            </div>
                          </td>

                          {/* Action Badge */}
                          <td className="audit-td">
                            {renderActionBadge(log.action)}
                          </td>

                          {/* Employee Involved */}
                          <td className="audit-td">
                            <div className="audit-emp-col">
                              {!isDeleted && log.entity_id ? (
                                <Link
                                  to={`/employees/${log.entity_id}`}
                                  className="audit-emp-name-link"
                                  title="View Employee Profile"
                                >
                                  <span>{log.employee_name}</span>
                                  <ArrowUpRight size={13} className="audit-link-icon" />
                                </Link>
                              ) : (
                                <span className="audit-emp-name font-semibold">
                                  {log.employee_name}
                                </span>
                              )}
                              {log.entity_id && (
                                <span className="audit-emp-id">ID #{log.entity_id}</span>
                              )}
                            </div>
                          </td>

                          {/* Performed By User */}
                          <td className="audit-td">
                            <div className="audit-user-col">
                              <div className="audit-user-name">
                                <User size={13} className="audit-user-icon" />
                                <span>{log.user_name}</span>
                              </div>
                              <span className="audit-user-email">{log.user_email}</span>
                            </div>
                          </td>

                          {/* Details */}
                          <td className="audit-td">
                            <div className="audit-details-text" title={log.details}>
                              {log.details || '—'}
                            </div>
                          </td>

                          {/* IP Address */}
                          <td className="audit-td text-right">
                            <span className="audit-ip-chip">
                              {log.ip_address || 'Internal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && logs.length > 0 && (
              <div className="audit-pagination-bar">
                <span className="audit-pagination-info">
                  Showing <strong>{(page - 1) * pagination.limit + 1}</strong> to{' '}
                  <strong>{Math.min(page * pagination.limit, pagination.total)}</strong> of{' '}
                  <strong>{pagination.total}</strong> records
                </span>

                <div className="audit-pagination-actions">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-secondary btn-sm audit-page-btn"
                  >
                    <ChevronLeft size={15} />
                    <span>Previous</span>
                  </button>

                  <span className="audit-page-indicator">
                    Page {page} of {pagination.totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                    className="btn btn-secondary btn-sm audit-page-btn"
                  >
                    <span>Next</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
