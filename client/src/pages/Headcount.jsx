import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { DepartmentIcon } from '../utils/departmentIcons';
import { calculateHeadcountStatus, calculateAttrition } from '../utils/headcount';
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
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  ArrowUpDown,
  ShieldCheck,
  RefreshCw,
  Building2,
  Calendar,
  CalendarOff,
  Clock,
  SlidersHorizontal,
  Info,
  Target,
  Diff,
  Activity,
  Compass,
  ShieldAlert,
} from 'lucide-react';
import './Headcount.css';

const Headcount = () => {
  const { isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { success, error: notifyError } = useNotification();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Shared & advanced period selectors
  const [sharedPeriod, setSharedPeriod] = useState(3);
  const [showAdvancedPeriods, setShowAdvancedPeriods] = useState(false);
  const [attritionPeriod, setAttritionPeriod] = useState(3);
  const [overtimePeriod, setOvertimePeriod] = useState(3);
  const [leavePeriod, setLeavePeriod] = useState(3);

  const [attritionData, setAttritionData] = useState({});
  const [attritionLoading, setAttritionLoading] = useState(false);
  const [overtimeData, setOvertimeData] = useState({});
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [leaveData, setLeaveData] = useState({});
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Sorting state: field ('name' | 'gap' | 'attention'), dir ('asc' | 'desc')
  const [sortBy, setSortBy] = useState({ field: 'attention', dir: 'desc' });

  // Side drawer state
  const [selectedDeptId, setSelectedDeptId] = useState(null);

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [inlineError, setInlineError] = useState('');

  // Admin and HR Manager: view all and edit; Dept Manager: view own dept; Employee: no access
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

  const fetchLeavePressure = async (period = leavePeriod) => {
    try {
      setLeaveLoading(true);
      const res = await api.get(`/workforce/leave-pressure?months=${period}`);
      const map = {};
      if (Array.isArray(res.data)) {
        res.data.forEach((item) => {
          map[item.id] = item;
        });
      }
      setLeaveData(map);
    } catch (err) {
      console.error('Failed to load workforce leave pressure data', err);
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchHeadcount(),
      fetchAttrition(attritionPeriod),
      fetchOvertime(overtimePeriod),
      fetchLeavePressure(leavePeriod),
    ]);
  };

  const handleSharedPeriodChange = (val) => {
    const num = Number(val);
    setSharedPeriod(num);
    setAttritionPeriod(num);
    setOvertimePeriod(num > 6 ? 6 : num);
    setLeavePeriod(num > 6 ? 6 : num);
  };

  useEffect(() => {
    document.title = 'Workforce Planning';
  }, []);

  useEffect(() => {
    if (!isEmployee) fetchHeadcount();
  }, [isEmployee]);

  useEffect(() => {
    if (!isEmployee) fetchAttrition(attritionPeriod);
  }, [isEmployee, attritionPeriod]);

  useEffect(() => {
    if (!isEmployee) fetchOvertime(overtimePeriod);
  }, [isEmployee, overtimePeriod]);

  useEffect(() => {
    if (!isEmployee) fetchLeavePressure(leavePeriod);
  }, [isEmployee, leavePeriod]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && selectedDeptId !== null && editingId === null) {
        setSelectedDeptId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDeptId, editingId]);

  const startEdit = (dept) => {
    if (!canEdit) return;
    setEditingId(dept.id);
    setEditValue(String(dept.approved));
    setInlineError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
    setInlineError('');
  };

  const saveEdit = async (deptId) => {
    const trimmed = String(editValue).trim();
    if (trimmed === '') {
      setInlineError('Headcount is required.');
      return;
    }

    const num = Number(trimmed);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      setInlineError('Must be an integer >= 0');
      return;
    }

    try {
      setSavingId(deptId);
      setInlineError('');

      await api.put(`/departments/${deptId}/approved-headcount`, {
        approved_headcount: num,
      });

      setDepartments((prev) =>
        prev.map((d) => {
          if (d.id === deptId) {
            const approved = num;
            const current = Number(d.current) || 0;
            const gap = approved - current;
            const status = calculateHeadcountStatus(approved, current);
            return { ...d, approved, gap, status };
          }
          return d;
        })
      );

      success('Approved headcount updated.');
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

  const handleKeyDown = (e, deptId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(deptId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Compute attention score for a department (used for Needs Attention KPI & Attention sorting)
  const getAttentionScore = (dept) => {
    let score = 0;
    if (dept.status === 'Needs Hiring' || dept.status === 'Overstaffed - Review') score += 3;
    const leavers = attritionData[dept.id]?.leavers ?? 0;
    const attr = calculateAttrition(leavers, dept.current, dept.approved);
    if (attr.status === 'High') score += 2;
    else if (attr.status === 'Medium') score += 1;

    const otStatus = overtimeData[dept.id]?.status || 'No Data';
    if (otStatus === 'Very High') score += 2;
    else if (otStatus === 'High') score += 1;

    const lvStatus = leaveData[dept.id]?.status || 'Low';
    if (lvStatus === 'High') score += 2;
    else if (lvStatus === 'Medium') score += 1;

    return score;
  };

  const stats = useMemo(() => {
    const totalApproved = departments.reduce((sum, d) => sum + (Number(d.approved) || 0), 0);
    const totalCurrent = departments.reduce((sum, d) => sum + (Number(d.current) || 0), 0);
    const netGap = totalApproved - totalCurrent;
    const needsHiring = departments.filter((d) => d.status === 'Needs Hiring').length;
    const balanced = departments.filter((d) => d.status === 'Balanced').length;
    const overstaffed = departments.filter((d) => d.status === 'Overstaffed - Review').length;
    const notSet = departments.filter((d) => d.status === 'Not Set').length;
    const needsAttention = departments.filter(
      (d) => d.status === 'Needs Hiring' || d.status === 'Overstaffed - Review' || getAttentionScore(d) >= 3
    ).length;

    return {
      totalApproved,
      totalCurrent,
      netGap,
      needsAttention,
      needsHiring,
      balanced,
      overstaffed,
      notSet,
    };
  }, [departments, attritionData, overtimeData, leaveData]);

  const filteredAndSortedDepartments = useMemo(() => {
    const filtered = departments.filter((dept) => {
      const matchesSearch = dept.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchesStatus =
        statusFilter === 'ALL' || dept.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      const factor = sortBy.dir === 'asc' ? 1 : -1;
      if (sortBy.field === 'name') {
        return a.name.localeCompare(b.name) * factor;
      }
      if (sortBy.field === 'gap') {
        return ((Number(a.gap) || 0) - (Number(b.gap) || 0)) * factor;
      }
      // attention
      const scoreDiff = getAttentionScore(a) - getAttentionScore(b);
      if (scoreDiff !== 0) return scoreDiff * factor;
      return a.name.localeCompare(b.name);
    });
  }, [departments, search, statusFilter, sortBy, attritionData, overtimeData, leaveData]);

  const toggleSort = (field) => {
    setSortBy((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'name' ? 'asc' : 'desc' }
    );
  };

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === selectedDeptId) || null,
    [departments, selectedDeptId]
  );

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Needs Hiring':
        return (
          <span className="headcount-status-text status-needs-hiring" data-testid="status-badge-needs-hiring">
            <UserPlus size={14} className="headcount-status-icon" />
            <span>Needs Hiring</span>
          </span>
        );
      case 'Balanced':
        return (
          <span className="headcount-status-text status-balanced" data-testid="status-badge-balanced">
            <UserCheck size={14} className="headcount-status-icon" />
            <span>Balanced</span>
          </span>
        );
      case 'Overstaffed - Review':
        return (
          <span className="headcount-status-text status-overstaffed" data-testid="status-badge-overstaffed">
            <UserMinus size={14} className="headcount-status-icon" />
            <span>Overstaffed</span>
          </span>
        );
      case 'Not Set':
      default:
        return (
          <span className="headcount-status-text status-not-set" data-testid="status-badge-not-set">
            <HelpCircle size={14} className="headcount-status-icon" />
            <span>Not Set</span>
          </span>
        );
    }
  };

  const renderGapText = (gap, status) => {
    if (status === 'Not Set') {
      return <span className="headcount-gap-text gap-not-set" title="Approved target is 0">—</span>;
    }
    if (gap > 0) {
      return <span className="headcount-gap-text gap-positive" title={`${gap} positions open`}>+{gap}</span>;
    }
    if (gap === 0) {
      return <span className="headcount-gap-text gap-zero" title="Headcount is balanced">0</span>;
    }
    return <span className="headcount-gap-text gap-negative" title={`${Math.abs(gap)} over target`}>{gap}</span>;
  };

  const getSignalTone = (kind, status) => {
    if (kind === 'attrition') {
      return status === 'High' ? 'high' : status === 'Medium' ? 'medium' : 'low';
    }
    if (kind === 'overtime') {
      return status === 'Very High' ? 'high' : status === 'High' ? 'medium' : status === 'Normal' ? 'low' : 'neutral';
    }
    // leave
    return status === 'High' ? 'high' : status === 'Medium' ? 'medium' : 'low';
  };

  if (isEmployee) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="headcount-main">
          <div className="headcount-error-banner" data-testid="headcount-access-denied">
            <AlertCircle size={18} />
            <span>Access denied. Regular employees do not have permission to view workforce planning.</span>
          </div>
        </main>
      </div>
    );
  }

  const filterChips = [
    { key: 'ALL', label: 'All', count: departments.length },
    { key: 'Needs Hiring', label: 'Needs Hiring', count: stats.needsHiring },
    { key: 'Balanced', label: 'Balanced', count: stats.balanced },
    { key: 'Overstaffed - Review', label: 'Overstaffed', count: stats.overstaffed },
    { key: 'Not Set', label: 'Not Set', count: stats.notSet },
  ];

  return (
    <div className="app-container">
      <Sidebar />

      <main className="headcount-main">
        {/* Header */}
        <header className="headcount-header">
          <div className="headcount-title-group">
            <div className="headcount-title-row">
              <h1 className="headcount-title">Workforce Planning</h1>
              {canEdit ? (
                <span className="headcount-scope-pill editable">
                  <ShieldCheck size={12} />
                  <span>Admin & HR</span>
                </span>
              ) : isDeptManager ? (
                <span className="headcount-scope-pill">
                  <Building2 size={12} />
                  <span>Department View</span>
                </span>
              ) : null}
            </div>
            <p className="headcount-subtitle">
              Track headcount targets, staffing gaps, and workforce risk signals by department.
            </p>
          </div>

          <div className="headcount-header-actions">
            <button
              onClick={handleRefresh}
              disabled={loading || attritionLoading || overtimeLoading || leaveLoading}
              className="btn btn-secondary"
              title="Refresh workforce planning data"
              aria-label="Refresh workforce planning data"
            >
              <RefreshCw size={15} className={loading || attritionLoading || overtimeLoading || leaveLoading ? 'animate-spin' : ''} />
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
          <div className="headcount-error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Single Row of 4 Summary Metrics */}
        <div className="headcount-stats-grid">
          <div className="headcount-stat-card">
            <div className="headcount-stat-icon accent">
              <Target size={20} />
            </div>
            <div>
              <div className="headcount-stat-label">Approved Target</div>
              <div className="headcount-stat-value">{stats.totalApproved}</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon neutral">
              <Users size={20} />
            </div>
            <div>
              <div className="headcount-stat-label">Active Staff</div>
              <div className="headcount-stat-value">{stats.totalCurrent}</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon amber">
              <Diff size={20} />
            </div>
            <div>
              <div className="headcount-stat-label">Net Gap</div>
              <div className="headcount-stat-value">{stats.netGap > 0 ? `+${stats.netGap}` : stats.netGap}</div>
            </div>
          </div>

          <div className="headcount-stat-card">
            <div className="headcount-stat-icon rose">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="headcount-stat-label">Needs Attention</div>
              <div className="headcount-stat-value">{stats.needsAttention} depts</div>
            </div>
          </div>
        </div>

        {/* Compact Single-Line Filters */}
        <div className="headcount-filter-card">
          <div className="headcount-filter-row">
            <div className="headcount-search-wrapper">
              <Search size={15} className="headcount-search-icon" />
              <input
                type="text"
                placeholder="Search departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="headcount-search-input"
                aria-label="Search departments by name"
              />
            </div>

            <div className="headcount-status-pills" role="group" aria-label="Filter by staffing status">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusFilter(chip.key)}
                  className={`headcount-pill-btn ${statusFilter === chip.key ? 'active' : ''}`}
                >
                  <span>{chip.label}</span>
                  <span className="headcount-pill-count">{chip.count}</span>
                </button>
              ))}
            </div>

            <div className="headcount-period-controls">
              <label htmlFor="shared-period-select" className="headcount-period-label">
                <Calendar size={14} />
                <span>Period:</span>
              </label>
              <select
                id="shared-period-select"
                value={sharedPeriod}
                onChange={(e) => handleSharedPeriodChange(e.target.value)}
                className="headcount-period-select"
                aria-label="Shared analysis period"
              >
                <option value={1}>Last 1 Month</option>
                <option value={3}>Last 3 Months</option>
                <option value={6}>Last 6 Months</option>
                <option value={12}>Last 12 Months</option>
              </select>

              <button
                type="button"
                className={`headcount-adv-btn ${showAdvancedPeriods ? 'active' : ''}`}
                onClick={() => setShowAdvancedPeriods((prev) => !prev)}
                aria-expanded={showAdvancedPeriods}
              >
                <SlidersHorizontal size={13} />
                <span>Advanced</span>
              </button>
            </div>
          </div>

          {showAdvancedPeriods && (
            <div className="headcount-advanced-row">
              <div className="headcount-adv-item">
                <label htmlFor="attrition-period-select">Attrition:</label>
                <select
                  id="attrition-period-select"
                  value={attritionPeriod}
                  onChange={(e) => setAttritionPeriod(Number(e.target.value))}
                  className="headcount-period-select"
                  data-testid="attrition-period-select"
                >
                  <option value={3}>Last 3 Months</option>
                  <option value={6}>Last 6 Months</option>
                  <option value={12}>Last 12 Months</option>
                </select>
              </div>
              <div className="headcount-adv-item">
                <label htmlFor="overtime-period-select">Overtime:</label>
                <select
                  id="overtime-period-select"
                  value={overtimePeriod}
                  onChange={(e) => setOvertimePeriod(Number(e.target.value))}
                  className="headcount-period-select"
                  data-testid="overtime-period-select"
                >
                  <option value={1}>Last 1 Month</option>
                  <option value={3}>Last 3 Months</option>
                  <option value={6}>Last 6 Months</option>
                </select>
              </div>
              <div className="headcount-adv-item">
                <label htmlFor="leave-period-select">Leave Pressure:</label>
                <select
                  id="leave-period-select"
                  value={leavePeriod}
                  onChange={(e) => setLeavePeriod(Number(e.target.value))}
                  className="headcount-period-select"
                  data-testid="leave-period-select"
                >
                  <option value={1}>Last 1 Month</option>
                  <option value={3}>Last 3 Months</option>
                  <option value={6}>Last 6 Months</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 6-Column Table Card (No horizontal scroll on laptop; stacked cards on mobile) */}
        <div className="headcount-table-card">
          <table className="headcount-table" data-testid="headcount-table">
            <thead>
              <tr>
                <th className="headcount-th headcount-col-dept">
                  <button type="button" className="headcount-sort-btn" onClick={() => toggleSort('name')}>
                    <span>Department</span>
                    <ArrowUpDown size={12} className={`headcount-sort-icon ${sortBy.field === 'name' ? 'active' : ''}`} />
                  </button>
                </th>
                <th className="headcount-th numeric">Approved</th>
                <th className="headcount-th numeric">Current</th>
                <th className="headcount-th numeric">
                  <button type="button" className="headcount-sort-btn numeric" onClick={() => toggleSort('gap')}>
                    <span>Gap</span>
                    <ArrowUpDown size={12} className={`headcount-sort-icon ${sortBy.field === 'gap' ? 'active' : ''}`} />
                  </button>
                </th>
                <th className="headcount-th">Recommendation</th>
                <th className="headcount-th headcount-col-signals">
                  <button type="button" className="headcount-sort-btn" onClick={() => toggleSort('attention')}>
                    <span>Signals</span>
                    <ArrowUpDown size={12} className={`headcount-sort-icon ${sortBy.field === 'attention' ? 'active' : ''}`} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="headcount-loading-cell">
                    <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading workforce data...</div>
                  </td>
                </tr>
              ) : filteredAndSortedDepartments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="headcount-empty-cell">
                    <div className="headcount-empty-wrapper">
                      <Users size={30} color="var(--text-muted)" />
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
                filteredAndSortedDepartments.map((dept) => {
                  const isEditing = editingId === dept.id;
                  const isSaving = savingId === dept.id;

                  const leavers = attritionData[dept.id]?.leavers ?? 0;
                  const attr = calculateAttrition(leavers, dept.current, dept.approved);
                  const ot = overtimeData[dept.id] || {};
                  const lv = leaveData[dept.id] || {};

                  const otStatus = ot.status || 'No Data';
                  const lvStatus = lv.status || 'Low';

                  const attrTooltip = `Attrition: ${attr.status}, last ${attritionPeriod} months, ${leavers} ${leavers === 1 ? 'leaver' : 'leavers'}`;
                  const otTooltip = otStatus !== 'No Data'
                    ? `Overtime: ${otStatus}, last ${overtimePeriod} months, ${ot.avgDailyHours}h/day`
                    : `Overtime: No Data, last ${overtimePeriod} months`;
                  const lvTooltip = `Leave: ${lvStatus}, last ${leavePeriod} months, avg ${lv.avgOnLeave ?? 0} on leave`;

                  return (
                    <tr
                      key={dept.id}
                      className={`headcount-tr clickable ${selectedDeptId === dept.id ? 'selected' : ''}`}
                      data-testid={`headcount-row-${dept.id}`}
                      tabIndex={0}
                      onClick={() => setSelectedDeptId(dept.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDeptId(dept.id);
                        }
                      }}
                    >
                      {/* 1. Department */}
                      <td className="headcount-td" data-label="Department">
                        <div className="headcount-dept-cell">
                          <DepartmentIcon name={dept.name} size={17} badgeSize={32} />
                          <div>
                            <div className="headcount-dept-name">{dept.name}</div>
                            <div className="headcount-dept-id">ID #{dept.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Approved (with inline edit) */}
                      <td
                        className="headcount-td numeric"
                        data-label="Approved"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                                title="Save (Enter)"
                                aria-label="Save approved headcount"
                                data-testid={`inline-save-${dept.id}`}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={isSaving}
                                className="headcount-inline-cancel-btn"
                                title="Cancel (Esc)"
                                aria-label="Cancel edit"
                                data-testid={`inline-cancel-${dept.id}`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {inlineError && (
                              <div className="headcount-inline-error">{inlineError}</div>
                            )}
                          </div>
                        ) : (
                          <div className="headcount-approved-cell">
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
                            <span className="headcount-num approved" data-testid={`approved-val-${dept.id}`}>
                              {dept.approved}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 3. Current */}
                      <td
                        className="headcount-td numeric"
                        data-label="Current"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          to={`/employees?department_id=${dept.id}`}
                          className={`headcount-current-link ${dept.current > 0 ? 'has-employees' : ''}`}
                          title={`View active employees in ${dept.name}`}
                          data-testid={`current-link-${dept.id}`}
                        >
                          <Users size={12} />
                          <span data-testid={`current-val-${dept.id}`}>{dept.current}</span>
                          <ArrowRight size={10} />
                        </Link>
                      </td>

                      {/* 4. Gap */}
                      <td className="headcount-td numeric" data-label="Gap">
                        <span data-testid={`gap-val-${dept.id}`}>
                          {renderGapText(dept.gap, dept.status)}
                        </span>
                      </td>

                      {/* 5. Recommendation */}
                      <td className="headcount-td" data-label="Recommendation">
                        {renderStatusBadge(dept.status)}
                      </td>

                      {/* 6. Signals (vertically stacked 3-column grid per line: dot | label | value) */}
                      <td className="headcount-td headcount-col-signals" data-label="Signals">
                        <div className="headcount-signals-stack">
                          <div
                            className={`headcount-signal-line tone-${getSignalTone('attrition', attr.status)}`}
                            title={attrTooltip}
                            data-testid={`attrition-rate-${dept.id}`}
                          >
                            <span className="signal-dot" aria-hidden="true" />
                            <span className="signal-label">Attrition</span>
                            <span className="sr-only">{attr.status}</span>
                            <span className="signal-value">{attr.attritionRate}%</span>
                          </div>

                          <div
                            className={`headcount-signal-line tone-${getSignalTone('overtime', otStatus)}`}
                            title={otTooltip}
                            data-testid={`overtime-percent-${dept.id}`}
                          >
                            <span className="signal-dot" aria-hidden="true" />
                            <span className="signal-label">Overtime</span>
                            <span className="sr-only">{otStatus}</span>
                            <span className="signal-value">{otStatus !== 'No Data' ? `${ot.overtimePercent}%` : '—'}</span>
                          </div>

                          <div
                            className={`headcount-signal-line tone-${getSignalTone('leave', lvStatus)}`}
                            title={lvTooltip}
                            data-testid={`leave-pressure-${dept.id}`}
                          >
                            <span className="signal-dot" aria-hidden="true" />
                            <span className="signal-label">Leave</span>
                            <span className="sr-only">{lvStatus}</span>
                            <span className="signal-value">{lv.leavePressure ?? 0}%</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Department Details Side Panel */}
      {selectedDept && (
        <div
          className="headcount-drawer-backdrop"
          onClick={() => setSelectedDeptId(null)}
        >
          <aside
            className="headcount-drawer"
            role="dialog"
            aria-label={`${selectedDept.name} workforce breakdown`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="headcount-drawer-header">
              <div className="headcount-dept-cell">
                <DepartmentIcon name={selectedDept.name} size={18} badgeSize={36} />
                <div>
                  <h2 className="headcount-drawer-title">{selectedDept.name}</h2>
                  <div className="headcount-dept-id">Department ID #{selectedDept.id}</div>
                </div>
              </div>
              <button
                type="button"
                className="headcount-drawer-close"
                onClick={() => setSelectedDeptId(null)}
                aria-label="Close details panel"
              >
                <X size={18} />
              </button>
            </div>

            <div className="headcount-drawer-body">
              <div className="headcount-drawer-status-row">
                {renderStatusBadge(selectedDept.status)}
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8125rem', gap: 6 }}
                    onClick={() => {
                      startEdit(selectedDept);
                      setSelectedDeptId(null);
                    }}
                    data-testid={`action-edit-btn-${selectedDept.id}`}
                  >
                    <Edit2 size={13} />
                    <span>Edit Target</span>
                  </button>
                )}
              </div>

              <div className="headcount-drawer-kpis">
                <div className="drawer-kpi">
                  <span>Approved Target</span>
                  <strong>{selectedDept.approved}</strong>
                </div>
                <div className="drawer-kpi">
                  <span>Active Staff</span>
                  <strong>{selectedDept.current}</strong>
                </div>
                <div className="drawer-kpi">
                  <span>Net Gap</span>
                  <strong>{renderGapText(selectedDept.gap, selectedDept.status)}</strong>
                </div>
              </div>

              {(() => {
                const leavers = attritionData[selectedDept.id]?.leavers ?? 0;
                const attr = calculateAttrition(leavers, selectedDept.current, selectedDept.approved);
                const ot = overtimeData[selectedDept.id] || {};
                const lv = leaveData[selectedDept.id] || {};
                const isLowConfidence =
                  (Number(selectedDept.current) || 0) < 5 ||
                  ot.status === 'No Data' ||
                  (ot.attendanceDays || 0) < 5;

                return (
                  <>
                    {isLowConfidence && (
                      <div className="headcount-low-conf-note">
                        <Info size={15} />
                        <span>
                          Low-confidence note: small headcount or limited attendance days in this period; interpret percentages alongside raw counts.
                        </span>
                      </div>
                    )}

                    <div className="drawer-metric-section">
                      <h3><UserMinus size={14} aria-hidden="true" /> Attrition ({attritionPeriod} months)</h3>
                      <div className="drawer-metric-grid">
                        <div><span>Rate</span><strong>{attr.attritionRate}%</strong></div>
                        <div><span>Leavers</span><strong>{leavers}</strong></div>
                        <div><span>Status</span><strong>{attr.status}</strong></div>
                      </div>
                    </div>

                    <div className="drawer-metric-section">
                      <h3><Clock size={14} aria-hidden="true" /> Overtime ({overtimePeriod} months)</h3>
                      <div className="drawer-metric-grid">
                        <div><span>Avg Daily Hours</span><strong>{ot.status && ot.status !== 'No Data' ? `${ot.avgDailyHours}h` : '—'}</strong></div>
                        <div><span>Overtime %</span><strong>{ot.status && ot.status !== 'No Data' ? `${ot.overtimePercent}%` : '—'}</strong></div>
                        <div><span>Attendance Days</span><strong>{ot.attendanceDays ?? 0}</strong></div>
                        <div><span>Status</span><strong>{ot.status || 'No Data'}</strong></div>
                      </div>
                    </div>

                    <div className="drawer-metric-section">
                      <h3><CalendarOff size={14} aria-hidden="true" /> Leave Pressure ({leavePeriod} months)</h3>
                      <div className="drawer-metric-grid">
                        <div><span>Avg On Leave</span><strong>{lv.avgOnLeave ?? 0}</strong></div>
                        <div><span>Leave Pressure %</span><strong>{lv.leavePressure ?? 0}%</strong></div>
                        <div><span>Total Leave Days</span><strong>{lv.totalLeaveDays ?? 0}</strong></div>
                        <div><span>Status</span><strong>{lv.status || 'Low'}</strong></div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default Headcount;
