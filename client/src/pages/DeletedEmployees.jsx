import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useNotification } from '../context/NotificationContext';
import {
  ArrowLeft,
  RotateCcw,
  Search,
  Building2,
  Calendar,
  AlertCircle,
  Archive,
  RefreshCw,
  Clock,
  User,
  CheckCircle,
  X,
  FileText
} from 'lucide-react';
import './DeletedEmployees.css';

const SERVER_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

const DeletedEmployees = () => {
  const { success, error: notifyError } = useNotification();
  const [deletedEmployees, setDeletedEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');

  // Restore Modal State
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Fetch departments for filter
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments');
        setDepartments(res.data);
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  // Fetch deleted employees list
  const fetchDeleted = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      const params = {};
      if (search.trim()) params.search = search.trim();
      if (departmentId !== 'all') params.department_id = departmentId;

      const res = await api.get('/employees/deleted', { params });
      setDeletedEmployees(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load deleted employees archive.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDeleted();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, departmentId]);

  // Handle Restore
  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;

    try {
      setRestoring(true);
      const res = await api.patch(`/employees/${restoreTarget.id}/restore`);
      
      // Remove restored employee from deleted list
      setDeletedEmployees((prev) => prev.filter((e) => e.id !== restoreTarget.id));
      success(res.data.message || `Employee "${restoreTarget.name}" restored successfully!`);
      setRestoreTarget(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to restore employee.';
      notifyError(msg);
    } finally {
      setRestoring(false);
    }
  };

  // Format exact tabular timestamp: YYYY-MM-DD HH:mm:ss
  const formatTimestamp = (dateString) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  };

  const relativeTime = (isoString) => {
    if (!isoString) return '';
    try {
      const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
      return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="app-container">
      <Sidebar />

      <main className="deleted-main">
        {/* Header */}
        <div className="deleted-header">
          <div>
            <h1 className="deleted-title">Deleted Employees Archive</h1>
            <p className="deleted-subtitle">
              Review soft-deleted personnel records and restore team members back to the active directory.
            </p>
          </div>

          <div className="deleted-header-actions">
            <button
              type="button"
              onClick={() => fetchDeleted(true)}
              className="btn btn-secondary"
              disabled={refreshing || loading}
              title="Refresh deleted list"
            >
              <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
              <span>Refresh</span>
            </button>

            <Link to="/employees" className="btn btn-secondary">
              <ArrowLeft size={16} />
              <span>Back to Directory</span>
            </Link>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="deleted-error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Stat Cards */}
        <div className="deleted-stats-grid">
          <div className="deleted-stat-card">
            <div className="deleted-stat-header">
              <span className="deleted-stat-label">Archived Personnel</span>
              <Archive size={16} className="deleted-stat-icon icon-archived" />
            </div>
            <div className="deleted-stat-value">{deletedEmployees.length}</div>
          </div>

          <div className="deleted-stat-card">
            <div className="deleted-stat-header">
              <span className="deleted-stat-label">Departments Represented</span>
              <Building2 size={16} className="deleted-stat-icon icon-dept" />
            </div>
            <div className="deleted-stat-value">
              {new Set(deletedEmployees.map((e) => e.department_id).filter(Boolean)).size}
            </div>
          </div>

          <div className="deleted-stat-card">
            <div className="deleted-stat-header">
              <span className="deleted-stat-label">Data Retention</span>
              <FileText size={16} className="deleted-stat-icon icon-safe" />
            </div>
            <div className="deleted-stat-value text-success">100% Intact</div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="deleted-filter-card">
          <div className="deleted-filters-wrapper">
            <div className="deleted-search-box">
              <Search size={15} className="deleted-search-icon" />
              <input
                type="text"
                placeholder="Search archived employee by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="deleted-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="deleted-search-clear"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="deleted-dept-filter">
              <Building2 size={15} className="deleted-filter-icon" />
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="deleted-dept-select"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="deleted-table-card">
          {loading ? (
            <div className="deleted-loading">
              <div className="deleted-spinner" />
              <span>Retrieving archived personnel records...</span>
            </div>
          ) : deletedEmployees.length === 0 ? (
            <div className="deleted-empty-state">
              <Archive size={36} className="deleted-empty-icon" />
              <h3 className="deleted-empty-title">
                {search || departmentId !== 'all'
                  ? 'No matching archived records'
                  : 'No archived personnel records'}
              </h3>
              <p className="deleted-empty-desc">
                {search || departmentId !== 'all'
                  ? 'No archived personnel matched your active search or department filter.'
                  : 'All employee records are active in the directory. Soft-deleted staff will appear here for safe recovery.'}
              </p>
              {(search || departmentId !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDepartmentId('all');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.75rem' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="deleted-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Contact</th>
                    <th>Deleted At</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedEmployees.map((emp) => {
                    const avatarSrc = emp.avatar_url
                      ? `${SERVER_BASE_URL}${emp.avatar_url}`
                      : null;

                    return (
                      <tr key={emp.id} className="deleted-row">
                        <td>
                          <div className="deleted-user-cell">
                            {avatarSrc ? (
                              <img
                                src={avatarSrc}
                                alt={emp.name}
                                className="deleted-user-avatar"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="deleted-avatar-initials">
                                {emp.name?.charAt(0)?.toUpperCase() || 'U'}
                              </div>
                            )}
                            <div className="deleted-user-meta">
                              <span className="deleted-user-name">{emp.name}</span>
                              <span className="deleted-user-id">ID #{emp.id}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="deleted-dept-text">
                            {emp.department_name || 'Unassigned'}
                          </span>
                        </td>

                        <td>
                          <span className="deleted-desig">{emp.designation || 'Staff'}</span>
                        </td>

                        <td>
                          <div className="deleted-contact-cell">
                            <span className="deleted-email">{emp.email}</span>
                            {emp.phone && <span className="deleted-phone">{emp.phone}</span>}
                          </div>
                        </td>

                        <td>
                          <div className="deleted-time-cell">
                            <span className="deleted-time-primary">
                              {formatTimestamp(emp.deleted_at)}
                            </span>
                            <span className="deleted-time-rel">
                              {relativeTime(emp.deleted_at)}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="deleted-status-tag">
                            <span className="deleted-status-dot"></span>
                            Archived
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setRestoreTarget(emp)}
                            className="deleted-restore-btn"
                            title={`Restore ${emp.name} to active directory`}
                          >
                            <RotateCcw size={13} strokeWidth={2} />
                            <span>Restore</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Restore Confirmation Modal */}
        {restoreTarget && (
          <div className="modal-backdrop" onClick={() => !restoring && setRestoreTarget(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="deleted-restore-modal-header">
                  <RotateCcw size={20} className="deleted-modal-icon" />
                  <div>
                    <h3 className="modal-title">Restore Employee Record</h3>
                    <p className="modal-subtitle">Reactivate personnel in the directory</p>
                  </div>
                </div>
              </div>

              <div className="modal-body-text">
                Are you sure you want to restore <strong>{restoreTarget.name}</strong> ({restoreTarget.email})?
                <p style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  This will bring the employee back into the active directory, reinstate their profile, and make them available in reports and department staff lists.
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => setRestoreTarget(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={handleConfirmRestore}
                  className="btn btn-primary"
                >
                  {restoring ? 'Restoring...' : 'Confirm Restore'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DeletedEmployees;
