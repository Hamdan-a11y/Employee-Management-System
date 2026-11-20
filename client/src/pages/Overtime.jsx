import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Sliders,
  Calendar,
  Building2,
  Users,
  Check,
  X,
  Download,
  RefreshCw,
  Search,
  Filter,
  TrendingUp,
  ShieldCheck,
  Info,
  CalendarDays,
  FileSpreadsheet,
  Plus
} from 'lucide-react';
import './Overtime.css';

const Overtime = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { success, error: notifyError, subscribeDataChange } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Roles & Permissions
  const canManageOvertime = Boolean(isAdmin || isHR || isDeptManager);
  const canConfigurePolicies = Boolean(isAdmin || isHR);

  // Active tab: determine from search params or pathname
  const determineInitialTab = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam) return tabParam;
    if (location.pathname.includes('/approvals')) return 'approvals';
    if (location.pathname.includes('/my')) return 'my';
    if (location.pathname.includes('/policies')) return 'policies';
    if (location.pathname.includes('/report')) return 'report';
    return isEmployee ? 'my' : 'approvals';
  };

  const [activeTab, setActiveTab] = useState(determineInitialTab);

  // Sync tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Departments list for filters
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const res = await api.get('/departments');
        setDepartments(Array.isArray(res.data) ? res.data : res.data.departments || []);
      } catch (err) {
        console.error('Failed to load departments', err);
      }
    };
    loadDepts();
  }, []);

  // Format helper
  const formatMins = (mins) => {
    const m = Number(mins) || 0;
    const hrs = (m / 60).toFixed(1);
    return `${m}m (${hrs}h)`;
  };

  // Current Month Helper (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // =========================================================================
  // TAB 1: APPROVALS (MANAGERS, ADMIN, HR)
  // =========================================================================
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('pending');
  const [approvalDeptFilter, setApprovalDeptFilter] = useState('all');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Modals for approval adjustment & rejection
  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [adjustedMinutes, setAdjustedMinutes] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectComment, setRejectComment] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchApprovalRequests = useCallback(async () => {
    try {
      setApprovalLoading(true);
      setApprovalError('');
      const params = {
        limit: 100,
        status: approvalStatusFilter === 'all' ? undefined : approvalStatusFilter,
        department_id: approvalDeptFilter === 'all' ? undefined : approvalDeptFilter
      };
      const res = await api.get('/overtime/requests', { params });
      setApprovalRequests(res.data.requests || []);
      setSelectedIds(new Set());
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load overtime requests.';
      setApprovalError(msg);
      notifyError(msg);
    } finally {
      setApprovalLoading(false);
    }
  }, [approvalStatusFilter, approvalDeptFilter, notifyError]);

  useEffect(() => {
    if (activeTab === 'approvals' && canManageOvertime) {
      fetchApprovalRequests();
    }
  }, [activeTab, canManageOvertime, fetchApprovalRequests]);

  // Real-time listener for overtime data-changed events
  useEffect(() => {
    if (!subscribeDataChange) return;
    const unsubscribe = subscribeDataChange((eventData) => {
      if (eventData.event === 'overtime:updated') {
        if (canManageOvertime) fetchApprovalRequests();
        if (fetchMyOvertime) fetchMyOvertime();
        if (fetchMonthlyReport) fetchMonthlyReport();
      }
    });
    return unsubscribe;
  }, [subscribeDataChange, canManageOvertime, fetchApprovalRequests, fetchMyOvertime, fetchMonthlyReport]);

  // Filtered requests by search keyword
  const filteredApprovalRequests = useMemo(() => {
    if (!approvalSearch.trim()) return approvalRequests;
    const term = approvalSearch.toLowerCase();
    return approvalRequests.filter(
      (r) =>
        (r.employee_name && r.employee_name.toLowerCase().includes(term)) ||
        (r.department_name && r.department_name.toLowerCase().includes(term)) ||
        (r.work_date && r.work_date.includes(term))
    );
  }, [approvalRequests, approvalSearch]);

  // Bulk selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const pendingIds = filteredApprovalRequests
        .filter((r) => r.status === 'pending' && Number(r.employee_id) !== Number(user?.employee_id))
        .map((r) => r.id);
      setSelectedIds(new Set(pendingIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Quick single approve
  const handleQuickApprove = async (id) => {
    try {
      setActionSubmitting(true);
      await api.patch(`/overtime/requests/${id}/approve`, {});
      success('Overtime request approved.');
      fetchApprovalRequests();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to approve request.');
    } finally {
      setActionSubmitting(false);
    }
  };

  // Submit adjusted approval
  const handleConfirmAdjustApprove = async (e) => {
    e.preventDefault();
    if (!adjustModalItem) return;
    try {
      setActionSubmitting(true);
      await api.patch(`/overtime/requests/${adjustModalItem.id}/approve`, {
        approved_minutes: adjustedMinutes ? parseInt(adjustedMinutes, 10) : undefined,
        reason: adjustReason
      });
      success('Overtime request approved with adjusted minutes.');
      setAdjustModalItem(null);
      setAdjustedMinutes('');
      setAdjustReason('');
      fetchApprovalRequests();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to approve request.');
    } finally {
      setActionSubmitting(false);
    }
  };

  // Submit rejection
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectComment.trim()) {
      notifyError('A comment is required for rejection.');
      return;
    }
    try {
      setActionSubmitting(true);
      await api.patch(`/overtime/requests/${rejectModalItem.id}/reject`, {
        comment: rejectComment
      });
      success('Overtime request rejected.');
      setRejectModalItem(null);
      setRejectComment('');
      fetchApprovalRequests();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to reject request.');
    } finally {
      setActionSubmitting(false);
    }
  };

  // Bulk approve selected
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkProcessing(true);
      const ids = Array.from(selectedIds);
      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        try {
          await api.patch(`/overtime/requests/${id}/approve`, {});
          successCount++;
        } catch (e) {
          errorCount++;
        }
      }

      if (successCount > 0) {
        success(`Successfully approved ${successCount} overtime request(s).`);
      }
      if (errorCount > 0) {
        notifyError(`Failed to approve ${errorCount} request(s). Check restrictions.`);
      }
      fetchApprovalRequests();
    } finally {
      setBulkProcessing(false);
    }
  };

  // =========================================================================
  // TAB 2: MY OVERTIME (EMPLOYEES, ALL USERS)
  // =========================================================================
  const [myRequests, setMyRequests] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState('');
  const [myMonthFilter, setMyMonthFilter] = useState(currentMonthStr);
  const [myStatusFilter, setMyStatusFilter] = useState('all');

  const fetchMyOvertime = useCallback(async () => {
    try {
      setMyLoading(true);
      setMyError('');
      const params = {
        limit: 100,
        month: myMonthFilter || undefined,
        status: myStatusFilter === 'all' ? undefined : myStatusFilter
      };
      if (user?.employee_id) {
        params.employee_id = user.employee_id;
      }
      const res = await api.get('/overtime/requests', { params });
      setMyRequests(res.data.requests || []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load your overtime history.';
      setMyError(msg);
    } finally {
      setMyLoading(false);
    }
  }, [myMonthFilter, myStatusFilter, user]);

  useEffect(() => {
    if (activeTab === 'my') {
      fetchMyOvertime();
    }
  }, [activeTab, fetchMyOvertime]);

  // My stats calculation
  const myStats = useMemo(() => {
    const approvedThisMonth = myRequests
      .filter((r) => r.status === 'approved' && (!myMonthFilter || r.work_date?.startsWith(myMonthFilter)))
      .reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);

    const pendingCount = myRequests.filter((r) => r.status === 'pending').length;
    const totalApprovedMins = myRequests
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);

    return {
      approvedHoursThisMonth: (approvedThisMonth / 60).toFixed(1),
      pendingCount,
      totalApprovedHours: (totalApprovedMins / 60).toFixed(1),
      totalRequests: myRequests.length
    };
  }, [myRequests, myMonthFilter]);

  // =========================================================================
  // TAB 3: POLICY SETTINGS (ADMIN / HR)
  // =========================================================================
  const [policies, setPolicies] = useState([]);
  const [currentPolicy, setCurrentPolicy] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const [policyDeptFilter, setPolicyDeptFilter] = useState('company'); // 'company' or dept ID
  const [policySubmitting, setPolicySubmitting] = useState(false);

  // New Policy Form State
  const [policyForm, setPolicyForm] = useState({
    effective_date: new Date().toISOString().split('T')[0],
    threshold_minutes: 15,
    rounding_minutes: 15,
    regular_multiplier: 1.5,
    weekend_multiplier: 2.0,
    holiday_multiplier: 2.5,
    daily_cap_hours: 4.0,
    monthly_cap_hours: 40.0,
    approval_required: true
  });

  const fetchPolicies = useCallback(async () => {
    try {
      setPolicyLoading(true);
      setPolicyError('');
      const params = {};
      if (policyDeptFilter) {
        params.department_id = policyDeptFilter;
      }
      const [listRes, curRes] = await Promise.all([
        api.get('/overtime/policies', { params }),
        api.get('/overtime/policies/current', {
          params: { department_id: policyDeptFilter === 'company' ? undefined : policyDeptFilter }
        })
      ]);
      setPolicies(listRes.data.policies || []);
      setCurrentPolicy(curRes.data.policy || null);
    } catch (err) {
      setPolicyError(err.response?.data?.message || 'Failed to load policy data.');
    } finally {
      setPolicyLoading(false);
    }
  }, [policyDeptFilter]);

  useEffect(() => {
    if (activeTab === 'policies' && canConfigurePolicies) {
      fetchPolicies();
    }
  }, [activeTab, canConfigurePolicies, fetchPolicies]);

  const handleCreatePolicy = async (e) => {
    e.preventDefault();
    if (!canConfigurePolicies) return;
    try {
      setPolicySubmitting(true);
      const payload = {
        ...policyForm,
        department_id: policyDeptFilter === 'company' ? null : parseInt(policyDeptFilter, 10),
        threshold_minutes: parseInt(policyForm.threshold_minutes, 10),
        rounding_minutes: parseInt(policyForm.rounding_minutes, 10),
        regular_multiplier: parseFloat(policyForm.regular_multiplier),
        weekend_multiplier: parseFloat(policyForm.weekend_multiplier),
        holiday_multiplier: parseFloat(policyForm.holiday_multiplier),
        daily_cap_hours: parseFloat(policyForm.daily_cap_hours),
        monthly_cap_hours: parseFloat(policyForm.monthly_cap_hours),
        approval_required: Boolean(policyForm.approval_required)
      };

      await api.post('/overtime/policies', payload);
      success('New version of overtime policy saved successfully.');
      fetchPolicies();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to create policy.');
    } finally {
      setPolicySubmitting(false);
    }
  };

  // =========================================================================
  // TAB 4: MONTHLY REPORT (MANAGERS, ADMIN, HR)
  // =========================================================================
  const [reportMonth, setReportMonth] = useState(currentMonthStr);
  const [reportDeptFilter, setReportDeptFilter] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  const fetchMonthlyReport = useCallback(async () => {
    try {
      setReportLoading(true);
      setReportError('');
      const params = { month: reportMonth };
      if (reportDeptFilter !== 'all') {
        params.department_id = reportDeptFilter;
      }
      const res = await api.get('/overtime/report/monthly', { params });
      setReportData(res.data);
    } catch (err) {
      setReportError(err.response?.data?.message || 'Failed to generate monthly report.');
    } finally {
      setReportLoading(false);
    }
  }, [reportMonth, reportDeptFilter]);

  useEffect(() => {
    if (activeTab === 'report' && canManageOvertime) {
      fetchMonthlyReport();
    }
  }, [activeTab, canManageOvertime, fetchMonthlyReport]);

  const handleExportCSV = () => {
    const params = new URLSearchParams({ month: reportMonth });
    if (reportDeptFilter !== 'all') {
      params.append('department_id', reportDeptFilter);
    }
    window.open(`/api/overtime/report/export/csv?${params.toString()}`, '_blank');
  };

  // Helper Badge Renderers
  const renderStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'approved':
        return (
          <span className="badge-status approved">
            <CheckCircle2 size={12} />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="badge-status rejected">
            <XCircle size={12} />
            Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="badge-status pending">
            <Clock size={12} />
            Pending
          </span>
        );
    }
  };

  const renderDayTypeBadge = (dayType) => {
    const t = (dayType || '').toLowerCase();
    switch (t) {
      case 'weekend':
        return <span className="badge-daytype weekend">Weekend</span>;
      case 'holiday':
        return <span className="badge-daytype holiday">Holiday</span>;
      case 'regular':
      default:
        return <span className="badge-daytype regular">Regular</span>;
    }
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content overtime-main">
        {/* Page Header */}
        <header className="overtime-header">
          <div className="overtime-title-group">
            <div className="overtime-title-row">
              <h1 className="overtime-title">Overtime Management</h1>
              {isAdmin || isHR ? (
                <span className="overtime-scope-pill editable">
                  <ShieldCheck size={12} />
                  <span>Admin & HR Oversight</span>
                </span>
              ) : isDeptManager ? (
                <span className="overtime-scope-pill">
                  <Building2 size={12} />
                  <span>Department Manager View</span>
                </span>
              ) : (
                <span className="overtime-scope-pill">
                  <Users size={12} />
                  <span>Employee Portal</span>
                </span>
              )}
            </div>
            <p className="overtime-subtitle">
              Calculate, review, and track overtime hours with policy caps and automated multipliers.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={() => {
                if (activeTab === 'approvals') fetchApprovalRequests();
                else if (activeTab === 'my') fetchMyOvertime();
                else if (activeTab === 'policies') fetchPolicies();
                else if (activeTab === 'report') fetchMonthlyReport();
              }}
              className="btn btn-secondary"
              title="Refresh overtime data"
              disabled={approvalLoading || myLoading || policyLoading || reportLoading}
            >
              <RefreshCw
                size={15}
                className={approvalLoading || myLoading || policyLoading || reportLoading ? 'animate-spin' : ''}
              />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Navigation Tabs Bar */}
        <nav className="overtime-tabs-bar" aria-label="Overtime section navigation">
          {canManageOvertime && (
            <button
              type="button"
              className={`overtime-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
              onClick={() => handleTabChange('approvals')}
            >
              <CheckCircle2 size={16} />
              <span>Approvals</span>
              {approvalRequests.filter((r) => r.status === 'pending').length > 0 && (
                <span className="overtime-tab-count">
                  {approvalRequests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            className={`overtime-tab-btn ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => handleTabChange('my')}
          >
            <Clock size={16} />
            <span>My Overtime</span>
          </button>

          {canConfigurePolicies && (
            <button
              type="button"
              className={`overtime-tab-btn ${activeTab === 'policies' ? 'active' : ''}`}
              onClick={() => handleTabChange('policies')}
            >
              <Sliders size={16} />
              <span>Policy Settings</span>
            </button>
          )}

          {canManageOvertime && (
            <button
              type="button"
              className={`overtime-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => handleTabChange('report')}
            >
              <TrendingUp size={16} />
              <span>Report & Analytics</span>
            </button>
          )}
        </nav>

        {/* ================================================================= */}
        {/* TAB 1: APPROVALS VIEW                                             */}
        {/* ================================================================= */}
        {activeTab === 'approvals' && canManageOvertime && (
          <section aria-labelledby="approvals-heading">
            {/* Global Error Banner */}
            {approvalError && (
              <div className="overtime-error-banner">
                <AlertCircle size={18} />
                <span>{approvalError}</span>
              </div>
            )}

            {/* Filter Card */}
            <div className="overtime-filter-card">
              <div className="overtime-filter-row">
                <div className="overtime-search-wrapper">
                  <Search size={16} className="overtime-search-icon" />
                  <input
                    type="text"
                    className="overtime-search-input"
                    placeholder="Search by employee, date, or department..."
                    value={approvalSearch}
                    onChange={(e) => setApprovalSearch(e.target.value)}
                  />
                </div>

                <div className="overtime-filter-group">
                  {(isAdmin || isHR) && (
                    <select
                      className="overtime-select"
                      value={approvalDeptFilter}
                      onChange={(e) => setApprovalDeptFilter(e.target.value)}
                    >
                      <option value="all">All Departments</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="overtime-status-pills">
                    {['pending', 'approved', 'rejected', 'all'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`overtime-pill-btn ${approvalStatusFilter === st ? 'active' : ''}`}
                        onClick={() => setApprovalStatusFilter(st)}
                      >
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="overtime-bulk-bar">
                <div className="overtime-bulk-info">
                  <CheckCircle2 size={16} />
                  <span>{selectedIds.size} request(s) selected for approval</span>
                </div>
                <div className="overtime-bulk-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleBulkApprove}
                    disabled={bulkProcessing}
                  >
                    {bulkProcessing ? 'Processing...' : `Approve Selected (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {/* Table Card */}
            <div className="overtime-table-card">
              <div className="overtime-table-scroll">
                <table className="overtime-table">
                  <thead>
                    <tr>
                      <th className="overtime-th checkbox-col">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={
                            filteredApprovalRequests.length > 0 &&
                            filteredApprovalRequests
                              .filter((r) => r.status === 'pending' && Number(r.employee_id) !== Number(user?.employee_id))
                              .every((r) => selectedIds.has(r.id)) &&
                            filteredApprovalRequests.some(
                              (r) => r.status === 'pending' && Number(r.employee_id) !== Number(user?.employee_id)
                            )
                          }
                          aria-label="Select all eligible pending requests"
                        />
                      </th>
                      <th className="overtime-th">Employee</th>
                      <th className="overtime-th">Work Date</th>
                      <th className="overtime-th">Day Type</th>
                      <th className="overtime-th numeric">Overtime Time</th>
                      <th className="overtime-th numeric">Rate</th>
                      <th className="overtime-th">Status</th>
                      <th className="overtime-th actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalLoading ? (
                      <tr>
                        <td colSpan="8">
                          <div className="overtime-loading-state">
                            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                            <p style={{ marginTop: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                              Loading overtime requests...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredApprovalRequests.length === 0 ? (
                      <tr>
                        <td colSpan="8">
                          <div className="overtime-empty-state">
                            <div className="overtime-empty-icon">
                              <CheckCircle2 size={24} />
                            </div>
                            <h3 className="overtime-empty-title">No overtime requests found</h3>
                            <p className="overtime-empty-text">
                              There are currently no overtime requests matching your active filter criteria.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredApprovalRequests.map((req) => {
                        const isSelf = Number(req.employee_id) === Number(user?.employee_id);
                        const isPending = req.status === 'pending';

                        return (
                          <tr key={req.id} className="overtime-tr">
                            <td className="overtime-td checkbox-col">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(req.id)}
                                onChange={() => handleToggleSelect(req.id)}
                                disabled={!isPending || isSelf}
                                title={isSelf ? 'Self-approval is forbidden' : undefined}
                              />
                            </td>
                            <td className="overtime-td">
                              <div style={{ fontWeight: 600 }}>{req.employee_name || `Emp #${req.employee_id}`}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {req.department_name || 'Department'}
                              </div>
                            </td>
                            <td className="overtime-td font-numeric">{req.work_date}</td>
                            <td className="overtime-td">{renderDayTypeBadge(req.day_type)}</td>
                            <td className="overtime-td numeric font-numeric">
                              <strong>{formatMins(req.minutes)}</strong>
                              {Boolean(req.over_cap) && (
                                <div style={{ marginTop: 2 }}>
                                  <span className="badge-cap-alert" title="Over daily or monthly policy cap">
                                    <AlertTriangle size={11} /> Over Cap
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="overtime-td numeric font-numeric">{req.multiplier}x</td>
                            <td className="overtime-td">
                              {renderStatusBadge(req.status)}
                              {req.reviewer_name && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  by {req.reviewer_name}
                                </div>
                              )}
                            </td>
                            <td className="overtime-td actions">
                              {isPending ? (
                                isSelf ? (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Self-request (Review locked)
                                  </span>
                                ) : (
                                  <div className="ot-action-btn-group">
                                    <button
                                      type="button"
                                      className="btn-approve"
                                      onClick={() => handleQuickApprove(req.id)}
                                      disabled={actionSubmitting}
                                      title="Approve full calculated minutes"
                                    >
                                      <Check size={13} /> Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-adjust"
                                      onClick={() => {
                                        setAdjustModalItem(req);
                                        setAdjustedMinutes(String(req.minutes));
                                        setAdjustReason('');
                                      }}
                                      title="Approve with adjusted minutes & reason"
                                    >
                                      <Sliders size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-reject"
                                      onClick={() => {
                                        setRejectModalItem(req);
                                        setRejectComment('');
                                      }}
                                      disabled={actionSubmitting}
                                      title="Reject overtime request"
                                    >
                                      <X size={13} /> Reject
                                    </button>
                                  </div>
                                )
                              ) : (
                                <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Locked</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 2: MY OVERTIME VIEW                                           */}
        {/* ================================================================= */}
        {activeTab === 'my' && (
          <section aria-labelledby="my-overtime-heading">
            {/* Global Error Banner */}
            {myError && (
              <div className="overtime-error-banner">
                <AlertCircle size={18} />
                <span>{myError}</span>
              </div>
            )}

            {/* Stats Metric Cards */}
            <div className="overtime-stats-grid">
              <div className="overtime-stat-card">
                <div className="overtime-stat-icon emerald">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <div className="overtime-stat-label">Approved This Month</div>
                  <div className="overtime-stat-value font-numeric">{myStats.approvedHoursThisMonth} hrs</div>
                  <div className="overtime-stat-subtext">Selected period: {myMonthFilter || 'All'}</div>
                </div>
              </div>

              <div className="overtime-stat-card">
                <div className="overtime-stat-icon amber">
                  <Clock size={22} />
                </div>
                <div>
                  <div className="overtime-stat-label">Pending Approval</div>
                  <div className="overtime-stat-value font-numeric">{myStats.pendingCount}</div>
                  <div className="overtime-stat-subtext">Awaiting manager review</div>
                </div>
              </div>

              <div className="overtime-stat-card">
                <div className="overtime-stat-icon blue">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <div className="overtime-stat-label">Total Overtime Hours</div>
                  <div className="overtime-stat-value font-numeric">{myStats.totalApprovedHours} hrs</div>
                  <div className="overtime-stat-subtext">Across {myStats.totalRequests} entries</div>
                </div>
              </div>
            </div>

            {/* Filter Card */}
            <div className="overtime-filter-card">
              <div className="overtime-filter-row">
                <div className="overtime-filter-group">
                  <label htmlFor="my-month-input" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Month:
                  </label>
                  <input
                    id="my-month-input"
                    type="month"
                    className="overtime-select"
                    value={myMonthFilter}
                    onChange={(e) => setMyMonthFilter(e.target.value)}
                  />
                  {myMonthFilter && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setMyMonthFilter('')}
                      style={{ height: 38 }}
                    >
                      Clear Month
                    </button>
                  )}
                </div>

                <div className="overtime-status-pills">
                  {['all', 'approved', 'pending', 'rejected'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`overtime-pill-btn ${myStatusFilter === st ? 'active' : ''}`}
                      onClick={() => setMyStatusFilter(st)}
                    >
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* My Requests Table */}
            <div className="overtime-table-card">
              <div className="overtime-table-scroll">
                <table className="overtime-table">
                  <thead>
                    <tr>
                      <th className="overtime-th">Work Date</th>
                      <th className="overtime-th">Day Type</th>
                      <th className="overtime-th numeric">Overtime Minutes</th>
                      <th className="overtime-th numeric">Hours</th>
                      <th className="overtime-th numeric">Multiplier</th>
                      <th className="overtime-th">Status</th>
                      <th className="overtime-th">Notes / Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLoading ? (
                      <tr>
                        <td colSpan="7">
                          <div className="overtime-loading-state">
                            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                            <p style={{ marginTop: 8, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                              Loading your overtime history...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : myRequests.length === 0 ? (
                      <tr>
                        <td colSpan="7">
                          <div className="overtime-empty-state">
                            <div className="overtime-empty-icon">
                              <Clock size={24} />
                            </div>
                            <h3 className="overtime-empty-title">No overtime records</h3>
                            <p className="overtime-empty-text">
                              Overtime is automatically calculated whenever you complete check-out past your scheduled
                              shift end or on weekends and holidays.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      myRequests.map((req) => (
                        <tr key={req.id} className="overtime-tr">
                          <td className="overtime-td font-numeric">
                            <strong>{req.work_date}</strong>
                          </td>
                          <td className="overtime-td">{renderDayTypeBadge(req.day_type)}</td>
                          <td className="overtime-td numeric font-numeric">{req.minutes} mins</td>
                          <td className="overtime-td numeric font-numeric">
                            <strong>{(req.minutes / 60).toFixed(2)} hrs</strong>
                            {Boolean(req.over_cap) && (
                              <div style={{ marginTop: 2 }}>
                                <span className="badge-cap-alert">
                                  <AlertTriangle size={11} /> Over Cap
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="overtime-td numeric font-numeric">{req.multiplier}x</td>
                          <td className="overtime-td">{renderStatusBadge(req.status)}</td>
                          <td className="overtime-td">
                            {req.comment ? (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                {req.comment}
                              </span>
                            ) : req.status === 'approved' ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved for payroll</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 3: POLICY SETTINGS VIEW (ADMIN / HR)                          */}
        {/* ================================================================= */}
        {activeTab === 'policies' && canConfigurePolicies && (
          <section aria-labelledby="policy-heading">
            {policyError && (
              <div className="overtime-error-banner">
                <AlertCircle size={18} />
                <span>{policyError}</span>
              </div>
            )}

            {/* Department Filter Bar */}
            <div className="overtime-filter-card">
              <div className="overtime-filter-row">
                <div className="overtime-filter-group">
                  <label htmlFor="policy-dept-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Policy Scope:
                  </label>
                  <select
                    id="policy-dept-select"
                    className="overtime-select"
                    value={policyDeptFilter}
                    onChange={(e) => setPolicyDeptFilter(e.target.value)}
                  >
                    <option value="company">Company Default (All Departments)</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        Department: {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Append-only: Historical policies are preserved for past audit & recalculation.
                </div>
              </div>
            </div>

            <div className="policy-card-grid">
              {/* Card 1: Currently Effective Policy */}
              <div className="policy-card">
                <div className="policy-card-header">
                  <h3 className="policy-card-title">Currently Effective Policy</h3>
                  <p className="policy-card-desc">
                    Active rules applied when calculating employee overtime for this scope.
                  </p>
                </div>

                {policyLoading ? (
                  <div className="overtime-loading-state" style={{ padding: '30px 0' }}>
                    <RefreshCw size={20} className="animate-spin" />
                  </div>
                ) : currentPolicy ? (
                  <div className="policy-specs-list">
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Effective From</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.effective_date}</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Threshold</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.threshold_minutes} minutes</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Rounding Interval</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.rounding_minutes} minutes (floor)</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Regular Day Multiplier</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.regular_multiplier}x</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Weekend Multiplier</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.weekend_multiplier}x</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Public Holiday Multiplier</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.holiday_multiplier}x</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Daily Overtime Cap</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.daily_cap_hours} hours</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Monthly Overtime Cap</span>
                      <span className="policy-spec-val font-numeric">{currentPolicy.monthly_cap_hours} hours</span>
                    </div>
                    <div className="policy-spec-item">
                      <span className="policy-spec-label">Manager Approval Required</span>
                      <span className="policy-spec-val">
                        {currentPolicy.approval_required ? 'Yes (Review required)' : 'No (Auto-approved)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="overtime-empty-state" style={{ padding: '30px 0' }}>
                    <p className="overtime-empty-text">No active policy found. Default settings apply.</p>
                  </div>
                )}
              </div>

              {/* Card 2: Create New Policy Version Form */}
              <div className="policy-card">
                <div className="policy-card-header">
                  <h3 className="policy-card-title">Add New Policy Version</h3>
                  <p className="policy-card-desc">
                    Enter revised parameters. A new version row will be added effective from the chosen date.
                  </p>
                </div>

                <form onSubmit={handleCreatePolicy}>
                  <div className="ot-form-group">
                    <label className="ot-form-label">Effective Date *</label>
                    <input
                      type="date"
                      className="ot-form-input"
                      value={policyForm.effective_date}
                      onChange={(e) => setPolicyForm({ ...policyForm, effective_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="ot-form-row">
                    <div className="ot-form-group">
                      <label className="ot-form-label">Threshold (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        className="ot-form-input"
                        value={policyForm.threshold_minutes}
                        onChange={(e) => setPolicyForm({ ...policyForm, threshold_minutes: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ot-form-group">
                      <label className="ot-form-label">Rounding (Minutes)</label>
                      <input
                        type="number"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.rounding_minutes}
                        onChange={(e) => setPolicyForm({ ...policyForm, rounding_minutes: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="ot-form-row">
                    <div className="ot-form-group">
                      <label className="ot-form-label">Regular Multiplier</label>
                      <input
                        type="number"
                        step="0.05"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.regular_multiplier}
                        onChange={(e) => setPolicyForm({ ...policyForm, regular_multiplier: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ot-form-group">
                      <label className="ot-form-label">Weekend Multiplier</label>
                      <input
                        type="number"
                        step="0.05"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.weekend_multiplier}
                        onChange={(e) => setPolicyForm({ ...policyForm, weekend_multiplier: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="ot-form-row">
                    <div className="ot-form-group">
                      <label className="ot-form-label">Holiday Multiplier</label>
                      <input
                        type="number"
                        step="0.05"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.holiday_multiplier}
                        onChange={(e) => setPolicyForm({ ...policyForm, holiday_multiplier: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ot-form-group">
                      <label className="ot-form-label">Daily Cap (Hours)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.daily_cap_hours}
                        onChange={(e) => setPolicyForm({ ...policyForm, daily_cap_hours: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="ot-form-row">
                    <div className="ot-form-group">
                      <label className="ot-form-label">Monthly Cap (Hours)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        className="ot-form-input"
                        value={policyForm.monthly_cap_hours}
                        onChange={(e) => setPolicyForm({ ...policyForm, monthly_cap_hours: e.target.value })}
                        required
                      />
                    </div>
                    <div className="ot-form-group" style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input
                          type="checkbox"
                          checked={policyForm.approval_required}
                          onChange={(e) => setPolicyForm({ ...policyForm, approval_required: e.target.checked })}
                        />
                        <span>Require Manager Approval</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: 'var(--space-2)' }}
                    disabled={policySubmitting}
                  >
                    <Plus size={16} />
                    <span>{policySubmitting ? 'Saving Policy...' : 'Save Policy Version'}</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Policy Version History Table */}
            <div className="overtime-table-card">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
                Version History (Audit Trail)
              </div>
              <div className="overtime-table-scroll">
                <table className="overtime-table">
                  <thead>
                    <tr>
                      <th className="overtime-th">Effective Date</th>
                      <th className="overtime-th">Scope</th>
                      <th className="overtime-th numeric">Threshold</th>
                      <th className="overtime-th numeric">Rounding</th>
                      <th className="overtime-th numeric">Multipliers (R/W/H)</th>
                      <th className="overtime-th numeric">Caps (Day/Month)</th>
                      <th className="overtime-th">Approval Req.</th>
                      <th className="overtime-th">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No policy versions recorded for this department scope.
                        </td>
                      </tr>
                    ) : (
                      policies.map((p) => (
                        <tr key={p.id} className="overtime-tr">
                          <td className="overtime-td font-numeric">
                            <strong>{p.effective_date}</strong>
                          </td>
                          <td className="overtime-td">{p.department_name || 'Company Default'}</td>
                          <td className="overtime-td numeric font-numeric">{p.threshold_minutes}m</td>
                          <td className="overtime-td numeric font-numeric">{p.rounding_minutes}m</td>
                          <td className="overtime-td numeric font-numeric">
                            {p.regular_multiplier}x / {p.weekend_multiplier}x / {p.holiday_multiplier}x
                          </td>
                          <td className="overtime-td numeric font-numeric">
                            {p.daily_cap_hours}h / {p.monthly_cap_hours}h
                          </td>
                          <td className="overtime-td">{p.approval_required ? 'Yes' : 'Auto'}</td>
                          <td className="overtime-td font-numeric" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {p.created_at ? p.created_at.split('T')[0] : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 4: REPORT & ANALYTICS VIEW (MANAGERS, ADMIN, HR)              */}
        {/* ================================================================= */}
        {activeTab === 'report' && canManageOvertime && (
          <section aria-labelledby="report-heading">
            {reportError && (
              <div className="overtime-error-banner">
                <AlertCircle size={18} />
                <span>{reportError}</span>
              </div>
            )}

            {/* Filter Bar */}
            <div className="overtime-filter-card">
              <div className="overtime-filter-row">
                <div className="overtime-filter-group">
                  <label htmlFor="report-month-select" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Report Month:
                  </label>
                  <input
                    id="report-month-select"
                    type="month"
                    className="overtime-select"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                  />

                  {(isAdmin || isHR) && (
                    <select
                      className="overtime-select"
                      value={reportDeptFilter}
                      onChange={(e) => setReportDeptFilter(e.target.value)}
                    >
                      <option value="all">All Departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="overtime-filter-group">
                  <button type="button" className="btn btn-secondary" onClick={handleExportCSV}>
                    <Download size={15} />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Metrics */}
            {reportData && (
              <>
                <div className="overtime-stats-grid">
                  <div className="overtime-stat-card">
                    <div className="overtime-stat-icon emerald">
                      <Clock size={22} />
                    </div>
                    <div>
                      <div className="overtime-stat-label">Total Approved Hours</div>
                      <div className="overtime-stat-value font-numeric">{reportData.total_approved_hours} hrs</div>
                      <div className="overtime-stat-subtext">{reportData.total_approved_minutes} total minutes</div>
                    </div>
                  </div>

                  <div className="overtime-stat-card">
                    <div className="overtime-stat-icon blue">
                      <TrendingUp size={22} />
                    </div>
                    <div>
                      <div className="overtime-stat-label">Total Weighted Hours</div>
                      <div className="overtime-stat-value font-numeric">{reportData.total_weighted_hours} hrs</div>
                      <div className="overtime-stat-subtext">Pay-multiplier adjusted</div>
                    </div>
                  </div>

                  <div className="overtime-stat-card">
                    <div className="overtime-stat-icon amber">
                      <CalendarDays size={22} />
                    </div>
                    <div>
                      <div className="overtime-stat-label">Pending Reviews</div>
                      <div className="overtime-stat-value font-numeric">{reportData.total_pending_count}</div>
                      <div className="overtime-stat-subtext">{reportData.total_rejected_count} rejected</div>
                    </div>
                  </div>
                </div>

                {/* Simple Trend & Breakdown Chart Card */}
                <div className="chart-container-card">
                  <div className="chart-header">
                    <div>
                      <h3 className="chart-title">Day Type Distribution & Hours Breakdown</h3>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        Relative proportion of approved overtime across regular working days, weekends, and public holidays.
                      </p>
                    </div>

                    <div className="chart-legend">
                      <div className="chart-legend-item">
                        <span className="chart-legend-dot" style={{ background: '#3b82f6' }}></span>
                        <span>Regular Day</span>
                      </div>
                      <div className="chart-legend-item">
                        <span className="chart-legend-dot" style={{ background: '#10b981' }}></span>
                        <span>Weekend</span>
                      </div>
                      <div className="chart-legend-item">
                        <span className="chart-legend-dot" style={{ background: '#a855f7' }}></span>
                        <span>Holiday</span>
                      </div>
                    </div>
                  </div>

                  {/* Stacked Proportional Bar */}
                  {reportData.total_approved_minutes > 0 ? (
                    <div className="chart-stacked-bar-wrapper">
                      <div className="chart-stacked-bar">
                        <div
                          className="chart-bar-segment"
                          style={{
                            width: `${(reportData.by_day_type?.regular?.minutes / reportData.total_approved_minutes) * 100}%`,
                            background: '#3b82f6'
                          }}
                          title={`Regular: ${reportData.by_day_type?.regular?.hours}h`}
                        ></div>
                        <div
                          className="chart-bar-segment"
                          style={{
                            width: `${(reportData.by_day_type?.weekend?.minutes / reportData.total_approved_minutes) * 100}%`,
                            background: '#10b981'
                          }}
                          title={`Weekend: ${reportData.by_day_type?.weekend?.hours}h`}
                        ></div>
                        <div
                          className="chart-bar-segment"
                          style={{
                            width: `${(reportData.by_day_type?.holiday?.minutes / reportData.total_approved_minutes) * 100}%`,
                            background: '#a855f7'
                          }}
                          title={`Holiday: ${reportData.by_day_type?.holiday?.hours}h`}
                        ></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      No approved overtime hours recorded for {reportMonth} to display in distribution chart.
                    </div>
                  )}

                  {/* Breakdown Numbers */}
                  <div className="chart-breakdown-grid">
                    <div className="chart-breakdown-item">
                      <span className="chart-breakdown-label">Regular Overtime</span>
                      <span className="chart-breakdown-val font-numeric">
                        {reportData.by_day_type?.regular?.hours || 0} hrs
                      </span>
                      <span className="chart-breakdown-pct">
                        {reportData.total_approved_minutes > 0
                          ? Math.round(
                              (reportData.by_day_type?.regular?.minutes / reportData.total_approved_minutes) * 100
                            )
                          : 0}
                        % of total
                      </span>
                    </div>

                    <div className="chart-breakdown-item">
                      <span className="chart-breakdown-label">Weekend Overtime</span>
                      <span className="chart-breakdown-val font-numeric">
                        {reportData.by_day_type?.weekend?.hours || 0} hrs
                      </span>
                      <span className="chart-breakdown-pct">
                        {reportData.total_approved_minutes > 0
                          ? Math.round(
                              (reportData.by_day_type?.weekend?.minutes / reportData.total_approved_minutes) * 100
                            )
                          : 0}
                        % of total
                      </span>
                    </div>

                    <div className="chart-breakdown-item">
                      <span className="chart-breakdown-label">Public Holiday Overtime</span>
                      <span className="chart-breakdown-val font-numeric">
                        {reportData.by_day_type?.holiday?.hours || 0} hrs
                      </span>
                      <span className="chart-breakdown-pct">
                        {reportData.total_approved_minutes > 0
                          ? Math.round(
                              (reportData.by_day_type?.holiday?.minutes / reportData.total_approved_minutes) * 100
                            )
                          : 0}
                        % of total
                      </span>
                    </div>
                  </div>
                </div>

                {/* Report Table */}
                <div className="overtime-table-card">
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
                    Monthly Request Records ({reportData.requests?.length || 0})
                  </div>
                  <div className="overtime-table-scroll">
                    <table className="overtime-table">
                      <thead>
                        <tr>
                          <th className="overtime-th">Work Date</th>
                          <th className="overtime-th">Employee</th>
                          <th className="overtime-th">Department</th>
                          <th className="overtime-th">Day Type</th>
                          <th className="overtime-th numeric">Hours</th>
                          <th className="overtime-th numeric">Multiplier</th>
                          <th className="overtime-th numeric">Weighted Hrs</th>
                          <th className="overtime-th">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.requests?.length === 0 ? (
                          <tr>
                            <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                              No requests found for this month.
                            </td>
                          </tr>
                        ) : (
                          reportData.requests.map((r) => (
                            <tr key={r.id} className="overtime-tr">
                              <td className="overtime-td font-numeric">{r.work_date}</td>
                              <td className="overtime-td" style={{ fontWeight: 600 }}>{r.employee_name}</td>
                              <td className="overtime-td">{r.department_name || '—'}</td>
                              <td className="overtime-td">{renderDayTypeBadge(r.day_type)}</td>
                              <td className="overtime-td numeric font-numeric">
                                {(r.minutes / 60).toFixed(2)}h
                              </td>
                              <td className="overtime-td numeric font-numeric">{r.multiplier}x</td>
                              <td className="overtime-td numeric font-numeric" style={{ fontWeight: 700 }}>
                                {((r.minutes / 60) * r.multiplier).toFixed(2)}h
                              </td>
                              <td className="overtime-td">{renderStatusBadge(r.status)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* MODAL 1: ADJUST & APPROVE MODAL                                   */}
        {/* ================================================================= */}
        {adjustModalItem && (
          <div className="overtime-modal-backdrop" onClick={() => setAdjustModalItem(null)}>
            <div className="overtime-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="overtime-modal-header">
                <h3 className="overtime-modal-title">Adjust & Approve Overtime</h3>
                <button
                  type="button"
                  className="overtime-modal-close"
                  onClick={() => setAdjustModalItem(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmAdjustApprove}>
                <div className="overtime-modal-body">
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                    Adjusting overtime for <strong>{adjustModalItem.employee_name}</strong> on{' '}
                    <strong>{adjustModalItem.work_date}</strong>. System-calculated minutes:{' '}
                    <strong>{adjustModalItem.minutes} mins</strong>.
                  </p>

                  <div className="ot-form-group">
                    <label className="ot-form-label">Approved Minutes *</label>
                    <input
                      type="number"
                      min="0"
                      max={adjustModalItem.minutes}
                      className="ot-form-input"
                      value={adjustedMinutes}
                      onChange={(e) => setAdjustedMinutes(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Must be equal to or less than {adjustModalItem.minutes} minutes.
                    </span>
                  </div>

                  <div className="ot-form-group">
                    <label className="ot-form-label">Adjustment Reason *</label>
                    <textarea
                      className="ot-form-textarea"
                      rows="3"
                      placeholder="Explain why fewer minutes were approved..."
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                    ></textarea>
                  </div>
                </div>

                <div className="overtime-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setAdjustModalItem(null)}
                    disabled={actionSubmitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={actionSubmitting}>
                    {actionSubmitting ? 'Saving...' : 'Confirm Approval'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL 2: REJECT COMMENT MODAL                                     */}
        {/* ================================================================= */}
        {rejectModalItem && (
          <div className="overtime-modal-backdrop" onClick={() => setRejectModalItem(null)}>
            <div className="overtime-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="overtime-modal-header">
                <h3 className="overtime-modal-title">Reject Overtime Request</h3>
                <button
                  type="button"
                  className="overtime-modal-close"
                  onClick={() => setRejectModalItem(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmReject}>
                <div className="overtime-modal-body">
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                    Rejecting overtime request for <strong>{rejectModalItem.employee_name}</strong> on{' '}
                    <strong>{rejectModalItem.work_date}</strong> ({formatMins(rejectModalItem.minutes)}).
                  </p>

                  <div className="ot-form-group">
                    <label className="ot-form-label">Rejection Comment (Required) *</label>
                    <textarea
                      className="ot-form-textarea"
                      rows="3"
                      placeholder="Specify the reason for rejection..."
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      required
                    ></textarea>
                  </div>
                </div>

                <div className="overtime-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRejectModalItem(null)}
                    disabled={actionSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger"
                    style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                    disabled={actionSubmitting}
                  >
                    {actionSubmitting ? 'Rejecting...' : 'Reject Overtime'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Overtime;
