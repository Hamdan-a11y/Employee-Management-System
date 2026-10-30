import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  PlusCircle,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  FileText,
  User,
  HeartPulse,
  Sun,
  Coffee,
  ShieldAlert
} from 'lucide-react';
import './Leaves.css';

const Leaves = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee, can } = useAuth();
  const canManageLeaves = isAdmin || isHR || isDeptManager || (typeof can === 'function' && can('leave.manage'));
  const { success, error: notifyError } = useNotification();

  // ==========================================
  // 1. STATE: LEAVE BALANCES
  // ==========================================
  const [balances, setBalances] = useState(null);
  const [balancesLoading, setBalancesLoading] = useState(true);

  // ==========================================
  // 2. STATE: REQUESTS LIST & FILTERS
  // ==========================================
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [departments, setDepartments] = useState([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // ==========================================
  // 3. STATE: REQUEST MODAL
  // ==========================================
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({
    leave_type: 'Annual',
    start_date: '',
    end_date: '',
    reason: '',
  });

  // ==========================================
  // 4. STATE: REJECT MODAL
  // ==========================================
  const [rejectModalTarget, setRejectModalTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Fetch Departments for Admin & HR filter
  useEffect(() => {
    if (isAdmin || isHR) {
      api.get('/departments')
        .then((res) => setDepartments(res.data || []))
        .catch((err) => console.error('Failed to load departments', err));
    }
  }, [isAdmin, isHR]);

  // Fetch Balances
  const fetchBalances = useCallback(async () => {
    try {
      setBalancesLoading(true);
      const res = await api.get('/leaves/balances');
      setBalances(res.data);
    } catch (err) {
      console.error('Failed to load leave balances', err);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  // Fetch Requests
  const fetchRequests = useCallback(async () => {
    try {
      setRequestsLoading(true);
      const params = { page, limit };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.leave_type = typeFilter;
      if (departmentFilter !== 'all') params.department_id = departmentFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const res = await api.get('/leaves/requests', { params });
      setRequests(res.data.requests || []);
      setPagination(res.data.pagination || {
        total: 0,
        page,
        limit,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load leave requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, [page, limit, statusFilter, typeFilter, departmentFilter, searchTerm]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Compute live duration for the request modal
  const computeDurationDays = () => {
    if (!requestForm.start_date || !requestForm.end_date) return 0;
    const s = new Date(requestForm.start_date);
    const e = new Date(requestForm.end_date);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return 0;
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(0, diff);
  };

  const calculatedDays = computeDurationDays();

  // Get available days for selected leave type
  const getSelectedTypeRemaining = () => {
    if (!balances) return null;
    const typeKey = requestForm.leave_type.toLowerCase();
    if (balances[typeKey]) {
      return balances[typeKey].remaining;
    }
    return null;
  };

  const selectedTypeRemaining = getSelectedTypeRemaining();
  const isInsufficient = selectedTypeRemaining !== null && calculatedDays > selectedTypeRemaining;

  // Handle Request Submission
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (calculatedDays <= 0) {
      notifyError('Start date must be on or before end date.');
      return;
    }

    if (isInsufficient) {
      notifyError(`Insufficient leave balance. You have ${selectedTypeRemaining} days available.`);
      return;
    }

    try {
      setSubmittingRequest(true);
      const res = await api.post('/leaves/requests', requestForm);
      success(res.data.message || 'Leave request submitted successfully!');
      setIsRequestModalOpen(false);
      setRequestForm({
        leave_type: 'Annual',
        start_date: '',
        end_date: '',
        reason: '',
      });
      fetchRequests();
      fetchBalances();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to submit leave request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Handle Approve Request
  const handleApprove = async (requestId) => {
    try {
      const res = await api.patch(`/leaves/requests/${requestId}/approve`);
      success(res.data.message || 'Leave request approved!');
      fetchRequests();
      fetchBalances();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to approve leave request.');
    }
  };

  // Handle Confirm Reject
  const handleConfirmReject = async () => {
    if (!rejectModalTarget) return;
    try {
      setRejecting(true);
      const res = await api.patch(`/leaves/requests/${rejectModalTarget.id}/reject`, {
        rejection_reason: rejectReason,
      });
      success(res.data.message || 'Leave request rejected.');
      setRejectModalTarget(null);
      setRejectReason('');
      fetchRequests();
      fetchBalances();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to reject leave request.');
    } finally {
      setRejecting(false);
    }
  };

  // Handle Cancel Request (by employee)
  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this pending leave request?')) return;
    try {
      const res = await api.delete(`/leaves/requests/${requestId}`);
      success(res.data.message || 'Leave request cancelled.');
      fetchRequests();
      fetchBalances();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to cancel leave request.');
    }
  };

  // Helper for Leave Type Badges
  const renderLeaveTypeBadge = (type) => {
    switch (type) {
      case 'Annual':
        return <span className="badge badge-annual"><Sun size={12} /> Annual</span>;
      case 'Sick':
        return <span className="badge badge-sick"><HeartPulse size={12} /> Sick</span>;
      case 'Casual':
        return <span className="badge badge-casual"><Coffee size={12} /> Casual</span>;
      case 'Maternity':
      case 'Paternity':
        return <span className="badge badge-parental"><HeartPulse size={12} /> {type}</span>;
      default:
        return <span className="badge badge-unpaid">{type}</span>;
    }
  };

  // Helper for Status Badges
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge badge-active"><CheckCircle size={12} /> Approved</span>;
      case 'REJECTED':
        return <span className="badge badge-inactive"><XCircle size={12} /> Rejected</span>;
      case 'PENDING':
      default:
        return <span className="badge badge-pending"><Clock size={12} /> Pending</span>;
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content leaves-main">
        {/* Header */}
        <div className="leaves-header">
          <div>
            <h1 className="leaves-title">Leave Management & Approvals</h1>
            <p className="leaves-subtitle">
              Submit leave requests, track remaining allowances, and review manager approvals.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="btn btn-primary"
          >
            <PlusCircle size={16} />
            <span>Request Leave</span>
          </button>
        </div>

        {/* Leave Balance Overview Cards */}
        {balances && (
          <div className="leaves-balance-grid">
            <div className="card balance-card">
              <div className="balance-icon-wrap bg-emerald-soft">
                <Sun size={20} className="text-emerald" />
              </div>
              <div className="balance-details">
                <span className="balance-type-label">Annual Leave</span>
                <div className="balance-metric-row">
                  <span className="balance-highlight text-emerald">
                    {balances.annual?.remaining} <small>days left</small>
                  </span>
                  <span className="balance-used-text">
                    {balances.annual?.used} / {balances.annual?.total} used
                  </span>
                </div>
                <div className="balance-progress-bar">
                  <div
                    className="balance-progress-fill bg-emerald"
                    style={{
                      width: `${Math.min(100, ((balances.annual?.used || 0) / (balances.annual?.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card balance-card">
              <div className="balance-icon-wrap bg-amber-soft">
                <HeartPulse size={20} className="text-amber" />
              </div>
              <div className="balance-details">
                <span className="balance-type-label">Sick Leave</span>
                <div className="balance-metric-row">
                  <span className="balance-highlight text-amber">
                    {balances.sick?.remaining} <small>days left</small>
                  </span>
                  <span className="balance-used-text">
                    {balances.sick?.used} / {balances.sick?.total} used
                  </span>
                </div>
                <div className="balance-progress-bar">
                  <div
                    className="balance-progress-fill bg-amber"
                    style={{
                      width: `${Math.min(100, ((balances.sick?.used || 0) / (balances.sick?.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card balance-card">
              <div className="balance-icon-wrap bg-indigo-soft">
                <Coffee size={20} className="text-indigo" />
              </div>
              <div className="balance-details">
                <span className="balance-type-label">Casual Leave</span>
                <div className="balance-metric-row">
                  <span className="balance-highlight text-indigo">
                    {balances.casual?.remaining} <small>days left</small>
                  </span>
                  <span className="balance-used-text">
                    {balances.casual?.used} / {balances.casual?.total} used
                  </span>
                </div>
                <div className="balance-progress-bar">
                  <div
                    className="balance-progress-fill bg-indigo"
                    style={{
                      width: `${Math.min(100, ((balances.casual?.used || 0) / (balances.casual?.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="card balance-card total-card">
              <div className="balance-icon-wrap bg-primary-soft">
                <Calendar size={20} className="text-primary" />
              </div>
              <div className="balance-details">
                <span className="balance-type-label">Total Remaining Allowance</span>
                <div className="balance-metric-row">
                  <span className="balance-highlight text-primary">
                    {balances.totalRemaining} <small>days available</small>
                  </span>
                  <span className="balance-used-text">
                    {balances.totalUsed} days taken
                  </span>
                </div>
                <div className="balance-progress-bar">
                  <div
                    className="balance-progress-fill bg-primary"
                    style={{
                      width: `${Math.min(100, ((balances.totalUsed || 0) / (balances.totalAllocated || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Action Bar */}
        <div className="card leaves-filter-card">
          <div className="leaves-filter-row">
            {/* Status Pills */}
            <div className="leaves-status-pills">
              <button
                type="button"
                onClick={() => { setStatusFilter('all'); setPage(1); }}
                className={`pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
              >
                All Requests
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('PENDING'); setPage(1); }}
                className={`pill-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('APPROVED'); setPage(1); }}
                className={`pill-btn ${statusFilter === 'APPROVED' ? 'active' : ''}`}
              >
                Approved
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('REJECTED'); setPage(1); }}
                className={`pill-btn ${statusFilter === 'REJECTED' ? 'active' : ''}`}
              >
                Rejected
              </button>
            </div>

            {/* Leave Type Select */}
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="select leaves-type-select"
            >
              <option value="all">All Leave Types</option>
              <option value="Annual">Annual Leave</option>
              <option value="Sick">Sick Leave</option>
              <option value="Casual">Casual Leave</option>
              <option value="Maternity">Maternity</option>
              <option value="Paternity">Paternity</option>
              <option value="Unpaid">Unpaid Leave</option>
            </select>

            {/* Manager / Admin Filters: Search and Department */}
            {canManageLeaves && (
              <>
                <div className="leaves-search-box">
                  <Search size={16} className="leaves-search-icon" />
                  <input
                    type="text"
                    placeholder="Search employee name or ID..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    className="input leaves-search-input"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(''); setPage(1); }}
                      className="leaves-clear-btn"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {(isAdmin || isHR) && departments.length > 0 && (
                  <select
                    value={departmentFilter}
                    onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                    className="select leaves-dept-select"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        {/* Requests Table */}
        <div className="card leaves-table-card">
          <div className="leaves-table-scroll">
            <table className="leaves-table">
              <thead>
                <tr className="leaves-thead">
                  {canManageLeaves && <th className="leaves-th">Employee</th>}
                  <th className="leaves-th">Leave Type</th>
                  <th className="leaves-th">Dates</th>
                  <th className="leaves-th">Duration</th>
                  <th className="leaves-th">Reason</th>
                  <th className="leaves-th">Status</th>
                  <th className="leaves-th">Reviewed By</th>
                  <th className="leaves-th actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requestsLoading ? (
                  <tr>
                    <td colSpan={canManageLeaves ? 8 : 7} className="leaves-empty-cell">
                      Loading leave requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={canManageLeaves ? 8 : 7} className="leaves-empty-cell">
                      No leave requests found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id} className="leaves-tr">
                      {canManageLeaves && (
                        <td className="leaves-td">
                          <div className="leaves-emp-col">
                            <span className="leaves-emp-name">{req.employee_name}</span>
                            <span className="leaves-emp-id">{req.employee_code || `#${req.employee_id}`} · {req.department_name || 'Unassigned'}</span>
                          </div>
                        </td>
                      )}
                      <td className="leaves-td">
                        {renderLeaveTypeBadge(req.leave_type)}
                      </td>
                      <td className="leaves-td font-medium">
                        {req.start_date} <span className="text-muted">to</span> {req.end_date}
                      </td>
                      <td className="leaves-td">
                        <span className="duration-chip">
                          {req.days_count} {req.days_count === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                      <td className="leaves-td max-w-sm">
                        <span className="leaves-reason-text" title={req.reason}>
                          {req.reason}
                        </span>
                        {req.rejection_reason && (
                          <div className="leaves-rejection-note">
                            <strong>Rejection Note:</strong> {req.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="leaves-td">
                        {renderStatusBadge(req.status)}
                      </td>
                      <td className="leaves-td">
                        <span className="text-muted">
                          {req.reviewer_name ? req.reviewer_name : 'Awaiting Review'}
                        </span>
                      </td>
                      <td className="leaves-td actions">
                        {canManageLeaves && req.status === 'PENDING' ? (
                          <div className="leaves-actions-group">
                            <button
                              type="button"
                              onClick={() => handleApprove(req.id)}
                              className="btn btn-secondary btn-sm action-approve"
                              title="Approve leave request"
                            >
                              <Check size={14} />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalTarget(req);
                                setRejectReason('');
                              }}
                              className="btn btn-danger btn-sm action-reject"
                              title="Reject leave request"
                            >
                              <X size={14} />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : !canManageLeaves && req.status === 'PENDING' ? (
                          <button
                            type="button"
                            onClick={() => handleCancelRequest(req.id)}
                            className="btn btn-secondary btn-sm"
                            title="Cancel pending request"
                          >
                            <span>Cancel</span>
                          </button>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {!requestsLoading && pagination.total > 0 && (
            <div className="leaves-pagination-bar">
              <span className="leaves-pagination-info">
                Showing <strong>{(page - 1) * limit + 1}</strong> to{' '}
                <strong>{Math.min(page * limit, pagination.total)}</strong> of{' '}
                <strong>{pagination.total}</strong> requests
              </span>

              <div className="leaves-pagination-actions">
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="select leaves-page-size-select"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!pagination.hasPrevPage}
                  className="btn btn-secondary btn-sm"
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>

                <span className="leaves-page-num-display">
                  Page {page} of {pagination.totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={!pagination.hasNextPage}
                  className="btn btn-secondary btn-sm"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* MODAL 1: REQUEST LEAVE */}
        {/* ========================================================= */}
        {isRequestModalOpen && (
          <div className="modal-backdrop">
            <div className="card modal-card leaves-modal-card">
              <div className="modal-header">
                <div className="modal-icon leaves-modal-icon">
                  <Calendar size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Request Time Off</h3>
                  <p className="modal-subtitle">
                    Select leave type and dates for manager review.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRequestSubmit} className="leaves-modal-form">
                {/* Leave Type & Balance Indicator */}
                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="leave_type_select" className="label">Leave Type *</label>
                    {selectedTypeRemaining !== null && (
                      <span className={`balance-badge ${isInsufficient ? 'text-danger' : 'text-emerald'}`}>
                        {selectedTypeRemaining} day(s) available
                      </span>
                    )}
                  </div>
                  <select
                    id="leave_type_select"
                    value={requestForm.leave_type}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, leave_type: e.target.value }))}
                    className="select"
                    required
                  >
                    <option value="Annual">Annual Leave (Vacation)</option>
                    <option value="Sick">Sick Leave (Medical)</option>
                    <option value="Casual">Casual Leave (Personal / Urgent)</option>
                    <option value="Maternity">Maternity Leave</option>
                    <option value="Paternity">Paternity Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                  </select>
                </div>

                {/* Date Pickers */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="start_date_input" className="label">Start Date *</label>
                    <input
                      id="start_date_input"
                      type="date"
                      required
                      value={requestForm.start_date}
                      onChange={(e) => setRequestForm((prev) => ({ ...prev, start_date: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="end_date_input" className="label">End Date *</label>
                    <input
                      id="end_date_input"
                      type="date"
                      required
                      min={requestForm.start_date || undefined}
                      value={requestForm.end_date}
                      onChange={(e) => setRequestForm((prev) => ({ ...prev, end_date: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>

                {/* Dynamic Calculated Duration Chip */}
                {calculatedDays > 0 && (
                  <div className={`duration-banner ${isInsufficient ? 'duration-danger' : 'duration-success'}`}>
                    <Calendar size={16} />
                    <span>
                      Total Duration: <strong>{calculatedDays} {calculatedDays === 1 ? 'day' : 'days'}</strong>
                      {isInsufficient && ' (Exceeds available balance!)'}
                    </span>
                  </div>
                )}

                {/* Reason Textarea */}
                <div className="form-group">
                  <label htmlFor="leave_reason_input" className="label">Reason / Justification *</label>
                  <textarea
                    id="leave_reason_input"
                    rows={3}
                    required
                    placeholder="Provide a brief explanation for your leave request..."
                    value={requestForm.reason}
                    onChange={(e) => setRequestForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="input textarea"
                  />
                </div>

                <div className="modal-actions mt-4">
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(false)}
                    disabled={submittingRequest}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRequest || isInsufficient}
                    className="btn btn-primary"
                  >
                    {submittingRequest ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 2: REJECT LEAVE */}
        {/* ========================================================= */}
        {rejectModalTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon text-danger">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Reject Leave Request</h3>
                  <p className="modal-subtitle">
                    Specify the justification why this request cannot be approved.
                  </p>
                </div>
              </div>

              <div className="modal-body-text">
                Rejecting request from <strong>{rejectModalTarget.employee_name}</strong> for{' '}
                <strong>{rejectModalTarget.days_count} day(s)</strong> of{' '}
                <strong>{rejectModalTarget.leave_type} leave</strong> ({rejectModalTarget.start_date} to {rejectModalTarget.end_date}).
              </div>

              <div className="form-group mt-3">
                <label className="label">Rejection Reason</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Critical release milestone requires full engineering attendance."
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
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Leaves;
