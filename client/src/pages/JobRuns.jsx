import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  X,
  AlertTriangle
} from 'lucide-react';
import './JobRuns.css';

const JobRuns = () => {
  const { user, isAdmin } = useAuth();
  const { success, error: notifyError } = useNotification();

  // State: Job definitions & Run Logs
  const [definitions, setDefinitions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 20 });

  // Modal State for "Run Now"
  const [selectedJobToRun, setSelectedJobToRun] = useState(null);
  const [runDate, setRunDate] = useState(new Date().toISOString().split('T')[0]);
  const [runForce, setRunForce] = useState(false);
  const [submittingRun, setSubmittingRun] = useState(false);

  // Selected error to view
  const [errorModalRun, setErrorModalRun] = useState(null);

  // Fetch Definitions
  const fetchDefinitions = useCallback(async () => {
    try {
      const res = await api.get('/jobs/definitions');
      setDefinitions(res.data.jobs || []);
    } catch (err) {
      console.error('Failed to load job definitions:', err);
    }
  }, []);

  // Fetch Job Runs
  const fetchRuns = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      setError('');
      const params = {
        page,
        limit: 20,
        status: statusFilter === 'all' ? undefined : statusFilter,
        job_name: jobFilter === 'all' ? undefined : jobFilter,
        date: dateFilter || undefined
      };
      const res = await api.get('/jobs/runs', { params });
      setRuns(res.data.runs || []);
      setPagination({
        total: res.data.total || 0,
        totalPages: res.data.totalPages || 1,
        limit: res.data.limit || 20
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load background job runs.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, statusFilter, jobFilter, dateFilter, notifyError]);

  useEffect(() => {
    if (isAdmin) {
      fetchDefinitions();
      fetchRuns();
    }
  }, [isAdmin, fetchDefinitions, fetchRuns]);

  // Handle Trigger Run Now
  const handleConfirmRunNow = async (e) => {
    e.preventDefault();
    if (!selectedJobToRun) return;

    try {
      setSubmittingRun(true);
      const res = await api.post('/jobs/run-now', {
        job_name: selectedJobToRun.name,
        date: runDate,
        force: runForce
      });

      success(res.data.message || `Job '${selectedJobToRun.label}' dispatched.`);
      setSelectedJobToRun(null);
      setRunForce(false);
      fetchRuns();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to trigger job run.');
    } finally {
      setSubmittingRun(false);
    }
  };

  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'success':
        return (
          <span className="badge-job-status success">
            <CheckCircle2 size={12} /> Success
          </span>
        );
      case 'failed':
        return (
          <span className="badge-job-status failed">
            <XCircle size={12} /> Failed
          </span>
        );
      case 'running':
      default:
        return (
          <span className="badge-job-status running">
            <RefreshCw size={12} className="animate-spin" /> Running
          </span>
        );
    }
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const s = Number(seconds);
    if (s < 1) return '< 1s';
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  if (!isAdmin) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="main-content jobs-main">
          <div className="jobs-error-banner" style={{ marginTop: 40 }}>
            <ShieldAlert size={20} />
            <span>Access Denied: Only administrators can view and manage background jobs.</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content jobs-main">
        {/* Header */}
        <header className="jobs-header">
          <div className="jobs-title-group">
            <div className="jobs-title-row">
              <h1 className="jobs-title">Automated Background Jobs</h1>
              <span className="jobs-scope-pill">
                <ShieldCheck size={12} />
                <span>Admin Task Control</span>
              </span>
            </div>
            <p className="jobs-subtitle">
              Monitor automated cron schedules, catch-up tasks, and idempotent execution history. Timezone: Asia/Karachi.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchRuns()}
            disabled={loading}
            title="Refresh execution logs"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="jobs-error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Registered Jobs Cards Grid */}
        <div className="jobs-cards-grid">
          {definitions.map((def) => (
            <div key={def.name} className="job-card">
              <div>
                <div className="job-card-top">
                  <div>
                    <h3 className="job-card-title">{def.label}</h3>
                    <div className="job-card-name">{def.name}</div>
                  </div>
                  <span className="job-card-schedule">
                    <Clock size={11} /> {def.schedule}
                  </span>
                </div>
                <p className="job-card-desc" style={{ marginTop: 8 }}>
                  {def.description}
                </p>
              </div>

              <div className="job-card-bottom">
                <button
                  type="button"
                  className="btn-run-job"
                  onClick={() => {
                    setSelectedJobToRun(def);
                    setRunDate(new Date().toISOString().split('T')[0]);
                    setRunForce(false);
                  }}
                >
                  <Play size={12} />
                  <span>Run Now</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Filters Card */}
        <div className="jobs-filter-card">
          <div className="jobs-filter-row">
            <div className="jobs-filter-group">
              <select
                className="jobs-select"
                value={jobFilter}
                onChange={(e) => {
                  setJobFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Jobs</option>
                {definitions.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.label} ({d.name})
                  </option>
                ))}
              </select>

              <input
                type="date"
                className="jobs-select"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
              />
              {dateFilter && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDateFilter('')}
                  style={{ height: 38 }}
                >
                  Clear Date
                </button>
              )}
            </div>

            <div className="jobs-status-pills">
              {['all', 'success', 'failed', 'running'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`jobs-pill-btn ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                >
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Job Runs Table */}
        <div className="jobs-table-card">
          <div className="jobs-table-scroll">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th className="jobs-th">Job Name</th>
                  <th className="jobs-th">Run Key</th>
                  <th className="jobs-th">Status</th>
                  <th className="jobs-th numeric">Attempts</th>
                  <th className="jobs-th numeric">Processed</th>
                  <th className="jobs-th numeric">Duration</th>
                  <th className="jobs-th">Started At</th>
                  <th className="jobs-th">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8">
                      <div className="jobs-loading-state">
                        <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                        <p style={{ marginTop: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          Loading job execution history...
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      <div className="jobs-empty-state">
                        <Layers size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          No execution logs found
                        </h3>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          No background runs match the selected job or status filter.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="jobs-tr">
                      <td className="jobs-td">
                        <strong style={{ color: 'var(--text-primary)' }}>{run.job_name}</strong>
                      </td>
                      <td className="jobs-td font-numeric" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {run.run_key}
                      </td>
                      <td className="jobs-td">{renderStatusBadge(run.status)}</td>
                      <td className="jobs-td numeric font-numeric">{run.attempts}</td>
                      <td className="jobs-td numeric font-numeric">
                        <strong>{run.processed_count}</strong>
                      </td>
                      <td className="jobs-td numeric font-numeric">
                        {formatDuration(run.duration_seconds)}
                      </td>
                      <td className="jobs-td font-numeric" style={{ fontSize: '0.775rem' }}>
                        {run.started_at ? run.started_at.replace('T', ' ').slice(0, 19) : '—'}
                      </td>
                      <td className="jobs-td">
                        {run.error ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#dc2626', borderColor: '#fecaca' }}
                            onClick={() => setErrorModalRun(run)}
                          >
                            <AlertTriangle size={11} /> View Error
                          </button>
                        ) : run.status === 'success' ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OK</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>In progress</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="jobs-pagination">
            <div>
              Total: <strong>{pagination.total}</strong> runs recorded
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '4px 8px' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* MODAL: RUN NOW CONFIRMATION */}
        {selectedJobToRun && (
          <div className="jobs-modal-backdrop" onClick={() => setSelectedJobToRun(null)}>
            <div className="jobs-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="jobs-modal-header">
                <h3 className="jobs-modal-title">Trigger Job: {selectedJobToRun.label}</h3>
                <button
                  type="button"
                  className="jobs-modal-close"
                  onClick={() => setSelectedJobToRun(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmRunNow}>
                <div className="jobs-modal-body">
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                    Trigger execution of <strong>{selectedJobToRun.label}</strong> (<code>{selectedJobToRun.name}</code>).
                    By default, the job runner skips if a successful run with the generated key already exists.
                  </p>

                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 4 }}>
                      Target Date (Asia/Karachi):
                    </label>
                    <input
                      type="date"
                      className="jobs-select"
                      style={{ width: '100%' }}
                      value={runDate}
                      onChange={(e) => setRunDate(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8125rem' }}>
                      <input
                        type="checkbox"
                        checked={runForce}
                        onChange={(e) => setRunForce(e.target.checked)}
                      />
                      <span><strong>Force Run</strong> (Bypass existing completed status; recorded in audit log)</span>
                    </label>
                  </div>
                </div>

                <div className="jobs-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedJobToRun(null)}
                    disabled={submittingRun}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submittingRun}>
                    {submittingRun ? 'Executing...' : 'Confirm & Run'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: VIEW ERROR DETAILS */}
        {errorModalRun && (
          <div className="jobs-modal-backdrop" onClick={() => setErrorModalRun(null)}>
            <div className="jobs-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="jobs-modal-header">
                <h3 className="jobs-modal-title">Execution Error Details</h3>
                <button
                  type="button"
                  className="jobs-modal-close"
                  onClick={() => setErrorModalRun(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="jobs-modal-body">
                <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.875rem' }}>
                  <strong>Job:</strong> {errorModalRun.job_name} ({errorModalRun.run_key})
                </div>
                <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.875rem' }}>
                  <strong>Attempts made:</strong> {errorModalRun.attempts}
                </div>
                <div
                  style={{
                    padding: 12,
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: 'var(--radius-sm)',
                    color: '#991b1b',
                    fontFamily: 'monospace',
                    fontSize: '0.8125rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {errorModalRun.error}
                </div>
              </div>

              <div className="jobs-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setErrorModalRun(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobRuns;
