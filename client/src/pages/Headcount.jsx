import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { DepartmentIcon } from '../utils/departmentIcons';
import { calculateHeadcountStatus, calculateAttrition, calculateOvertime } from '../utils/headcount';
import {
  Users,
  Search,
  Check,
  X,
  Edit2,
  AlertCircle,
  TrendingUp,
  UserPlus,
  UserMinus,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Building2,
  Calendar,
  Clock,
} from 'lucide-react';
import './Headcount.css';

const Headcount = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Attrition state (period: 3, 6, 12 months)
  const [attritionPeriod, setAttritionPeriod] = useState(12);
  const [attritionData, setAttritionData] = useState({});
  const [attritionLoading, setAttritionLoading] = useState(false);

  // Overtime state (period: 1, 3, 6 months)
  const [overtimePeriod, setOvertimePeriod] = useState(3);
  const [overtimeData, setOvertimeData] = useState({});
  const [overtimeLoading, setOvertimeLoading] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [inlineError, setInlineError] = useState('');

  // Can the current user edit approved headcount?
  // Admin and HR Manager: view all and edit
  // Department Manager: view own department only, no edit
  // Employee: no access
  const canEdit = Boolean(isAdmin || isHR);

  const fetchHeadcount = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/workforce/headcount');
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load workforce headcount data.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttrition = async (period = attritionPeriod) => {
    try {
      setAttritionLoading(true);
      const res = await api.get(`/workforce/attrition?months=${period}`);
      const map = {};
      if (Array.isArray(res.data)) {
        res.data.forEach((item) => {
          map[item.id] = item;
        });
      }
      setAttritionData(map);
    } catch (err) {
      console.error('Failed to load attrition data', err);
    } finally {
      setAttritionLoading(false);
    }
  };

  const fetchOvertime = async (period = overtimePeriod) => {
    try {
      setOvertimeLoading(true);
      const res = await api.get(`/workforce/overtime?months=${period}`);
      const map = {};
      if (Array.isArray(res.data)) {
        res.data.forEach((item) => {
          map[item.id] = item;
        });
      }
      setOvertimeData(map);
    } catch (err) {
      console.error('Failed to load workforce overtime data', err);
    } finally {
      setOvertimeLoading(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchHeadcount(),
      fetchAttrition(attritionPeriod),
      fetchOvertime(overtimePeriod),
    ]);
  };

  useEffect(() => {
    if (!isEmployee) {
      fetchHeadcount();
    }
  }, [isEmployee]);

  useEffect(() => {
    if (!isEmployee) {
      fetchAttrition(attritionPeriod);
    }
  }, [isEmployee, attritionPeriod]);

  useEffect(() => {
    if (!isEmployee) {
      fetchOvertime(overtimePeriod);
    }
  }, [isEmployee, overtimePeriod]);

  // Start inline editing a department
  const startEdit = (dept) => {
    if (!canEdit) return;
    setEditingId(dept.id);
    setEditValue(String(dept.approved));
    setInlineError('');
  };

  // Cancel inline editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
    setInlineError('');
  };

  // Save inline edit
  const saveEdit = async (deptId) => {
    const trimmed = String(editValue).trim();
    if (trimmed === '') {
      setInlineError('Headcount is required.');
      return;
    }

    const num = Number(trimmed);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      setInlineError('Must be an integer ≥ 0');
      return;
    }

    try {
      setSavingId(deptId);
      setInlineError('');

      await api.put(`/departments/${deptId}/approved-headcount`, {
        approved_headcount: num,
      });

      // Update state locally
      setDepartments((prev) =>
        prev.map((d) => {
          if (d.id === deptId) {
            const approved = num;
            const current = Number(d.current) || 0;
            const gap = approved - current;
            const status = calculateHeadcountStatus(approved, current);
            return {
              ...d,
              approved,
              gap,
              status,
            };
          }
          return d;
        })
      );

      // Recompute attrition data for department with new approved target
      setAttritionData((prev) => {
        const existing = prev[deptId];
        const leavers = existing?.leavers || 0;
        const currentStaff = departments.find((d) => d.id === deptId)?.current || 0;
        const newAttr = calculateAttrition(leavers, currentStaff, num);
        return {
          ...prev,
          [deptId]: {
            ...existing,
            approved: num,
            ...newAttr,
          },
        };
      });

      success('Approved headcount updated successfully!');
      setEditingId(null);
      setEditValue('');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update approved headcount.';
      setInlineError(msg);
      notifyError(msg);
    } finally {
      setSavingId(null);
    }
  };

  // Handle keyboard submit / cancel in inline edit input
  const handleKeyDown = (e, deptId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(deptId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    return departments.filter((dept) => {
      const matchesSearch = dept.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchesStatus =
        statusFilter === 'ALL' || dept.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [departments, search, statusFilter]);

  // Overall statistics
  const stats = useMemo(() => {
    const totalApproved = departments.reduce((sum, d) => sum + (Number(d.approved) || 0), 0);
    const totalCurrent = departments.reduce((sum, d) => sum + (Number(d.current) || 0), 0);
    const netGap = totalApproved - totalCurrent;
    const needsHiring = departments.filter((d) => d.status === 'Needs Hiring').length;
    const balanced = departments.filter((d) => d.status === 'Balanced').length;
    const overstaffed = departments.filter((d) => d.status === 'Overstaffed - Review').length;
    const notSet = departments.filter((d) => d.status === 'Not Set').length;

    return {
      totalApproved,
      totalCurrent,
      netGap,
      needsHiring,
      balanced,
      overstaffed,
      notSet,
    };
  }, [departments]);

  // Render colored status text with head/body icon (No Container Box)
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Needs Hiring':
        return (
          <span className="headcount-status-text status-needs-hiring badge-needs-hiring" data-testid="status-badge-needs-hiring">
            <UserPlus size={14} className="headcount-status-icon" />
            <span>Needs Hiring</span>
          </span>
        );
      case 'Balanced':
        return (
          <span className="headcount-status-text status-balanced badge-balanced" data-testid="status-badge-balanced">
            <UserCheck size={14} className="headcount-status-icon" />
            <span>Balanced</span>
          </span>
        );
      case 'Overstaffed - Review':
        return (
          <span className="headcount-status-text status-overstaffed badge-overstaffed" data-testid="status-badge-overstaffed">
            <UserMinus size={14} className="headcount-status-icon" />
            <span>Overstaffed - Review</span>
          </span>
        );
      case 'Not Set':
      default:
        return (
          <span className="headcount-status-text status-not-set badge-not-set" data-testid="status-badge-not-set">
            <HelpCircle size={14} className="headcount-status-icon" />
            <span>Not Set</span>
          </span>
        );
    }
  };

  // Render gap as clean colored text (No Container Box)
  const renderGapText = (gap, status) => {
    if (status === 'Not Set') {
      return (
        <span className="headcount-gap-text gap-not-set" title="Approved target is 0">
          —
        </span>
      );
    }

    if (gap > 0) {
      return (
        <span className="headcount-gap-text gap-positive positive" title={`${gap} positions open`}>
          +{gap}
        </span>
      );
    }

    if (gap === 0) {
      return (
        <span className="headcount-gap-text gap-zero zero" title="Headcount is balanced">
          0
        </span>
      );
    }

    return (
      <span className="headcount-gap-text gap-negative negative" title={`${Math.abs(gap)} over target`}>
        {gap}
      </span>
    );
  };

  // Render attrition status as clean colored text (No Container Box)
  const renderAttritionStatus = (status) => {
    switch (status) {
      case 'High':
        return (
          <span className="headcount-attrition-status status-high" data-testid="attrition-status-high">
            <span className="attrition-dot"></span>
            <span>High</span>
          </span>
        );
      case 'Medium':
        return (
          <span className="headcount-attrition-status status-medium" data-testid="attrition-status-medium">
            <span className="attrition-dot"></span>
            <span>Medium</span>
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="headcount-attrition-status status-low" data-testid="attrition-status-low">
            <span className="attrition-dot"></span>
            <span>Low</span>
          </span>
        );
    }
  };

  // Render overtime status as clean colored text (No Container Box)
  const renderOvertimeStatus = (status) => {
    switch (status) {
      case 'Very High':
        return (
          <span className="headcount-overtime-status status-very-high" data-testid="overtime-status-very-high">
            <span className="overtime-dot"></span>
            <span>Very High</span>
          </span>
        );
      case 'High':
        return (
          <span className="headcount-overtime-status status-high" data-testid="overtime-status-high">
            <span className="overtime-dot"></span>
            <span>High</span>
          </span>
        );
      case 'Normal':
        return (
          <span className="headcount-overtime-status status-normal" data-testid="overtime-status-normal">
            <span className="overtime-dot"></span>
            <span>Normal</span>
          </span>
        );
      case 'No Data':
      default:
        return (
          <span className="headcount-overtime-status status-no-data" data-testid="overtime-status-no-data">
            <span className="overtime-dot"></span>
            <span>No Data</span>
          </span>
        );
    }
  };

  if (isEmployee) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="headcount-main">
          <div className="headcount-error-banner" data-testid="headcount-access-denied">
            <AlertCircle size={18} />
            <span>Access denied. Regular employees do not have permission to view workforce headcount planning.</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />

      <main className="headcount-main">
        {/* Header */}
        <header className="headcount-header">
          <div className="headcount-title-group">
            <div className="headcount-title-row">
              <h1 className="headcount-title">Headcount vs. Approved Headcount</h1>
              {canEdit ? (
                <span className="headcount-scope-pill editable">
                  <ShieldCheck size={12} />
                  <span>Admin & HR Planning (Editable)</span>
                </span>
              ) : isDeptManager ? (
                <span className="headcount-scope-pill">
                  <Building2 size={12} />
                  <span>Department Manager (View Only)</span>
                </span>
              ) : null}
            </div>
            <p className="headcount-subtitle">
              Monitor department staffing levels, track hiring gaps against approved headcount targets, and update approved numbers inline.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleRefresh}
              disabled={loading || attritionLoading || overtimeLoading}
              className="btn btn-secondary"
              title="Refresh headcount, attrition, and overtime data"
              aria-label="Refresh headcount data"
            >
              <RefreshCw size={15} className={loading || attritionLoading || overtimeLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <Link to="/departments" className="btn btn-secondary" title="View Department Directory">
              <Building2 size={15} />
              <span>Departments</span>
            </Link>
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="headcount-error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="headcount-stats-grid">
          <div className="headcount-stat-card">
            <div className="headcount-stat-icon blue">
              <TrendingUp size={22} />
            </div>
            <div>
              <div className="headcount-stat-label">Approved Target</div>
              <div className="headcount-stat-value">{stats.totalApproved}</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon primary">
              <Users size={22} />
            </div>
            <div>
              <div className="headcount-stat-label">Active Staff</div>
              <div className="headcount-stat-value">{stats.totalCurrent}</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div
              className={`headcount-stat-icon ${
                stats.netGap > 0 ? 'amber' : stats.netGap === 0 ? 'emerald' : 'rose'
              }`}
            >
              {stats.netGap > 0 ? (
                <UserPlus size={22} />
              ) : stats.netGap === 0 ? (
                <CheckCircle2 size={22} />
              ) : (
                <AlertTriangle size={22} />
              )}
            </div>
            <div>
              <div className="headcount-stat-label">Net Gap</div>
              <div className="headcount-stat-value">
                {stats.netGap > 0 ? `+${stats.netGap}` : stats.netGap}
              </div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon amber">
              <UserPlus size={22} />
            </div>
            <div>
              <div className="headcount-stat-label">Needs Hiring</div>
              <div className="headcount-stat-value">{stats.needsHiring} depts</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon emerald">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div className="headcount-stat-label">Balanced</div>
              <div className="headcount-stat-value">{stats.balanced} depts</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon rose">
              <AlertTriangle size={22} />
            </div>
            <div>
              <div className="headcount-stat-label">Overstaffed</div>
              <div className="headcount-stat-value">{stats.overstaffed} depts</div>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="headcount-filter-card">
          <div className="headcount-filter-row">
            <div className="headcount-search-wrapper">
              <Search size={16} className="headcount-search-icon" />
              <input
                type="text"
                placeholder="Search departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="headcount-search-input"
                aria-label="Search departments by name"
              />
            </div>

            <div className="headcount-status-pills">
              {['ALL', 'Needs Hiring', 'Balanced', 'Overstaffed - Review', 'Not Set'].map(
                (filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setStatusFilter(filterKey)}
                    className={`headcount-pill-btn ${
                      statusFilter === filterKey ? 'active' : ''
                    }`}
                  >
                    {filterKey === 'ALL' ? 'All Statuses' : filterKey}
                  </button>
                )
              )}
            </div>

            <div className="headcount-attrition-filter">
              <label htmlFor="attrition-period-select" className="headcount-attrition-label">
                <Calendar size={14} className="headcount-attrition-calendar-icon" />
                <span>Attrition:</span>
              </label>
              <select
                id="attrition-period-select"
                value={attritionPeriod}
                onChange={(e) => setAttritionPeriod(Number(e.target.value))}
                className="headcount-attrition-select"
                data-testid="attrition-period-select"
                aria-label="Attrition Period"
              >
                <option value={3}>Last 3 Months</option>
                <option value={6}>Last 6 Months</option>
                <option value={12}>Last 12 Months</option>
              </select>
            </div>

            <div className="headcount-attrition-filter">
              <label htmlFor="overtime-period-select" className="headcount-attrition-label">
                <Clock size={14} className="headcount-attrition-calendar-icon" />
                <span>Overtime:</span>
              </label>
              <select
                id="overtime-period-select"
                value={overtimePeriod}
                onChange={(e) => setOvertimePeriod(Number(e.target.value))}
                className="headcount-attrition-select"
                data-testid="overtime-period-select"
                aria-label="Overtime Period"
              >
                <option value={1}>Last 1 Month</option>
                <option value={3}>Last 3 Months</option>
                <option value={6}>Last 6 Months</option>
              </select>
            </div>
          </div>
        </div>

        {/* UI Table Card */}
        <div className="headcount-table-card">
          <div className="headcount-table-scroll">
            <table className="headcount-table" data-testid="headcount-table">
              <thead>
                <tr>
                  <th className="headcount-th">Department</th>
                  <th className="headcount-th numeric">Approved</th>
                  <th className="headcount-th numeric">Current</th>
                  <th className="headcount-th numeric">Gap</th>
                  <th className="headcount-th">Status</th>
                  <th className="headcount-th numeric" data-testid="th-attrition-rate">Attrition Rate</th>
                  <th className="headcount-th" data-testid="th-attrition-status">Attrition Status</th>
                  <th className="headcount-th numeric" data-testid="th-overtime-hours">Avg Daily Hours</th>
                  <th className="headcount-th numeric" data-testid="th-overtime-percent">Overtime %</th>
                  <th className="headcount-th" data-testid="th-overtime-status">Overtime Status</th>
                  {canEdit && <th className="headcount-th actions">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="headcount-loading-cell">
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Loading headcount data...</div>
                    </td>
                  </tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="headcount-empty-cell">
                      <div className="headcount-empty-wrapper">
                        <Users size={32} color="var(--text-muted)" />
                        <span className="headcount-empty-title">No departments found</span>
                        <span className="headcount-empty-desc">
                          {search || statusFilter !== 'ALL'
                            ? 'No departments match the selected filter criteria.'
                            : 'No department headcount records available.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((dept) => {
                    const isEditing = editingId === dept.id;
                    const isSaving = savingId === dept.id;

                    return (
                      <tr key={dept.id} className="headcount-tr" data-testid={`headcount-row-${dept.id}`}>
                        {/* Department */}
                        <td className="headcount-td">
                          <div className="headcount-dept-cell">
                            <DepartmentIcon name={dept.name} size={18} badgeSize={34} />
                            <div>
                              <div className="headcount-dept-name">{dept.name}</div>
                              <div className="headcount-dept-id">ID #{dept.id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Approved (with inline edit) */}
                        <td className="headcount-td numeric">
                          {isEditing ? (
                            <div>
                              <div className="headcount-inline-form">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editValue}
                                  onChange={(e) => {
                                    setEditValue(e.target.value);
                                    if (inlineError) setInlineError('');
                                  }}
                                  onKeyDown={(e) => handleKeyDown(e, dept.id)}
                                  className="headcount-inline-input"
                                  autoFocus
                                  disabled={isSaving}
                                  aria-label={`Approved headcount for ${dept.name}`}
                                  data-testid={`inline-input-${dept.id}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveEdit(dept.id)}
                                  disabled={isSaving}
                                  className="headcount-inline-save-btn"
                                  title="Save approved headcount (Enter)"
                                  aria-label="Save approved headcount"
                                  data-testid={`inline-save-${dept.id}`}
                                >
                                  <Check size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={isSaving}
                                  className="headcount-inline-cancel-btn"
                                  title="Cancel edit (Esc)"
                                  aria-label="Cancel edit"
                                  data-testid={`inline-cancel-${dept.id}`}
                                >
                                  <X size={15} />
                                </button>
                              </div>
                              {inlineError && (
                                <div
                                  style={{
                                    fontSize: '0.725rem',
                                    color: '#dc2626',
                                    marginTop: 4,
                                    textAlign: 'right',
                                  }}
                                >
                                  {inlineError}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="headcount-approved-cell">
                              <span className="headcount-num approved" data-testid={`approved-val-${dept.id}`}>
                                {dept.approved}
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(dept)}
                                  className="headcount-inline-edit-btn"
                                  title={`Edit approved headcount for ${dept.name}`}
                                  aria-label={`Edit approved headcount for ${dept.name}`}
                                  data-testid={`inline-edit-btn-${dept.id}`}
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Current Active Staff */}
                        <td className="headcount-td numeric">
                          <Link
                            to={`/employees?department_id=${dept.id}`}
                            className={`headcount-current-link ${
                              dept.current > 0 ? 'has-employees' : ''
                            }`}
                            title={`View active employees in ${dept.name}`}
                            data-testid={`current-link-${dept.id}`}
                          >
                            <Users size={12} />
                            <span data-testid={`current-val-${dept.id}`}>{dept.current}</span>
                            <ArrowRight size={10} />
                          </Link>
                        </td>

                        {/* Gap */}
                        <td className="headcount-td numeric">
                          <span data-testid={`gap-val-${dept.id}`}>
                            {renderGapText(dept.gap, dept.status)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="headcount-td">
                          {renderStatusBadge(dept.status)}
                        </td>

                        {/* Attrition Rate */}
                        <td className="headcount-td numeric">
                          {(() => {
                            const leavers = attritionData[dept.id]?.leavers ?? 0;
                            const attr = calculateAttrition(leavers, dept.current, dept.approved);
                            return (
                              <div className="headcount-attrition-rate-cell">
                                <span className="headcount-attrition-rate" data-testid={`attrition-rate-${dept.id}`}>
                                  {`${attr.attritionRate}%`}
                                </span>
                                <span className="headcount-attrition-leavers" data-testid={`attrition-leavers-${dept.id}`}>
                                  {leavers} {leavers === 1 ? 'leaver' : 'leavers'}
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Attrition Status */}
                        <td className="headcount-td">
                          <div data-testid={`attrition-status-cell-${dept.id}`}>
                            {(() => {
                              const leavers = attritionData[dept.id]?.leavers ?? 0;
                              const attr = calculateAttrition(leavers, dept.current, dept.approved);
                              return renderAttritionStatus(attr.status);
                            })()}
                          </div>
                        </td>

                        {/* Avg Daily Hours */}
                        <td className="headcount-td numeric">
                          <div className="headcount-overtime-cell">
                            <span className="headcount-overtime-hours" data-testid={`overtime-hours-${dept.id}`}>
                              {overtimeData[dept.id] && overtimeData[dept.id].status !== 'No Data'
                                ? `${overtimeData[dept.id].avgDailyHours}h`
                                : '—'}
                            </span>
                            {overtimeData[dept.id]?.attendanceDays > 0 && (
                              <span className="headcount-overtime-days" data-testid={`overtime-days-${dept.id}`}>
                                {overtimeData[dept.id].attendanceDays} {overtimeData[dept.id].attendanceDays === 1 ? 'day' : 'days'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Overtime % */}
                        <td className="headcount-td numeric">
                          <span className="headcount-overtime-percent" data-testid={`overtime-percent-${dept.id}`}>
                            {overtimeData[dept.id] && overtimeData[dept.id].status !== 'No Data'
                              ? `${overtimeData[dept.id].overtimePercent}%`
                              : '—'}
                          </span>
                        </td>

                        {/* Overtime Status */}
                        <td className="headcount-td">
                          <div data-testid={`overtime-status-cell-${dept.id}`}>
                            {renderOvertimeStatus(overtimeData[dept.id]?.status || 'No Data')}
                          </div>
                        </td>

                        {/* Actions (for Admin / HR) */}
                        {canEdit && (
                          <td className="headcount-td actions">
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => startEdit(dept)}
                                className="btn btn-secondary"
                                style={{ padding: '5px 10px', fontSize: '0.75rem', gap: 4 }}
                                data-testid={`action-edit-btn-${dept.id}`}
                              >
                                <Edit2 size={12} />
                                <span>Edit Target</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Headcount;
