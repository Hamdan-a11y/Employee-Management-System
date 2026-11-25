import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  FileSpreadsheet,
  Download,
  RefreshCw,
  History,
  ShieldAlert,
  ArrowRight,
  X,
  Search,
  Check
} from 'lucide-react';
import './MonthlyClosing.css';

function getInitialMonth() {
  const d = new Date();
  // Default to previous month
  d.setDate(0); // last day of previous month
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const MonthlyClosing = () => {
  const { user, isAdmin, isHR } = useAuth();
  const { success, error: notifyError } = useNotification();

  const canManageClosing = Boolean(isAdmin || isHR);

  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth);
  const [loading, setLoading] = useState(false);
  const [periodStatus, setPeriodStatus] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [details, setDetails] = useState(null);
  const [searchSummary, setSearchSummary] = useState('');

  // Modals
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [overridePending, setOverridePending] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Fetch Period Data
  const fetchPeriodData = useCallback(async (month) => {
    if (!month) return;
    setLoading(true);
    try {
      // 1. Fetch Status (accessible to everyone)
      const statusRes = await api.get(`/periods/${month}/status`);
      setPeriodStatus(statusRes.data);

      // 2. Fetch Checklist & Details (Admin & HR only)
      if (canManageClosing) {
        const [checklistRes, detailsRes] = await Promise.all([
          api.get(`/periods/${month}/checklist`).catch((err) => ({ data: null })),
          api.get(`/periods/${month}/details`).catch((err) => ({ data: null })),
        ]);
        setChecklist(checklistRes.data);
        setDetails(detailsRes.data);
      }
    } catch (err) {
      console.error('Failed to load period data:', err);
      notifyError(err.response?.data?.message || 'Failed to fetch attendance period data.');
    } finally {
      setLoading(false);
    }
  }, [canManageClosing, notifyError]);

  useEffect(() => {
    fetchPeriodData(selectedMonth);
  }, [selectedMonth, fetchPeriodData]);

  // Handle Close Period
  const handleCloseConfirm = async () => {
    setSubmittingAction(true);
    try {
      const res = await api.post(`/periods/${selectedMonth}/close`, {
        override: overridePending,
        reason: actionReason,
      });
      success(`Period for ${selectedMonth} closed successfully. Payroll attendance summary generated.`);
      setShowCloseModal(false);
      setActionReason('');
      setOverridePending(false);
      fetchPeriodData(selectedMonth);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to close month.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Reopen Period
  const handleReopenConfirm = async () => {
    if (!actionReason || actionReason.trim().length < 10) {
      notifyError('A mandatory reason (minimum 10 characters) is required to reopen a closed month.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.post(`/periods/${selectedMonth}/reopen`, {
        reason: actionReason,
      });
      success(`Period for ${selectedMonth} reopened. Summaries removed and records unlocked.`);
      setShowReopenModal(false);
      setActionReason('');
      fetchPeriodData(selectedMonth);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to reopen month.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // CSV Export (authenticated via api client)
  const handleExportCSV = async () => {
    try {
      const res = await api.get(`/periods/${selectedMonth}/summary/export`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll_attendance_summary_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notifyError('Failed to export payroll attendance summary CSV.');
    }
  };

  const isClosed = periodStatus?.status === 'closed';
  const hasPendingItems = (checklist?.totalPending || 0) > 0;
  const isMonthEnded = checklist?.isMonthEnded !== false;

  // Filter summaries
  const filteredSummaries = (details?.summaries || []).filter((s) => {
    if (!searchSummary) return true;
    const q = searchSummary.toLowerCase();
    return (
      (s.employee_name && s.employee_name.toLowerCase().includes(q)) ||
      (s.department_name && s.department_name.toLowerCase().includes(q)) ||
      (s.designation && s.designation.toLowerCase().includes(q))
    );
  });

  return (
    <div className="monthly-closing-container">
      <Sidebar />
      <main className="monthly-closing-main">
        {/* Header */}
        <header className="closing-header">
          <div className="closing-title-group">
            <div className="closing-title-row">
              <h1 className="closing-title">Monthly Closing & Attendance Locking</h1>
              <span className={`closing-status-pill ${isClosed ? 'closed' : 'open'}`}>
                {isClosed ? <Lock size={14} /> : <Unlock size={14} />}
                {isClosed ? 'Period Closed' : 'Period Open'}
              </span>
            </div>
            <p className="closing-subtitle">
              Audit month-end requirements, lock attendance records against future edits, and generate verified payroll summaries.
            </p>
          </div>
        </header>

        {/* Closed Month Banner */}
        {isClosed && (
          <div className="closed-banner">
            <ShieldAlert size={22} className="closed-banner-icon" />
            <div className="closed-banner-content">
              <h4>Attendance Records Are Locked for {selectedMonth}</h4>
              <p>
                This attendance period was closed on {details?.period?.closed_at ? new Date(details.period.closed_at).toLocaleDateString() : ''}.
                All check-ins, check-outs, corrections, overtime requests, and leave approvals for this month are locked.
              </p>
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className="closing-controls-bar">
          <div className="closing-month-selector">
            <label htmlFor="period-month">Select Month:</label>
            <input
              id="period-month"
              type="month"
              className="closing-month-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
            <button
              type="button"
              className="btn-reopen-period"
              style={{ padding: '8px 12px', border: '1px solid #cbd5e1', color: '#475569' }}
              onClick={() => fetchPeriodData(selectedMonth)}
              title="Refresh period status"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {canManageClosing && (
            <div className="closing-actions-group">
              {!isClosed ? (
                <button
                  type="button"
                  className="btn-close-period"
                  onClick={() => setShowCloseModal(true)}
                  disabled={loading}
                >
                  <Lock size={16} />
                  Close Month
                </button>
              ) : (
                isAdmin && (
                  <button
                    type="button"
                    className="btn-reopen-period"
                    onClick={() => setShowReopenModal(true)}
                    disabled={loading}
                  >
                    <Unlock size={16} />
                    Reopen Month (Admin)
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Regular Employee / Manager Notice if not Admin/HR */}
        {!canManageClosing && (
          <div className="checklist-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>
              Attendance Period Status: <strong>{isClosed ? 'CLOSED' : 'OPEN'}</strong>
            </h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9375rem' }}>
              {isClosed
                ? 'Attendance and overtime for this month have been finalized and locked by HR. No further modifications can be submitted.'
                : 'This month is currently open for attendance check-ins, check-outs, and correction requests.'}
            </p>
          </div>
        )}

        {/* Admin & HR Checklist & Details */}
        {canManageClosing && (
          <>
            {/* Checklist Card */}
            <div className="checklist-card">
              <div className="checklist-card-header">
                <h3 className="checklist-card-title">
                  <CheckCircle2 size={20} color="#3b82f6" />
                  Review Before Closing Checklist
                </h3>
                <span
                  className={`checklist-ready-badge ${
                    checklist?.isReady ? 'ready' : 'pending'
                  }`}
                >
                  {checklist?.isReady ? 'Ready to Close' : `${checklist?.totalPending || 0} Pending Items`}
                </span>
              </div>

              {!isMonthEnded && (
                <div className="modal-warning-box" style={{ marginBottom: '16px' }}>
                  <strong>Month In Progress:</strong> This month has not ended yet. Monthly closing is only permitted once the calendar month has fully concluded.
                </div>
              )}

              <div className="checklist-grid">
                {/* 1. Pending Corrections */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.pending_corrections?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Pending Corrections</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.pending_corrections?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.pending_corrections?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Attendance corrections awaiting review.</p>
                    <Link
                      to={checklist?.checklist?.pending_corrections?.link || '/attendance?tab=corrections'}
                      className="checklist-fix-link"
                    >
                      Review corrections <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* 2. Pending Overtime */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.pending_overtime?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Pending Overtime</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.pending_overtime?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.pending_overtime?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Overtime requests awaiting manager approval.</p>
                    <Link
                      to={checklist?.checklist?.pending_overtime?.link || '/overtime'}
                      className="checklist-fix-link"
                    >
                      Review overtime <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* 3. Pending Leaves */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.pending_leaves?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Pending Leave Requests</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.pending_leaves?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.pending_leaves?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Leaves overlapping the month awaiting approval.</p>
                    <Link
                      to={checklist?.checklist?.pending_leaves?.link || '/leaves'}
                      className="checklist-fix-link"
                    >
                      Review leaves <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* 4. Missing Check-outs */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.missing_checkouts?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Missing Check-outs</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.missing_checkouts?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.missing_checkouts?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Open punches with no check-out recorded.</p>
                    <Link
                      to={checklist?.checklist?.missing_checkouts?.link || '/attendance'}
                      className="checklist-fix-link"
                    >
                      View attendance <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* 5. Unrun mark_absent */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.unrun_mark_absent_days?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Unrun Mark Absent Days</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.unrun_mark_absent_days?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.unrun_mark_absent_days?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Past days where mark_absent job has not executed.</p>
                    <Link
                      to={checklist?.checklist?.unrun_mark_absent_days?.link || '/admin/jobs'}
                      className="checklist-fix-link"
                    >
                      Run background jobs <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>

                {/* 6. Employees with No Shift */}
                <div
                  className={`checklist-item ${
                    (checklist?.checklist?.employees_no_shift?.count || 0) > 0 ? 'has-pending' : 'clean'
                  }`}
                >
                  <div className="checklist-item-info">
                    <div className="checklist-item-header">
                      <span className="checklist-item-title">Employees with No Shift</span>
                      <span
                        className={`checklist-count-chip ${
                          (checklist?.checklist?.employees_no_shift?.count || 0) > 0 ? 'danger' : 'zero'
                        }`}
                      >
                        {checklist?.checklist?.employees_no_shift?.count || 0}
                      </span>
                    </div>
                    <p className="checklist-item-desc">Active employees without an assigned shift.</p>
                    <Link
                      to={checklist?.checklist?.employees_no_shift?.link || '/shifts'}
                      className="checklist-fix-link"
                    >
                      Assign shifts <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* History Timeline */}
            {(details?.history || []).length > 0 && (
              <div className="timeline-card">
                <h3 className="timeline-title">
                  <History size={18} color="#64748b" />
                  Period History & Audit Trail
                </h3>
                <div className="timeline-list">
                  {details.history.map((h) => (
                    <div key={h.id} className="timeline-item">
                      <span className={`timeline-marker ${h.action}`} />
                      <div className="timeline-body">
                        <div className="timeline-meta">
                          <span className="timeline-action">
                            {h.action === 'override_close' ? 'Closed with Admin Override' : h.action}
                          </span>
                          <span className="timeline-user">by {h.user_name || `User #${h.user_id}`}</span>
                          <span className="timeline-time">
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </div>
                        {h.reason && (
                          <div className="timeline-reason">
                            <strong>Reason:</strong> {h.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payroll Summary Table Card */}
            {isClosed && (
              <div className="summary-card">
                <div className="summary-card-header">
                  <h3 className="summary-card-title">
                    <FileSpreadsheet size={20} color="#16a34a" />
                    Payroll Attendance Summary ({filteredSummaries.length} records)
                  </h3>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={14}
                        style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }}
                      />
                      <input
                        type="text"
                        placeholder="Search employee / dept..."
                        value={searchSummary}
                        onChange={(e) => setSearchSummary(e.target.value)}
                        style={{
                          padding: '6px 12px 6px 30px',
                          fontSize: '0.8125rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-reopen-period"
                      style={{ padding: '6px 14px', color: '#15803d', borderColor: '#86efac' }}
                      onClick={handleExportCSV}
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="summary-table-wrap">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Working</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Paid Lv</th>
                        <th>Unpaid Lv</th>
                        <th>Holidays</th>
                        <th>Lates</th>
                        <th>Late Mins</th>
                        <th>Reg OT</th>
                        <th>Wknd OT</th>
                        <th>Hol OT</th>
                        <th>Total OT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSummaries.length === 0 ? (
                        <tr>
                          <td colSpan="14" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                            No attendance summaries found matching filter.
                          </td>
                        </tr>
                      ) : (
                        filteredSummaries.map((s) => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>{s.employee_name}</td>
                            <td>{s.department_name || '-'}</td>
                            <td>{s.working_days}</td>
                            <td style={{ color: '#15803d', fontWeight: 600 }}>{s.present_days}</td>
                            <td style={{ color: s.absent_days > 0 ? '#dc2626' : 'inherit' }}>
                              {s.absent_days}
                            </td>
                            <td>{s.leave_days_paid}</td>
                            <td style={{ color: s.leave_days_unpaid > 0 ? '#ea580c' : 'inherit' }}>
                              {s.leave_days_unpaid}
                            </td>
                            <td>{s.holiday_days}</td>
                            <td>{s.late_count}</td>
                            <td>{s.late_minutes}m</td>
                            <td>{Math.round((s.approved_overtime_regular_minutes / 60) * 10) / 10}h</td>
                            <td>{Math.round((s.approved_overtime_weekend_minutes / 60) * 10) / 10}h</td>
                            <td>{Math.round((s.approved_overtime_holiday_minutes / 60) * 10) / 10}h</td>
                            <td style={{ fontWeight: 700, color: '#1e40af' }}>
                              {Math.round((s.approved_overtime_minutes / 60) * 10) / 10}h
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Close Month Modal */}
        {showCloseModal && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="modal-header">
                <h3 className="modal-title">
                  <Lock size={18} />
                  Close Attendance Period ({selectedMonth})
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowCloseModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="modal-warning-box">
                  <strong>Important:</strong> Closing the month will lock all attendance records, overtime requests, and leave approvals for {selectedMonth}.
                  It will generate the finalized <code>payroll_attendance_summary</code> rows needed for payroll processing.
                </div>

                {hasPendingItems && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem', margin: '0 0 8px 0' }}>
                      There are {checklist?.totalPending} pending checklist items.
                    </p>
                    {isAdmin ? (
                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                          <input
                            type="checkbox"
                            checked={overridePending}
                            onChange={(e) => setOverridePending(e.target.checked)}
                          />
                          Admin Override: Close despite pending checklist items
                        </label>
                        {overridePending && (
                          <div style={{ marginTop: '10px' }}>
                            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                              Override Reason (Mandatory):
                            </label>
                            <textarea
                              className="modal-textarea"
                              placeholder="Explain why this period is being closed with pending checklist items..."
                              value={actionReason}
                              onChange={(e) => setActionReason(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0 }}>
                        As an HR Manager, you cannot close a month with pending items. Please resolve all items or ask an Administrator to override.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setShowCloseModal(false)}
                  disabled={submittingAction}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-btn-confirm"
                  onClick={handleCloseConfirm}
                  disabled={submittingAction || (hasPendingItems && (!overridePending || !actionReason.trim())) || !isMonthEnded}
                >
                  {submittingAction ? 'Closing Period...' : 'Confirm & Close Month'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen Month Modal */}
        {showReopenModal && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#dc2626' }}>
                  <AlertTriangle size={18} color="#dc2626" />
                  Reopen Attendance Period ({selectedMonth})
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowReopenModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="modal-warning-box" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
                  <strong>Warning:</strong> Reopening unlocks attendance, corrections, and overtime for modifications.
                  All previously generated payroll summaries will be deleted.
                  Reopening will be rejected if payroll for this month is already Approved or Locked.
                </div>

                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Reopen Reason (Mandatory, min 10 characters):
                  </label>
                  <textarea
                    className="modal-textarea"
                    placeholder="Describe why this month must be reopened (e.g. attendance dispute or missing punches)..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setShowReopenModal(false)}
                  disabled={submittingAction}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-btn-confirm danger"
                  onClick={handleReopenConfirm}
                  disabled={submittingAction || !actionReason || actionReason.trim().length < 10}
                >
                  {submittingAction ? 'Reopening Period...' : 'Confirm & Reopen Month'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MonthlyClosing;
