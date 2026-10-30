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

const SERVER_BASE_URL = 'http://localhost:5000';

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

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  const relativeTime = (isoString) => {
    if (!isoString) return '';
    try {
      const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
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
          <div className="card deleted-stat-card">
            <div className="deleted-stat-icon warning">
              <Archive size={20} />
            </div>
            <div>
              <div className="deleted-stat-label">Archived Records</div>
              <div className="deleted-stat-value">{deletedEmployees.length}</div>
            </div>
          </div>

          <div className="card deleted-stat-card">
            <div className="deleted-stat-icon primary">
              <Building2 size={20} />
            </div>
            <div>
              <div className="deleted-stat-label">Departments Represented</div>
              <div className="deleted-stat-value">
                {new Set(deletedEmployees.map((e) => e.department_id).filter(Boolean)).size}
              </div>
            </div>
          </div>

          <div className="card deleted-stat-card deleted-info-card">
            <div className="deleted-stat-icon info">
              <FileText size={20} />
            </div>
            <div>
              <div className="deleted-stat-label">Zero Data Loss</div>
              <p className="deleted-stat-desc">
                Avatars, contact details, uploaded documents, and full audit logs remain preserved in the system.
              </p>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="card deleted-filter-card">
          <div className="deleted-filters-wrapper">
            <div className="deleted-search-box">
              <Search size={16} className="deleted-search-icon" />
              <input
                type="text"
                placeholder="Search archived employee by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              <Building2 size={16} className="deleted-filter-icon" />
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
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
        <div className="card deleted-table-card">
          {loading ? (
            <div className="deleted-loading">
              <div className="deleted-spinner" />
              <span>Loading archived records...</span>
            </div>
          ) : deletedEmployees.length === 0 ? (
            <div className="deleted-empty-state">
              <div className="deleted-empty-icon">
                <CheckCircle size={32} />
              </div>
              <h3 className="deleted-empty-title">
                {search || departmentId !== 'all'
                  ? 'No matching deleted employees'
                  : 'No deleted employees found'}
              </h3>
              <p className="deleted-empty-desc">
                {search || departmentId !== 'all'
                  ? 'Try clearing your search or department filter.'
                  : 'All employee records are active. When an employee is removed, they are safely archived here.'}
              </p>
              {(search || departmentId !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDepartmentId('all');
                  }}
                  className="btn btn-secondary"
                  style={{ marginTop: '1rem' }}
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
                    <th>Contact</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Deleted At</th>
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
                              <div className="deleted-user-placeholder">
                                <User size={16} />
                              </div>
                            )}
                            <div>
                              <div className="deleted-user-name">{emp.name}</div>
                              <div className="deleted-user-id">ID: #{emp.id}</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="deleted-contact-cell">
                            <span className="deleted-email">{emp.email}</span>
                            <span className="deleted-phone">{emp.phone}</span>
                          </div>
                        </td>

                        <td>
                          <span className="deleted-dept-badge">
                            {emp.department_name || 'Unassigned'}
                          </span>
                        </td>

                        <td>
                          <span className="deleted-desig">{emp.designation}</span>
                        </td>

                        <td>
                          <div className="deleted-time-cell">
                            <span className="deleted-time-primary">
                              {formatDate(emp.deleted_at)}
                            </span>
                            <span className="deleted-time-rel">
                              <Clock size={11} />
                              <span>{relativeTime(emp.deleted_at)}</span>
                            </span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setRestoreTarget(emp)}
                            className="btn btn-primary btn-sm deleted-restore-btn"
                            title={`Restore ${emp.name}`}
                          >
                            <RotateCcw size={14} />
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
                <div className="deleted-restore-modal-icon">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Restore Employee Record</h3>
                  <p className="modal-subtitle">Reactivate personnel in the directory</p>
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
