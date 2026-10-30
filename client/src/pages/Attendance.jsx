import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  User,
  PlusCircle,
  X,
  Building2,
  Check,
  AlertCircle
} from 'lucide-react';
import './Attendance.css';

const Attendance = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee, can } = useAuth();
  const canManageAttendance = isAdmin || isHR || isDeptManager || (typeof can === 'function' && can('attendance.manage'));
  const canExport = isAdmin || isHR || (typeof can === 'function' && can('employee.export'));
  const { success, error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'logs';

  // Live Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Today's Status State
  const [todayStatus, setTodayStatus] = useState({
    hasCheckedIn: false,
    hasCheckedOut: false,
    record: null,
    employeeId: null
  });
  const [punching, setPunching] = useState(false);

  // Departments List for Filters
  const [departments, setDepartments] = useState([]);

  // ==========================================
  // 1. LOGS TAB STATE
  // ==========================================
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPagination, setLogsPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [logSearch, setLogSearch] = useState('');
  const [logDept, setLogDept] = useState('all');
  const [logStatus, setLogStatus] = useState('all');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logLimit, setLogLimit] = useState(10);

  // ==========================================
  // 2. CORRECTIONS TAB STATE
  // ==========================================
  const [corrections, setCorrections] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionStatusFilter, setCorrectionStatusFilter] = useState('all');
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    requested_check_in: '',
    requested_check_out: '',
    reason: ''
  });

  // Reject Modal State
  const [rejectModalTarget, setRejectModalTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // ==========================================
  // 3. MONTHLY REPORT TAB STATE
  // ==========================================
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();
  const [reportYear, setReportYear] = useState(currentYearNum);
  const [reportMonth, setReportMonth] = useState(currentMonthNum);
  const [reportDept, setReportDept] = useState('all');
  const [reportData, setReportData] = useState({ report: [], summary: {} });
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  // Update live clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Switch Tab
  const handleTabChange = (tabName) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabName);
    setSearchParams(next, { replace: true });
  };

  // Fetch initial departments and today's status
  useEffect(() => {
    api.get('/departments')
      .then((res) => setDepartments(res.data || []))
      .catch((err) => console.error('Failed to load departments', err));

    fetchTodayStatus();
  }, []);

  // Fetch today's punch status
  const fetchTodayStatus = async () => {
    try {
      const res = await api.get('/attendance/today');
      setTodayStatus(res.data);
    } catch (err) {
      console.error('Error fetching today status:', err);
    }
  };

  // Check In Handler
  const handleCheckIn = async () => {
    try {
      setPunching(true);
      const res = await api.post('/attendance/check-in', {});
      success(res.data.message || 'Check-in recorded successfully!');
      await fetchTodayStatus();
      if (activeTab === 'logs') fetchLogs();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check in.';
      notifyError(msg);
    } finally {
      setPunching(false);
    }
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    try {
      setPunching(true);
      const res = await api.post('/attendance/check-out', {});
      success(res.data.message || 'Check-out recorded successfully!');
      await fetchTodayStatus();
      if (activeTab === 'logs') fetchLogs();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check out.';
      notifyError(msg);
    } finally {
      setPunching(false);
    }
  };

  // ==========================================
  // FETCH LOGS
  // ==========================================
  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const params = {
        page: logPage,
        limit: logLimit
      };
      if (logSearch.trim()) params.search = logSearch.trim();
      if (logDept !== 'all') params.department_id = logDept;
      if (logStatus !== 'all') params.status = logStatus;
      if (logStartDate) params.startDate = logStartDate;
      if (logEndDate) params.endDate = logEndDate;

      const res = await api.get('/attendance/history', { params });
      setLogs(res.data.records || []);
      setLogsPagination(res.data.pagination || {
        total: 0,
        page: logPage,
        limit: logLimit,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load attendance logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [logPage, logLimit, logSearch, logDept, logStatus, logStartDate, logEndDate, notifyError]);

  useEffect(() => {
    if (activeTab === 'logs') {
      const timer = setTimeout(() => {
        fetchLogs();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchLogs]);

  // ==========================================
  // FETCH CORRECTIONS
  // ==========================================
  const fetchCorrections = useCallback(async () => {
    try {
      setCorrectionsLoading(true);
      const params = { status: correctionStatusFilter };
      const res = await api.get('/attendance/corrections', { params });
      setCorrections(res.data.corrections || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setCorrectionsLoading(false);
    }
  }, [correctionStatusFilter, notifyError]);

  useEffect(() => {
    if (activeTab === 'corrections') {
      fetchCorrections();
    }
  }, [activeTab, fetchCorrections]);

  // Submit Correction Request
  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmittingCorrection(true);
      const res = await api.post('/attendance/corrections', correctionForm);
      success(res.data.message || 'Correction request submitted!');
      setIsCorrectionModalOpen(false);
      setCorrectionForm({
        date: new Date().toISOString().split('T')[0],
        requested_check_in: '',
        requested_check_out: '',
        reason: ''
      });
      fetchCorrections();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to submit correction request.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Approve Correction
  const handleApproveCorrection = async (id) => {
    try {
      const res = await api.patch(`/attendance/corrections/${id}/approve`);
      success(res.data.message || 'Attendance correction approved!');
      fetchCorrections();
      fetchTodayStatus();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to approve correction.');
    }
  };

  // Reject Correction
  const handleConfirmReject = async () => {
    if (!rejectModalTarget) return;
    try {
      setRejecting(true);
      const res = await api.patch(`/attendance/corrections/${rejectModalTarget.id}/reject`, {
        rejection_reason: rejectReason
      });
      success(res.data.message || 'Correction request rejected.');
      setRejectModalTarget(null);
      setRejectReason('');
      fetchCorrections();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to reject correction.');
    } finally {
      setRejecting(false);
    }
  };

  // ==========================================
  // FETCH MONTHLY REPORT
  // ==========================================
  const fetchMonthlyReport = useCallback(async () => {
    try {
      setReportLoading(true);
      const params = {
        year: reportYear,
        month: reportMonth
      };
      if (reportDept !== 'all') params.department_id = reportDept;

      const res = await api.get('/attendance/report/monthly', { params });
      setReportData(res.data || { report: [], summary: {} });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load monthly attendance report.');
    } finally {
      setReportLoading(false);
    }
  }, [reportYear, reportMonth, reportDept, notifyError]);

  useEffect(() => {
    if (activeTab === 'report') {
      fetchMonthlyReport();
    }
  }, [activeTab, fetchMonthlyReport]);

  // Export Monthly Report (CSV / Excel)
  const handleExportMonthly = async (format) => {
    try {
      setExportingReport(true);
      const params = new URLSearchParams({
        year: reportYear,
        month: reportMonth
      });
      if (reportDept !== 'all') params.append('department_id', reportDept);

      const endpoint = `/attendance/report/export/${format}?${params.toString()}`;
      const res = await api.get(endpoint, { responseType: 'blob' });

      const blob = new Blob([res.data], {
        type: format === 'csv'
          ? 'text/csv;charset=utf-8;'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${reportYear}_${String(reportMonth).padStart(2, '0')}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success(`Monthly attendance report exported to ${format.toUpperCase()}!`);
    } catch (err) {
      notifyError(`Failed to export attendance report to ${format.toUpperCase()}.`);
    } finally {
      setExportingReport(false);
    }
  };

  // Format Time Helper
  const formatTimeStr = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Format Date Helper
  const formatDateStr = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate live working hours for active check-in
  const getLiveWorkedHours = () => {
    if (!todayStatus.record || !todayStatus.record.check_in) return '0.00';
    if (todayStatus.record.check_out) {
      return Number(todayStatus.record.total_hours || 0).toFixed(2);
    }
    const checkIn = new Date(todayStatus.record.check_in);
    const diffMs = currentTime.getTime() - checkIn.getTime();
    if (diffMs < 0) return '0.00';
    return (diffMs / (1000 * 60 * 60)).toFixed(2);
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content attendance-main">
        {/* Header with Title and Live Clock */}
        <div className="attendance-header">
          <div>
            <h1 className="attendance-title">Employee Attendance Management</h1>
            <p className="attendance-subtitle">
              Daily check-ins, work hour calculations, monthly aggregated reports, and correction approvals.
            </p>
          </div>

          <div className="attendance-live-clock-card">
            <Clock size={20} className="clock-icon" />
            <div className="clock-details">
              <span className="clock-time">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
              <span className="clock-date">
                {currentTime.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Punch Card for Logged In Employee */}
        <div className="card attendance-punch-card">
          <div className="punch-status-wrap">
            <div className="punch-indicator-col">
              <span className="punch-col-title">Today's Punch Status</span>
              <div className="punch-status-row">
                {!todayStatus.hasCheckedIn ? (
                  <span className="badge badge-inactive">Not Checked In</span>
                ) : !todayStatus.hasCheckedOut ? (
                  <span className="badge badge-active">
                    Checked In at {formatTimeStr(todayStatus.record?.check_in)}
                  </span>
                ) : (
                  <span className="badge badge-completed">
                    Completed Shift ({todayStatus.record?.total_hours} hrs)
                  </span>
                )}

                {todayStatus.record?.is_late ? (
                  <span className="badge badge-late" title="Arrived after 09:15 AM grace cutoff">
                    <AlertTriangle size={12} />
                    <span>Late ({todayStatus.record.late_minutes}m)</span>
                  </span>
                ) : null}

                {todayStatus.record?.is_corrected ? (
                  <span className="badge badge-corrected" title="Approved by Manager / HR">
                    <CheckCircle size={12} />
                    <span>Corrected</span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="punch-stats-col">
              <div className="punch-stat-item">
                <span className="stat-label">Check In</span>
                <span className="stat-value">{formatTimeStr(todayStatus.record?.check_in)}</span>
              </div>
              <div className="punch-stat-item">
                <span className="stat-label">Check Out</span>
                <span className="stat-value">{formatTimeStr(todayStatus.record?.check_out)}</span>
              </div>
              <div className="punch-stat-item">
                <span className="stat-label">Hours Worked</span>
                <span className="stat-value highlight">{getLiveWorkedHours()} hrs</span>
              </div>
            </div>

            <div className="punch-actions-col">
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={todayStatus.hasCheckedIn || punching}
                className="btn btn-primary punch-btn"
                title={todayStatus.hasCheckedIn ? 'Already checked in for today' : 'Check in for today'}
              >
                <LogIn size={16} />
                <span>{punching ? 'Recording...' : 'Check In'}</span>
              </button>

              <button
                type="button"
                onClick={handleCheckOut}
                disabled={!todayStatus.hasCheckedIn || todayStatus.hasCheckedOut || punching}
                className="btn btn-danger punch-btn"
                title={
                  !todayStatus.hasCheckedIn 
                    ? 'Must check in before checking out' 
                    : todayStatus.hasCheckedOut 
                      ? 'Already checked out for today' 
                      : 'Check out for today'
                }
              >
                <LogOut size={16} />
                <span>{punching ? 'Recording...' : 'Check Out'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="attendance-tabs-bar">
          <button
            type="button"
            onClick={() => handleTabChange('logs')}
            className={`attendance-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          >
            <Clock size={16} />
            <span>Attendance Logs</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('corrections')}
            className={`attendance-tab-btn ${activeTab === 'corrections' ? 'active' : ''}`}
          >
            <FileText size={16} />
            <span>Correction Requests</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('report')}
            className={`attendance-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
          >
            <Calendar size={16} />
            <span>Monthly Report</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: ATTENDANCE LOGS */}
        {/* ========================================================= */}
        {activeTab === 'logs' && (
          <div className="attendance-tab-content">
            {/* Filter Bar */}
            <div className="card attendance-filter-card">
              <div className="attendance-filters-row">
                <div className="attendance-search-box">
                  <Search size={16} className="attendance-search-icon" />
                  <input
                    type="text"
                    placeholder="Search employee name or ID..."
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value);
                      setLogPage(1);
                    }}
                    className="input attendance-search-input"
                  />
                  {logSearch && (
                    <button
                      type="button"
                      onClick={() => setLogSearch('')}
                      className="attendance-clear-btn"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {(isAdmin || isHR) && (
                  <select
                    value={logDept}
                    onChange={(e) => {
                      setLogDept(e.target.value);
                      setLogPage(1);
                    }}
                    className="select attendance-select"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}

                <select
                  value={logStatus}
                  onChange={(e) => {
                    setLogStatus(e.target.value);
                    setLogPage(1);
                  }}
                  className="select attendance-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Half Day">Half Day</option>
                </select>

                <div className="attendance-date-range">
                  <input
                    type="date"
                    value={logStartDate}
                    onChange={(e) => {
                      setLogStartDate(e.target.value);
                      setLogPage(1);
                    }}
                    className="input attendance-date-input"
                    title="From Date"
                  />
                  <span className="attendance-date-sep">to</span>
                  <input
                    type="date"
                    value={logEndDate}
                    onChange={(e) => {
                      setLogEndDate(e.target.value);
                      setLogPage(1);
                    }}
                    className="input attendance-date-input"
                    title="To Date"
                  />
                </div>

                {(logSearch || logDept !== 'all' || logStatus !== 'all' || logStartDate || logEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogSearch('');
                      setLogDept('all');
                      setLogStatus('all');
                      setLogStartDate('');
                      setLogEndDate('');
                      setLogPage(1);
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <RotateCcw size={13} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Logs Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th">Employee</th>
                      <th className="attendance-th">Department</th>
                      <th className="attendance-th">Date</th>
                      <th className="attendance-th">Check In</th>
                      <th className="attendance-th">Check Out</th>
                      <th className="attendance-th">Hours</th>
                      <th className="attendance-th">Status</th>
                      <th className="attendance-th">Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          Loading attendance records...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          No attendance records match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      logs.map((record) => (
                        <tr key={record.id} className="attendance-tr">
                          <td className="attendance-td">
                            <div className="attendance-emp-col">
                              <span className="attendance-emp-name">{record.employee_name}</span>
                              <span className="attendance-emp-id">ID #{record.employee_id}</span>
                            </div>
                          </td>
                          <td className="attendance-td">
                            {record.department_name || 'Unassigned'}
                          </td>
                          <td className="attendance-td font-medium">
                            {formatDateStr(record.date)}
                          </td>
                          <td className="attendance-td">
                            <div className="attendance-time-tag">
                              <span>{formatTimeStr(record.check_in)}</span>
                              {record.is_late ? (
                                <span className="tag-late" title={`Late by ${record.late_minutes} minutes`}>
                                  Late +{record.late_minutes}m
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="attendance-td">
                            {formatTimeStr(record.check_out)}
                          </td>
                          <td className="attendance-td">
                            <span className="hours-chip">
                              {Number(record.total_hours || 0).toFixed(2)}h
                            </span>
                          </td>
                          <td className="attendance-td">
                            <span className={`badge ${
                              record.status === 'Present' 
                                ? 'badge-active' 
                                : record.status === 'Late' 
                                  ? 'badge-late' 
                                  : 'badge-inactive'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="attendance-td">
                            {record.is_corrected ? (
                              <span className="badge badge-corrected">Corrected</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Logs Pagination Bar */}
              {!logsLoading && logsPagination.total > 0 && (
                <div className="attendance-pagination-bar">
                  <span className="attendance-pagination-info">
                    Showing <strong>{(logPage - 1) * logLimit + 1}</strong> to{' '}
                    <strong>{Math.min(logPage * logLimit, logsPagination.total)}</strong> of{' '}
                    <strong>{logsPagination.total}</strong> records
                  </span>

                  <div className="attendance-pagination-actions">
                    <select
                      value={logLimit}
                      onChange={(e) => {
                        setLogLimit(Number(e.target.value));
                        setLogPage(1);
                      }}
                      className="select attendance-page-size-select"
                    >
                      <option value={10}>10 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={!logsPagination.hasPrevPage}
                      className="btn btn-secondary btn-sm"
                    >
                      <ChevronLeft size={14} />
                      <span>Prev</span>
                    </button>

                    <span className="attendance-page-num-display">
                      Page {logPage} of {logsPagination.totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setLogPage((p) => Math.min(logsPagination.totalPages, p + 1))}
                      disabled={!logsPagination.hasNextPage}
                      className="btn btn-secondary btn-sm"
                    >
                      <span>Next</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CORRECTIONS */}
        {/* ========================================================= */}
        {activeTab === 'corrections' && (
          <div className="attendance-tab-content">
            <div className="attendance-corrections-top-actions">
              <div className="status-pill-filter">
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('all')}
                  className={`pill-btn ${correctionStatusFilter === 'all' ? 'active' : ''}`}
                >
                  All Requests
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('PENDING')}
                  className={`pill-btn ${correctionStatusFilter === 'PENDING' ? 'active' : ''}`}
                >
                  Pending
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('APPROVED')}
                  className={`pill-btn ${correctionStatusFilter === 'APPROVED' ? 'active' : ''}`}
                >
                  Approved
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('REJECTED')}
                  className={`pill-btn ${correctionStatusFilter === 'REJECTED' ? 'active' : ''}`}
                >
                  Rejected
                </button>
              </div>

              {/* Submit request button for employees */}
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(true)}
                className="btn btn-primary"
              >
                <PlusCircle size={15} />
                <span>Submit Correction Request</span>
              </button>
            </div>

            {/* Corrections Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th">Employee</th>
                      <th className="attendance-th">Target Date</th>
                      <th className="attendance-th">Requested Check-In</th>
                      <th className="attendance-th">Requested Check-Out</th>
                      <th className="attendance-th">Reason</th>
                      <th className="attendance-th">Status</th>
                      <th className="attendance-th">Reviewed By</th>
                      {canManageAttendance && <th className="attendance-th actions">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {correctionsLoading ? (
                      <tr>
                        <td colSpan={canManageAttendance ? 8 : 7} className="attendance-empty-cell">
                          Loading correction requests...
                        </td>
                      </tr>
                    ) : corrections.length === 0 ? (
                      <tr>
                        <td colSpan={canManageAttendance ? 8 : 7} className="attendance-empty-cell">
                          No correction requests found for the selected status.
                        </td>
                      </tr>
                    ) : (
                      corrections.map((corr) => (
                        <tr key={corr.id} className="attendance-tr">
                          <td className="attendance-td">
                            <div className="attendance-emp-col">
                              <span className="attendance-emp-name">{corr.employee_name}</span>
                              <span className="attendance-emp-id">ID #{corr.employee_id}</span>
                            </div>
                          </td>
                          <td className="attendance-td font-medium">
                            {formatDateStr(corr.date)}
                          </td>
                          <td className="attendance-td">
                            {formatTimeStr(corr.requested_check_in)}
                          </td>
                          <td className="attendance-td">
                            {formatTimeStr(corr.requested_check_out)}
                          </td>
                          <td className="attendance-td max-w-sm">
                            <span className="correction-reason-text" title={corr.reason}>
                              {corr.reason}
                            </span>
                            {corr.rejection_reason && (
                              <div className="correction-rejection-note">
                                <strong>Rejection note:</strong> {corr.rejection_reason}
                              </div>
                            )}
                          </td>
                          <td className="attendance-td">
                            <span className={`badge ${
                              corr.status === 'APPROVED' 
                                ? 'badge-active' 
                                : corr.status === 'REJECTED' 
                                  ? 'badge-late' 
                                  : 'badge-pending'
                            }`}>
                              {corr.status}
                            </span>
                          </td>
                          <td className="attendance-td">
                            <span className="text-muted">
                              {corr.reviewer_name ? `${corr.reviewer_name}` : 'Awaiting Review'}
                            </span>
                          </td>
                          {canManageAttendance && (
                            <td className="attendance-td actions">
                              {corr.status === 'PENDING' ? (
                                <div className="correction-actions-group">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveCorrection(corr.id)}
                                    className="btn btn-secondary btn-sm action-approve"
                                    title="Approve and apply correction"
                                  >
                                    <Check size={14} />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectModalTarget(corr);
                                      setRejectReason('');
                                    }}
                                    className="btn btn-danger btn-sm action-reject"
                                    title="Reject correction"
                                  >
                                    <X size={14} />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: MONTHLY REPORT */}
        {/* ========================================================= */}
        {activeTab === 'report' && (
          <div className="attendance-tab-content">
            {/* Report Filter & Export Bar */}
            <div className="card attendance-filter-card">
              <div className="attendance-report-toolbar">
                <div className="attendance-report-selects">
                  <div className="report-select-wrap">
                    <span className="report-select-label">Month:</span>
                    <select
                      value={reportMonth}
                      onChange={(e) => setReportMonth(Number(e.target.value))}
                      className="select"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const date = new Date(2026, m - 1, 1);
                        return (
                          <option key={m} value={m}>
                            {date.toLocaleString('default', { month: 'long' })}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="report-select-wrap">
                    <span className="report-select-label">Year:</span>
                    <select
                      value={reportYear}
                      onChange={(e) => setReportYear(Number(e.target.value))}
                      className="select"
                    >
                      {[currentYearNum - 1, currentYearNum, currentYearNum + 1].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {(isAdmin || isHR) && (
                    <div className="report-select-wrap">
                      <span className="report-select-label">Department:</span>
                      <select
                        value={reportDept}
                        onChange={(e) => setReportDept(e.target.value)}
                        className="select"
                      >
                        <option value="all">All Departments</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {canExport && (
                  <div className="attendance-report-export-btns">
                    <button
                      type="button"
                      disabled={exportingReport}
                      onClick={() => handleExportMonthly('csv')}
                      className="btn btn-secondary btn-sm"
                    >
                      <FileText size={14} className="text-indigo" />
                      <span>{exportingReport ? 'Exporting...' : 'Export CSV'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingReport}
                      onClick={() => handleExportMonthly('excel')}
                      className="btn btn-secondary btn-sm"
                    >
                      <FileSpreadsheet size={14} className="text-emerald" />
                      <span>{exportingReport ? 'Exporting...' : 'Export Excel'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="attendance-kpi-grid">
              <div className="card kpi-card">
                <span className="kpi-label">Employees Tracked</span>
                <span className="kpi-value">{reportData.summary?.totalEmployees || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Total Days Present</span>
                <span className="kpi-value text-emerald">{reportData.summary?.totalPresentDays || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Late Arrivals</span>
                <span className="kpi-value text-amber">{reportData.summary?.totalLateDays || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Total Hours Worked</span>
                <span className="kpi-value text-indigo">{reportData.summary?.totalHours || 0}h</span>
              </div>
            </div>

            {/* Report Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th">Employee</th>
                      <th className="attendance-th">Department</th>
                      <th className="attendance-th">Designation</th>
                      <th className="attendance-th">Days Present</th>
                      <th className="attendance-th">Late Days</th>
                      <th className="attendance-th">Half Days</th>
                      <th className="attendance-th">Total Hours</th>
                      <th className="attendance-th">Avg Hours / Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportLoading ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          Compiling monthly attendance report...
                        </td>
                      </tr>
                    ) : reportData.report.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          No attendance data found for the selected month and year.
                        </td>
                      </tr>
                    ) : (
                      reportData.report.map((row) => (
                        <tr key={row.employee_id} className="attendance-tr">
                          <td className="attendance-td">
                            <div className="attendance-emp-col">
                              <span className="attendance-emp-name">{row.employee_name}</span>
                              <span className="attendance-emp-id">ID #{row.employee_id}</span>
                            </div>
                          </td>
                          <td className="attendance-td">
                            {row.department_name || 'Unassigned'}
                          </td>
                          <td className="attendance-td">
                            {row.designation || '—'}
                          </td>
                          <td className="attendance-td font-medium text-emerald">
                            {row.days_present || 0}
                          </td>
                          <td className="attendance-td">
                            {row.days_late > 0 ? (
                              <span className="tag-late">{row.days_late}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="attendance-td">
                            {row.days_half_day || 0}
                          </td>
                          <td className="attendance-td font-semibold">
                            {Number(row.total_hours_worked || 0).toFixed(2)} hrs
                          </td>
                          <td className="attendance-td">
                            {Number(row.avg_hours_per_day || 0).toFixed(2)} hrs/day
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: SUBMIT CORRECTION REQUEST */}
        {/* ========================================================= */}
        {isCorrectionModalOpen && (
          <div className="modal-backdrop">
            <div className="card modal-card attendance-modal-card">
              <div className="modal-header">
                <div className="modal-icon attendance-modal-icon">
                  <PlusCircle size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Request Attendance Correction</h3>
                  <p className="modal-subtitle">
                    Submit verified timestamps and reason for manager review.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCorrectionSubmit} className="attendance-modal-form">
                <div className="form-group">
                  <label className="label">Target Date *</label>
                  <input
                    type="date"
                    required
                    value={correctionForm.date}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="input"
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="label">Requested Check-In *</label>
                    <input
                      type="datetime-local"
                      required
                      value={correctionForm.requested_check_in}
                      onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_check_in: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Requested Check-Out *</label>
                    <input
                      type="datetime-local"
                      required
                      value={correctionForm.requested_check_out}
                      onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_check_out: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Reason / Justification *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Forgot to punch out due to on-site client meeting..."
                    value={correctionForm.reason}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="input textarea"
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => setIsCorrectionModalOpen(false)}
                    disabled={submittingCorrection}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCorrection}
                    className="btn btn-primary"
                  >
                    {submittingCorrection ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: REJECT CORRECTION */}
        {/* ========================================================= */}
        {rejectModalTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon text-danger">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Reject Attendance Correction</h3>
                  <p className="modal-subtitle">
                    Specify the reason why this correction is being rejected.
                  </p>
                </div>
              </div>

              <div className="modal-body-text">
                Rejecting request from <strong>{rejectModalTarget.employee_name}</strong> for date <strong>{formatDateStr(rejectModalTarget.date)}</strong>.
              </div>

              <div className="form-group mt-3">
                <label className="label">Rejection Reason</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Timestamps could not be verified with building security logs."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="input textarea"
                />
              </div>

              <div className="modal-actions mt-4">
                <button
                  type="button"
                  onClick={() => setRejectModalTarget(null)}
                  disabled={rejecting}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={rejecting}
                  className="btn btn-danger"
                >
                  {rejecting ? 'Rejecting...' : 'Reject Correction'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Attendance;

