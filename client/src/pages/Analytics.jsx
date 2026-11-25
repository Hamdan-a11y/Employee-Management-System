import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  UserX,
  Calendar,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  CalendarDays,
  Building2,
  ChevronLeft,
  ChevronRight,
  Info,
  SlidersHorizontal,
  X,
  Award,
  AlertCircle
} from 'lucide-react';
import './Analytics.css';

const formatMonthStr = (dateObj = new Date()) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatMinutesToHm = (totalMinutes) => {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatHoursVal = (val) => {
  const num = Number(val) || 0;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
};

const STANDARD_SHIFT_HOURS = 8;

const Analytics = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL filters synchronization
  const currentMonth = formatMonthStr(new Date());
  const initialStartMonth = searchParams.get('start_month') || currentMonth;
  const initialEndMonth = searchParams.get('end_month') || currentMonth;
  const initialDept = searchParams.get('department_id') || 'all';
  const initialCompare = searchParams.get('compare') === 'true';

  const [startMonth, setStartMonth] = useState(initialStartMonth);
  const [endMonth, setEndMonth] = useState(initialEndMonth);
  const [departmentId, setDepartmentId] = useState(initialDept);
  const [compareMode, setCompareMode] = useState(initialCompare);
  const [compareType, setCompareType] = useState('department'); // 'department' | 'month'

  // Data states
  const [departments, setDepartments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [deptAttendance, setDeptAttendance] = useState([]);
  const [punctuality, setPunctuality] = useState({ top10: [], bottom10: [] });
  const [absenteeismTrend, setAbsenteeismTrend] = useState([]);
  const [workingHours, setWorkingHours] = useState([]);
  const [overtimeTrend, setOvertimeTrend] = useState([]);
  const [frequentLates, setFrequentLates] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [comparison, setComparison] = useState([]);
  
  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [latesPage, setLatesPage] = useState(1);
  const hoursListRef = useRef(null);
  const topListRef = useRef(null);
  const bottomListRef = useRef(null);
  const [topAtEnd, setTopAtEnd] = useState(false);
  const [bottomAtEnd, setBottomAtEnd] = useState(false);

  // Employee Calendar Modal state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth);
  const [calendarData, setCalendarData] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');

  // Update URL params when filters change
  const updateUrlParams = useCallback((newFilters) => {
    const updated = new URLSearchParams(searchParams);
    if (newFilters.start_month) updated.set('start_month', newFilters.start_month);
    if (newFilters.end_month) updated.set('end_month', newFilters.end_month);
    if (newFilters.department_id) updated.set('department_id', newFilters.department_id);
    if (newFilters.compare !== undefined) updated.set('compare', String(newFilters.compare));
    setSearchParams(updated, { replace: true });
  }, [searchParams, setSearchParams]);

  // Load Department list for dropdown
  useEffect(() => {
    if (!isEmployee) {
      api.get('/departments')
        .then((res) => {
          const depts = res.data.departments || res.data || [];
          setDepartments(Array.isArray(depts) ? depts : []);
        })
        .catch(() => {});
    }
  }, [isEmployee]);

  // Fetch all analytics charts & metrics
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const baseParams = {
        start_month: startMonth,
        end_month: endMonth,
        department_id: departmentId !== 'all' ? departmentId : undefined,
      };
      const queryStr = new URLSearchParams(baseParams).toString();

      // If user is employee, only load their own calendar
      if (isEmployee) {
        setLoading(false);
        return;
      }

      const [
        summaryRes,
        deptAttRes,
        puncRes,
        absentRes,
        hoursRes,
        otRes,
        latesRes,
        compRes,
      ] = await Promise.all([
        api.get(`/analytics/summary?${queryStr}`),
        api.get(`/analytics/department-attendance?${queryStr}`),
        api.get(`/analytics/punctuality-ranking?${queryStr}`),
        api.get(`/analytics/absenteeism-trend?${queryStr}`),
        api.get(`/analytics/working-hours?${queryStr}`),
        api.get(`/analytics/overtime-trend?${queryStr}`),
        api.get(`/analytics/frequent-lates?${queryStr}&page=${latesPage}&limit=8`),
        api.get(`/analytics/comparison?${queryStr}&mode=${compareType}`),
      ]);

      setSummary(summaryRes.data);
      setDeptAttendance(deptAttRes.data.departments || []);
      setPunctuality(puncRes.data);
      setAbsenteeismTrend(absentRes.data.trend || []);
      setWorkingHours(hoursRes.data.working_hours || []);
      setOvertimeTrend(otRes.data.overtime_trend || []);
      setFrequentLates(latesRes.data);
      setComparison(compRes.data.comparison || []);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load analytics data.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  }, [startMonth, endMonth, departmentId, compareType, latesPage, isEmployee, notifyError]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Employee Calendar Fetch
  const fetchEmployeeCalendar = useCallback(async (empId, month) => {
    if (!empId) return;
    try {
      setCalendarLoading(true);
      setCalendarError('');
      const res = await api.get(`/analytics/employee-calendar?employee_id=${empId}&month=${month}`);
      setCalendarData(res.data);
    } catch (err) {
      setCalendarError(err.response?.data?.message || 'Failed to load calendar.');
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // For Employee role: auto-open their calendar on mount
  useEffect(() => {
    if (isEmployee) {
      fetchEmployeeCalendar(user?.employee_id, calendarMonth);
    }
  }, [isEmployee, user?.employee_id, calendarMonth, fetchEmployeeCalendar]);

  const handleOpenCalendar = (empId) => {
    setSelectedEmployeeId(empId);
    fetchEmployeeCalendar(empId, calendarMonth);
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    updateUrlParams({
      start_month: startMonth,
      end_month: endMonth,
      department_id: departmentId,
      compare: compareMode,
    });
    fetchAnalyticsData();
  };

  // Overtime Stacked Totals for max calculation
  const maxOtHours = useMemo(() => {
    if (!overtimeTrend.length) return 10;
    return Math.max(...overtimeTrend.map((t) => t.total_hours || 0), 10);
  }, [overtimeTrend]);

  // Absenteeism Max
  const maxAbsentDays = useMemo(() => {
    if (!absenteeismTrend.length) return 5;
    return Math.max(...absenteeismTrend.map((t) => t.absent_days || 0), 5);
  }, [absenteeismTrend]);

  // Department Attendance: sort lowest first, "No data" (expected_days === 0) at end
  const sortedDeptAttendance = useMemo(() => {
    return [...deptAttendance].sort((a, b) => {
      const aHasData = Number(a.expected_days) > 0;
      const bHasData = Number(b.expected_days) > 0;
      if (aHasData !== bHasData) return aHasData ? -1 : 1;
      return (Number(a.attendance_pct) || 0) - (Number(b.attendance_pct) || 0);
    });
  }, [deptAttendance]);

  // Count ties below 50% so tied low bars use neutral gray instead of all red
  const below50TieMap = useMemo(() => {
    const counts = {};
    sortedDeptAttendance.forEach((d) => {
      const expected = Number(d.expected_days) || 0;
      const pct = Number(d.attendance_pct) || 0;
      if (expected > 0 && pct < 50) {
        counts[pct] = (counts[pct] || 0) + 1;
      }
    });
    return counts;
  }, [sortedDeptAttendance]);

  // Overtime totals per type for legend & summary bar
  const overtimeTotals = useMemo(() => {
    return overtimeTrend.reduce(
      (acc, t) => ({
        regular: acc.regular + (Number(t.regular_hours) || 0),
        weekend: acc.weekend + (Number(t.weekend_hours) || 0),
        holiday: acc.holiday + (Number(t.holiday_hours) || 0),
        total: acc.total + (Number(t.total_hours) || 0),
      }),
      { regular: 0, weekend: 0, holiday: 0, total: 0 }
    );
  }, [overtimeTrend]);

  const activeOtTypes = useMemo(() => {
    const types = [];
    if (overtimeTotals.regular > 0) {
      types.push({ key: 'regular', label: 'Regular', hours: overtimeTotals.regular, cls: 'ot-seg-regular' });
    }
    if (overtimeTotals.weekend > 0) {
      types.push({ key: 'weekend', label: 'Weekend', hours: overtimeTotals.weekend, cls: 'ot-seg-weekend' });
    }
    if (overtimeTotals.holiday > 0) {
      types.push({ key: 'holiday', label: 'Holiday', hours: overtimeTotals.holiday, cls: 'ot-seg-holiday' });
    }
    return types;
  }, [overtimeTotals]);

  const otSingleMonthLabel = useMemo(() => {
    if (overtimeTrend.length === 1) return overtimeTrend[0].month;
    return null;
  }, [overtimeTrend]);

  // Top 5 departments by approved overtime hours from already-loaded data (if present)
  const otByDepartment = useMemo(() => {
    const candidates =
      summary?.overtime_by_department ||
      summary?.by_department ||
      (comparison.length ? comparison : null) ||
      (deptAttendance.length ? deptAttendance : workingHours);

    if (!Array.isArray(candidates)) return [];
    return candidates
      .map((item) => ({
        name: item.department_name || item.name,
        hours: Number(
          item.overtime_hours ??
          item.approved_overtime_hours ??
          item.total_overtime_hours ??
          item.ot_hours
        ),
      }))
      .filter((item) => item.name && !Number.isNaN(item.hours) && item.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }, [summary, comparison, deptAttendance, workingHours]);

  // Working hours: sorted highest first, single month label for header
  const sortedWorkingHours = useMemo(() => {
    return [...workingHours].sort((a, b) => (Number(b.avg_hours) || 0) - (Number(a.avg_hours) || 0));
  }, [workingHours]);

  const maxWorkingHours = useMemo(() => {
    if (!sortedWorkingHours.length) return 0;
    return Math.max(...sortedWorkingHours.map((h) => Number(h.avg_hours) || 0), 0);
  }, [sortedWorkingHours]);

  const hasOverShiftHours = useMemo(() => {
    return sortedWorkingHours.some((h) => (Number(h.avg_hours) || 0) > STANDARD_SHIFT_HOURS);
  }, [sortedWorkingHours]);

  const hoursMonthLabel = useMemo(() => {
    const months = [...new Set(workingHours.map((h) => h.month).filter(Boolean))];
    if (months.length === 1) return months[0];
    if (months.length > 1) return `${months[0]} – ${months[months.length - 1]}`;
    return startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`;
  }, [workingHours, startMonth, endMonth]);

  const sharedRowMonthLabel = useMemo(() => {
    if (hoursMonthLabel) return hoursMonthLabel;
    if (otSingleMonthLabel) return otSingleMonthLabel;
    return startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`;
  }, [hoursMonthLabel, otSingleMonthLabel, startMonth, endMonth]);

  useEffect(() => {
    if (hoursListRef.current) {
      hoursListRef.current.scrollTop = 0;
    }
  }, [sortedWorkingHours, loading]);

  // Punctuality: sorted lists, integer percentages, tie detection
  const sortedTop10 = useMemo(() => {
    const list = [...(punctuality.top10 || [])].sort((a, b) => {
      const pctDiff = Math.round(Number(b.punctuality_pct) || 0) - Math.round(Number(a.punctuality_pct) || 0);
      if (pctDiff !== 0) return pctDiff;
      const aDays = Number(a.present_days ?? a.days_present ?? 0);
      const bDays = Number(b.present_days ?? b.days_present ?? 0);
      return bDays - aDays;
    });
    return list.slice(0, 10);
  }, [punctuality.top10]);

  const sortedBottom10 = useMemo(() => {
    const list = [...(punctuality.bottom10 || [])]
      .filter((emp) => Math.round(Number(emp.punctuality_pct) || 0) < 100)
      .sort((a, b) => {
        const pctDiff = Math.round(Number(a.punctuality_pct) || 0) - Math.round(Number(b.punctuality_pct) || 0);
        if (pctDiff !== 0) return pctDiff;
        const aDays = Number(a.present_days ?? a.days_present ?? 0);
        const bDays = Number(b.present_days ?? b.days_present ?? 0);
        return bDays - aDays;
      });
    return list.slice(0, 10);
  }, [punctuality.bottom10]);

  const analyzeRankingTies = (list) => {
    if (!list.length) return { hasTies: false, tieNote: null, tiedScores: new Set() };
    const counts = {};
    list.forEach((emp) => {
      const pct = Math.round(Number(emp.punctuality_pct) || 0);
      counts[pct] = (counts[pct] || 0) + 1;
    });
    const tiedEntries = Object.entries(counts)
      .filter(([, count]) => count > 1)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    const tiedScores = new Set(tiedEntries.map(([pct]) => Number(pct)));
    const hasTies = tiedEntries.length > 0;
    const tieNote = hasTies
      ? `${tiedEntries[0][1]} employees tied at ${tiedEntries[0][0]}%`
      : null;
    return { hasTies, tieNote, tiedScores };
  };

  const topTieInfo = useMemo(() => analyzeRankingTies(sortedTop10), [sortedTop10]);
  const bottomTieInfo = useMemo(() => analyzeRankingTies(sortedBottom10), [sortedBottom10]);

  const checkScrollAtEnd = useCallback((el) => {
    if (!el) return true;
    return el.scrollHeight <= el.clientHeight + 2 || el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  }, []);

  useEffect(() => {
    if (topListRef.current) {
      topListRef.current.scrollTop = 0;
      setTopAtEnd(checkScrollAtEnd(topListRef.current));
    }
    if (bottomListRef.current) {
      bottomListRef.current.scrollTop = 0;
      setBottomAtEnd(checkScrollAtEnd(bottomListRef.current));
    }
  }, [sortedTop10, sortedBottom10, loading, checkScrollAtEnd]);

  const excludedPunctualityCount = useMemo(() => {
    const raw =
      punctuality?.excluded_count ??
      punctuality?.excluded ??
      punctuality?.excluded_employees ??
      summary?.excluded_count;
    return raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : null;
  }, [punctuality, summary]);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content analytics-main">
        <div className="analytics-container">
          {/* Header */}
          <div className="analytics-header">
            <div>
              <h1 className="analytics-title">Advanced Attendance Analytics</h1>
              <p className="analytics-subtitle">
                Department attendance rates, punctuality rankings, absenteeism velocity, and calendar breakdowns.
              </p>
            </div>
            {!isEmployee && (
              <div className="analytics-header-actions">
                <button
                  type="button"
                  className="analytics-refresh-btn"
                  onClick={fetchAnalyticsData}
                  title="Refresh analytics data"
                >
                  <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            )}
          </div>

          {/* Filters Bar (Admin, HR, Dept Manager) */}
          {!isEmployee && (
            <form className="analytics-filters-card" onSubmit={handleFilterSubmit}>
              <div className="analytics-filter-item">
                <label className="analytics-filter-label">From Month</label>
                <input
                  type="month"
                  className="analytics-input"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </div>

              <div className="analytics-filter-item">
                <label className="analytics-filter-label">To Month</label>
                <input
                  type="month"
                  className="analytics-input"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                />
              </div>

              {(!isDeptManager) && (
                <div className="analytics-filter-item">
                  <label className="analytics-filter-label">Department</label>
                  <select
                    className="analytics-select"
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
              )}

              <div className="analytics-filter-item toggle-item">
                <label className="analytics-filter-label">Side-by-Side Compare</label>
                <button
                  type="button"
                  className={`compare-toggle-pill ${compareMode ? 'active' : ''}`}
                  onClick={() => {
                    const next = !compareMode;
                    setCompareMode(next);
                    updateUrlParams({ compare: next });
                  }}
                >
                  <SlidersHorizontal size={14} />
                  <span>{compareMode ? 'Comparison Active' : 'Enable Compare'}</span>
                </button>
              </div>

              <div className="analytics-filter-actions">
                <button type="submit" className="analytics-apply-btn">
                  Apply Filters
                </button>
              </div>
            </form>
          )}

          {/* Error State */}
          {error && !isEmployee && (
            <div className="analytics-error-banner" role="alert">
              <div className="analytics-error-content">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
              <button
                type="button"
                className="analytics-retry-btn"
                onClick={fetchAnalyticsData}
              >
                Retry
              </button>
            </div>
          )}

          {/* Low Data Notice */}
          {summary?.low_data && !isEmployee && !loading && (
            <div className="low-data-banner">
              <Info size={18} className="text-amber-600" />
              <span>
                <strong>Low Data Notice:</strong> The selected period or department contains fewer than 5 attendance records. Projections and rankings may have limited statistical weight.
              </span>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && !isEmployee && !summary && (
            <div className="analytics-loading-skeleton" aria-busy="true" aria-label="Loading analytics">
              <div className="analytics-kpi-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="kpi-card skeleton-card">
                    <div className="skeleton-line skeleton-sm" />
                    <div className="skeleton-line skeleton-lg" />
                  </div>
                ))}
              </div>
              <div className="analytics-dual-grid">
                {[1, 2].map((n) => (
                  <div key={n} className="analytics-card skeleton-panel">
                    <div className="skeleton-line skeleton-md" />
                    <div className="skeleton-line skeleton-bar" />
                    <div className="skeleton-line skeleton-bar" />
                    <div className="skeleton-line skeleton-bar" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top KPI Summary Metrics */}
          {!isEmployee && summary && (
            <div className="analytics-kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon-wrap bg-blue-50 text-blue-600">
                  <CheckCircle2 size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Overall Attendance</span>
                  <div className="kpi-value">{summary.overall_attendance_pct}%</div>
                  <span className="kpi-meta">{summary.total_present} present days</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap bg-emerald-50 text-emerald-600">
                  <Clock size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Average Work Hours</span>
                  <div className="kpi-value">{summary.avg_hours}h</div>
                  <span className="kpi-meta">per employee / shift</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap bg-amber-50 text-amber-600">
                  <AlertTriangle size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Total Late Check-ins</span>
                  <div className="kpi-value text-amber-700">{summary.total_late}</div>
                  <span className="kpi-meta">past grace window</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon-wrap bg-rose-50 text-rose-600">
                  <UserX size={20} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-label">Total Absences</span>
                  <div className="kpi-value text-rose-700">{summary.total_absences}</div>
                  <span className="kpi-meta">unplanned working days</span>
                </div>
              </div>
            </div>
          )}

          {/* Comparison Mode View */}
          {compareMode && !isEmployee && (
            <div className="analytics-card comparison-section">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Comparative Analysis</h3>
                  <p className="card-desc">Side-by-side performance across departments or months.</p>
                </div>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={`seg-btn ${compareType === 'department' ? 'active' : ''}`}
                    onClick={() => setCompareType('department')}
                  >
                    Departments
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${compareType === 'month' ? 'active' : ''}`}
                    onClick={() => setCompareType('month')}
                  >
                    Month-over-Month
                  </button>
                </div>
              </div>

              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>{compareType === 'department' ? 'Department' : 'Month'}</th>
                      <th>Attendance %</th>
                      <th>Late Count</th>
                      <th>Absences</th>
                      <th>Avg Working Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="empty-table-cell">No comparison data available for this range.</td>
                      </tr>
                    ) : (
                      comparison.map((item, idx) => (
                        <tr key={idx}>
                          <td className="font-semibold text-slate-900">
                            {compareType === 'department' ? item.department_name : item.month}
                          </td>
                          <td>
                            <div className="progress-cell">
                              <span className="font-numeric">{item.attendance_pct}%</span>
                              <div className="progress-track">
                                <div
                                  className="progress-fill bg-blue-600"
                                  style={{ width: `${Math.min(100, item.attendance_pct)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="font-numeric">{item.late_count}</td>
                          <td className="font-numeric text-rose-600">{item.absences}</td>
                          <td className="font-numeric">{item.avg_hours}h</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Core Analytics Grid (First Row: paired 360px height) */}
          {!isEmployee && (
            <div className="analytics-dual-grid analytics-row-paired">
              {/* Chart 1: Department Attendance % Bar Chart */}
              <div className="analytics-card">
                <div className="card-header">
                  <div className="card-header-text">
                    <h3 className="card-title">Department Attendance Rate (%)</h3>
                    <p
                      className="card-desc"
                      title="Present days vs scheduled working days (excludes weekends, holidays, leaves)."
                    >
                      Present days vs scheduled working days (excludes weekends, holidays, leaves).
                    </p>
                  </div>
                </div>

                <div className="card-scroll-wrap">
                  <div className="dept-bars-list card-scroll-body">
                    {sortedDeptAttendance.length === 0 ? (
                      <div className="chart-empty-state">No department attendance records found.</div>
                    ) : (
                      sortedDeptAttendance.map((d) => {
                        const expected = Number(d.expected_days) || 0;
                        const present = Number(d.present_days) || 0;
                        const pct = Number(d.attendance_pct) || 0;
                        const hasData = expected > 0;
                        const isLowTie = hasData && pct < 50 && (below50TieMap[pct] || 0) > 1;
                        const status = !hasData
                          ? 'nodata'
                          : pct < 50
                            ? 'low'
                            : pct <= 80
                              ? 'fair'
                              : 'good';
                        const barStatus = isLowTie ? 'low-tie' : status;
                        const statusLabel = !hasData
                          ? 'No data'
                          : pct < 50
                            ? 'Low'
                            : pct <= 80
                              ? 'Fair'
                              : 'Good';

                        return (
                          <div key={d.department_id} className="dept-bar-row">
                            <div className="dept-bar-label-line">
                              <span className="dept-name" title={d.department_name}>
                                {d.department_name}
                              </span>
                              <span className="dept-stat font-numeric">
                                {hasData ? (
                                  <>
                                    <strong className={`dept-pct-bold ${status === 'low' ? 'status-low-text' : ''}`}>
                                      {pct}%
                                    </strong>{' '}
                                    <span className="dept-days-muted">({present}/{expected}d)</span>
                                  </>
                                ) : (
                                  <span className="dept-no-data">No data</span>
                                )}
                              </span>
                            </div>
                            {hasData && (
                              <div
                                className="dept-bar-track"
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${d.department_name}: ${pct}% (${statusLabel})`}
                              >
                                {pct > 0 && (
                                  <div
                                    className={`dept-bar-fill status-${barStatus}`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Chart 2: Monthly Absenteeism Trend */}
              <div className="analytics-card">
                <div className="card-header">
                  <div className="card-header-text">
                    <h3 className="card-title">Monthly Absenteeism Trend</h3>
                    <p
                      className="card-desc"
                      title="Monthly absent day volume and month-over-month change."
                    >
                      Monthly absent day volume and month-over-month change.
                    </p>
                  </div>
                </div>

                {absenteeismTrend.length < 2 ? (
                  <div className="absent-empty-compact">
                    <div className="chart-empty-state">
                      Need 2+ months of data to show a month-over-month trend.
                    </div>
                    <div className="absent-current-summary">
                      <div className="absent-current-label">
                        {absenteeismTrend.length === 1 ? absenteeismTrend[0].month : endMonth} absences
                      </div>
                      <div className="absent-current-value font-numeric">
                        {absenteeismTrend.length === 1
                          ? absenteeismTrend[0].absent_days
                          : (summary?.total_absences ?? 0)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card-scroll-wrap">
                    <div className="absent-trend-content card-scroll-body">
                      {/* Compact Bar Chart */}
                      <div className="absent-mini-chart" role="img" aria-label="Monthly absenteeism bar chart">
                        {absenteeismTrend.map((row, idx) => {
                          const val = Number(row.absent_days) || 0;
                          const heightPct = maxAbsentDays > 0 ? Math.round((val / maxAbsentDays) * 100) : 0;
                          return (
                            <div key={idx} className="absent-bar-col">
                              <span className="absent-bar-val font-numeric">{val}</span>
                              <div className="absent-bar-well">
                                <div
                                  className="absent-bar-pillar"
                                  style={{ height: `${val > 0 ? Math.max(8, heightPct) : 0}%` }}
                                  title={`${row.month}: ${val} absent days`}
                                />
                              </div>
                              <span className="absent-bar-month">{row.month}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Compact Table */}
                      <div className="trend-table-wrapper">
                        <table className="mini-trend-table">
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th>Absences</th>
                              <th>Prev</th>
                              <th>MoM Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {absenteeismTrend.map((row, idx) => {
                              const prev = Number(row.prev_month_absent_days) || 0;
                              const curr = Number(row.absent_days) || 0;
                              const diff = Number(row.change_from_prev) || 0;

                              return (
                                <tr key={idx}>
                                  <td className="font-semibold text-slate-800">{row.month}</td>
                                  <td className="font-numeric font-bold">{curr}</td>
                                  <td className="font-numeric text-slate-500">{prev}</td>
                                  <td>
                                    {prev === 0 && curr > 0 ? (
                                      <span className="trend-badge trend-new">New</span>
                                    ) : diff > 0 ? (
                                      <span className="trend-badge trend-up">
                                        <ArrowUpRight size={13} aria-hidden="true" />
                                        <span>+{diff} ({row.pct_change}%)</span>
                                      </span>
                                    ) : diff < 0 ? (
                                      <span className="trend-badge trend-down">
                                        <ArrowDownRight size={13} aria-hidden="true" />
                                        <span>{diff} ({row.pct_change}%)</span>
                                      </span>
                                    ) : (
                                      <span className="trend-badge trend-neutral">0 (0.0%)</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Working Hours (60%) & Overtime (40%) Row */}
          {!isEmployee && (
            <div className="analytics-row-group">
              {sharedRowMonthLabel && (
                <div className="analytics-row-subheader">
                  <span className="card-header-meta font-numeric">{sharedRowMonthLabel}</span>
                </div>
              )}

              <div className="analytics-split-grid analytics-row-stretch">
                {/* Left (60%): Average Working Hours Per Department */}
                <div className="analytics-card analytics-card-stretch">
                  <div className="card-header card-header-stacked">
                    <div className="card-title-row">
                      <h3 className="card-title">Average Working Hours</h3>
                      {hasOverShiftHours && (
                        <div className="hours-legend" aria-label="Over shift indicator">
                          <span className="legend-swatch hours-bar-overshift" />
                          <span>Over shift (&gt;{STANDARD_SHIFT_HOURS}h)</span>
                        </div>
                      )}
                    </div>
                    <p className="card-desc" title="Per department, highest first">
                      Per department, highest first
                    </p>
                  </div>

                  {sortedWorkingHours.length === 0 ? (
                    <div className="chart-empty-state">No working hours data available.</div>
                  ) : (
                    <div className="card-scroll-wrap">
                      <div ref={hoursListRef} className="hours-list card-scroll-body">
                        {sortedWorkingHours.map((h, idx) => {
                          const avgH = Number(h.avg_hours) || 0;
                          const relPct = maxWorkingHours > 0 ? Math.min(100, (avgH / maxWorkingHours) * 100) : 0;
                          const isOverShift = avgH > STANDARD_SHIFT_HOURS;
                          return (
                            <div key={idx} className="hours-row">
                              <div className="hours-row-top">
                                <span className="hours-dept-name" title={h.department_name}>
                                  {h.department_name}
                                </span>
                                <div className="hours-val-wrap">
                                  <span className={`hours-val font-numeric ${isOverShift ? 'hours-val-overshift' : ''}`}>
                                    {avgH.toFixed(2)} hrs/day
                                  </span>
                                  <span className="hours-count font-numeric">{h.days_count} days</span>
                                </div>
                              </div>
                              <div
                                className="hours-bar-track"
                                role="progressbar"
                                aria-valuenow={avgH}
                                aria-valuemin={0}
                                aria-valuemax={maxWorkingHours || 1}
                                aria-label={`${h.department_name}: ${avgH.toFixed(2)} hours per day${isOverShift ? ' (over shift)' : ''}`}
                              >
                                {avgH > 0 && (
                                  <div
                                    className={`hours-bar-fill ${isOverShift ? 'hours-bar-overshift' : 'hours-bar-neutral'}`}
                                    style={{ width: `${relPct}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right (40%): Approved Overtime Hours */}
                <div className="analytics-card analytics-card-stretch">
                  <div className="card-header card-header-stacked">
                    <div className="card-title-row">
                      <h3 className="card-title">Approved Overtime Hours</h3>
                    </div>
                    <p className="card-desc" title="Approved hours by type">
                      Approved hours by type
                    </p>
                  </div>

                  {overtimeTrend.length === 0 ? (
                    <div className="chart-empty-state">No approved overtime hours recorded in this range.</div>
                  ) : (
                    <div className="ot-card-body">
                      <div className="ot-hero-total font-numeric">
                        {formatHoursVal(overtimeTotals.total)}h
                      </div>

                      {/* Single 12px rounded stacked bar */}
                      <div
                        className="ot-summary-bar"
                        role="img"
                        aria-label={activeOtTypes.map((t) => `${t.label}: ${formatHoursVal(t.hours)}h`).join(', ') || '0h'}
                      >
                        {overtimeTotals.total > 0 ? (
                          activeOtTypes.map((t) => (
                            <div
                              key={t.key}
                              className={`ot-segment ${t.cls}`}
                              style={{ width: `${(t.hours / overtimeTotals.total) * 100}%` }}
                              title={`${t.label}: ${formatHoursVal(t.hours)}h`}
                            />
                          ))
                        ) : (
                          <div className="ot-zero-bar" />
                        )}
                      </div>

                      {/* Caption per active type below bar */}
                      {activeOtTypes.length > 0 && (
                        <div className="ot-type-captions">
                          {activeOtTypes.map((t) => (
                            <span key={t.key} className="ot-type-caption">
                              <span className={`legend-swatch ${t.cls}`} />
                              <span>{t.label}:</span>
                              <strong className="font-numeric">{formatHoursVal(t.hours)}h</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Month rows only when more than 1 month */}
                      {overtimeTrend.length > 1 && (
                        <div className="overtime-bars-container">
                          {overtimeTrend.map((t, idx) => (
                            <div key={idx} className="ot-month-item">
                              <div className="ot-month-label font-numeric">{t.month}</div>
                              <div
                                className="ot-stacked-bar"
                                role="img"
                                aria-label={`${t.month}: Regular ${formatHoursVal(t.regular_hours)}h, Weekend ${formatHoursVal(t.weekend_hours)}h, Holiday ${formatHoursVal(t.holiday_hours)}h, Total ${formatHoursVal(t.total_hours)}h`}
                              >
                                {t.total_hours > 0 ? (
                                  <>
                                    {Number(t.regular_hours) > 0 && (
                                      <div
                                        className="ot-segment ot-seg-regular"
                                        style={{ width: `${(t.regular_hours / maxOtHours) * 100}%` }}
                                        title={`Regular: ${formatHoursVal(t.regular_hours)}h`}
                                      />
                                    )}
                                    {Number(t.weekend_hours) > 0 && (
                                      <div
                                        className="ot-segment ot-seg-weekend"
                                        style={{ width: `${(t.weekend_hours / maxOtHours) * 100}%` }}
                                        title={`Weekend: ${formatHoursVal(t.weekend_hours)}h`}
                                      />
                                    )}
                                    {Number(t.holiday_hours) > 0 && (
                                      <div
                                        className="ot-segment ot-seg-holiday"
                                        style={{ width: `${(t.holiday_hours / maxOtHours) * 100}%` }}
                                        title={`Holiday: ${formatHoursVal(t.holiday_hours)}h`}
                                      />
                                    )}
                                  </>
                                ) : (
                                  <div className="ot-zero-bar" />
                                )}
                              </div>
                              <div className="ot-total font-numeric">{formatHoursVal(t.total_hours)}h</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Top departments mini-list with thin bars */}
                      {otByDepartment.length > 0 && (
                        <div className="ot-dept-mini">
                          <div className="ot-dept-mini-title">Top departments</div>
                          <div className="ot-dept-mini-list">
                            {otByDepartment.map((d) => {
                              const maxDeptOt = otByDepartment[0].hours || 1;
                              const barPct = Math.min(100, (d.hours / maxDeptOt) * 100);
                              return (
                                <div key={d.name} className="ot-dept-mini-item">
                                  <div className="ot-dept-mini-row">
                                    <span className="ot-dept-mini-name" title={d.name}>{d.name}</span>
                                    <span className="ot-dept-mini-val font-numeric">{formatHoursVal(d.hours)}h</span>
                                  </div>
                                  <div className="ot-dept-bar-track">
                                    <div className="ot-dept-bar-fill" style={{ width: `${barPct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Full-Width Stacked Cards: Punctuality Ranking & Frequent Late Arrivals */}
          {!isEmployee && (
            <div className="analytics-full-stack">
              {/* Punctuality Rankings (2-Column Inside Full-Width Card) */}
              <div className="analytics-card analytics-card-full">
                <div className="card-header card-header-stacked">
                  <div className="card-title-row">
                    <h3 className="card-title">Punctuality Ranking</h3>
                  </div>
                  <p
                    className="card-desc"
                    title={
                      topTieInfo.tieNote || bottomTieInfo.tieNote
                        ? `On-time days / days present. ${topTieInfo.tieNote || bottomTieInfo.tieNote}.`
                        : 'On-time days / days present. Ignores staff with < 5 days present.'
                    }
                  >
                    {topTieInfo.tieNote || bottomTieInfo.tieNote
                      ? `On-time days / days present. ${topTieInfo.tieNote || bottomTieInfo.tieNote}.`
                      : 'On-time days / days present. Ignores staff with < 5 days present.'}
                  </p>
                </div>

                <div className="ranking-lists">
                  {/* Top 10 Column */}
                  <div className="ranking-col">
                    <div className="ranking-col-head">
                      <h4 className="ranking-subtitle">Top 10 most punctual</h4>
                    </div>
                    {sortedTop10.length === 0 ? (
                      <p className="no-rankings-text">No employees qualified (requires &ge; 5 present days).</p>
                    ) : sortedTop10.length > 4 ? (
                      <div
                        ref={topListRef}
                        className="ranking-rows ranking-scroll-box"
                        tabIndex={0}
                        aria-label="Top 10 most punctual employees, scrollable"
                      >
                        {sortedTop10.map((emp) => {
                          const pct = Math.round(Number(emp.punctuality_pct ?? 0));
                          const pctColorClass = pct >= 90 ? 'rank-pct-green' : pct >= 70 ? 'rank-pct-amber' : 'rank-pct-red';
                          return (
                            <div key={emp.employee_id} className="ranking-item">
                              <div className="rank-emp-info">
                                <button
                                  type="button"
                                  className="rank-name-link"
                                  onClick={() => handleOpenCalendar(emp.employee_id)}
                                  title="View employee attendance calendar"
                                >
                                  {emp.employee_name}
                                </button>
                                <span className="rank-dept">{emp.department_name}</span>
                              </div>
                              <div className={`rank-rate ${pctColorClass} font-numeric`}>
                                {pct}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ranking-rows">
                        {sortedTop10.map((emp) => {
                          const pct = Math.round(Number(emp.punctuality_pct ?? 0));
                          const pctColorClass = pct >= 90 ? 'rank-pct-green' : pct >= 70 ? 'rank-pct-amber' : 'rank-pct-red';
                          return (
                            <div key={emp.employee_id} className="ranking-item">
                              <div className="rank-emp-info">
                                <button
                                  type="button"
                                  className="rank-name-link"
                                  onClick={() => handleOpenCalendar(emp.employee_id)}
                                  title="View employee attendance calendar"
                                >
                                  {emp.employee_name}
                                </button>
                                <span className="rank-dept">{emp.department_name}</span>
                              </div>
                              <div className={`rank-rate ${pctColorClass} font-numeric`}>
                                {pct}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom 10 Column */}
                  <div className="ranking-col">
                    <div className="ranking-col-head">
                      <h4 className="ranking-subtitle">Bottom 10 needs attention</h4>
                    </div>
                    {sortedBottom10.length === 0 ? (
                      <p className="no-rankings-text">Everyone is at 100%</p>
                    ) : sortedBottom10.length >= 4 ? (
                      <div
                        ref={bottomListRef}
                        className="ranking-rows ranking-scroll-box"
                        tabIndex={0}
                        aria-label="Bottom 10 needs attention employees, scrollable"
                      >
                        {sortedBottom10.map((emp) => {
                          const pct = Math.round(Number(emp.punctuality_pct ?? 0));
                          const pctColorClass = pct >= 90 ? 'rank-pct-green' : pct >= 70 ? 'rank-pct-amber' : 'rank-pct-red';
                          return (
                            <div key={emp.employee_id} className="ranking-item">
                              <div className="rank-emp-info">
                                <button
                                  type="button"
                                  className="rank-name-link"
                                  onClick={() => handleOpenCalendar(emp.employee_id)}
                                  title="View employee attendance calendar"
                                >
                                  {emp.employee_name}
                                </button>
                                <span className="rank-dept">{emp.department_name}</span>
                              </div>
                              <div className={`rank-rate ${pctColorClass} font-numeric`}>
                                {pct}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <div className="ranking-rows">
                          {sortedBottom10.map((emp) => {
                            const pct = Math.round(Number(emp.punctuality_pct ?? 0));
                            const pctColorClass = pct >= 90 ? 'rank-pct-green' : pct >= 70 ? 'rank-pct-amber' : 'rank-pct-red';
                            return (
                              <div key={emp.employee_id} className="ranking-item">
                                <div className="rank-emp-info">
                                  <button
                                    type="button"
                                    className="rank-name-link"
                                    onClick={() => handleOpenCalendar(emp.employee_id)}
                                    title="View employee attendance calendar"
                                  >
                                    {emp.employee_name}
                                  </button>
                                  <span className="rank-dept">{emp.department_name}</span>
                                </div>
                                <div className={`rank-rate ${pctColorClass} font-numeric`}>
                                  {pct}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="ranking-short-note font-numeric">
                          Only {sortedBottom10.length} {sortedBottom10.length === 1 ? 'employee' : 'employees'} below 100%
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {excludedPunctualityCount !== null && (
                  <div className="ranking-footer-note font-numeric">
                    {excludedPunctualityCount} {excludedPunctualityCount === 1 ? 'employee' : 'employees'} excluded (fewer than 5 days present)
                  </div>
                )}
              </div>

              {/* Frequent Late Arrivals Table (Full-Width Card) */}
              <div className="analytics-card analytics-card-full late-arrivals-card">
                <div className="card-header card-header-stacked">
                  <div className="card-title-row">
                    <h3 className="card-title">Frequent Late Arrivals</h3>
                  </div>
                  <p
                    className="card-desc"
                    title="Most late days and time lost"
                  >
                    Most late days and time lost
                  </p>
                </div>

                <div className="late-table-wrapper">
                  <table className="comparison-table late-table">
                    <colgroup>
                      <col className="late-col-emp" />
                      <col className="late-col-days" />
                      <col className="late-col-lost" />
                      <col className="late-col-avg" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th className="late-num-col">Late Days</th>
                        <th className="late-num-col">Lost Time</th>
                        <th className="late-num-col">Avg Late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frequentLates.items.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-table-cell">No late check-ins recorded for this period.</td>
                        </tr>
                      ) : (
                        frequentLates.items.slice(0, 10).map((emp) => (
                          <tr key={emp.employee_id}>
                            <td>
                              <div className="rank-emp-info">
                                <button
                                  type="button"
                                  className="rank-name-link"
                                  onClick={() => handleOpenCalendar(emp.employee_id)}
                                  title="View employee attendance calendar"
                                >
                                  {emp.employee_name}
                                </button>
                                <span className="rank-dept">{emp.department_name}</span>
                              </div>
                            </td>
                            <td className="late-num-col late-regular-num font-numeric">{emp.late_days}</td>
                            <td className="late-num-col late-lost-bold font-numeric">{formatMinutesToHm(emp.total_late_minutes)}</td>
                            <td className="late-num-col late-regular-num font-numeric">{formatMinutesToHm(emp.avg_late_minutes)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Employee Attendance Calendar Section (or Modal) */}
          {(selectedEmployeeId || isEmployee) && (
            <div className={`calendar-section-card ${!isEmployee ? 'is-modal-mode' : ''}`}>
              <div className="calendar-card-header">
                <div>
                  <h3 className="card-title">
                    Attendance Calendar: {calendarData?.employee?.name || 'Employee'}
                  </h3>
                  <p className="card-desc">
                    Daily attendance breakdown for {calendarData?.employee?.department_name || 'Organization'} — {calendarMonth}.
                  </p>
                </div>
                <div className="calendar-header-controls">
                  <input
                    type="month"
                    className="calendar-month-picker"
                    value={calendarMonth}
                    onChange={(e) => {
                      setCalendarMonth(e.target.value);
                      if (selectedEmployeeId || user?.employee_id) {
                        fetchEmployeeCalendar(selectedEmployeeId || user?.employee_id, e.target.value);
                      }
                    }}
                  />
                  {!isEmployee && (
                    <button
                      type="button"
                      className="close-cal-btn"
                      onClick={() => setSelectedEmployeeId(null)}
                      title="Close calendar view"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Day Types Legend */}
              <div className="calendar-legend-bar">
                <span className="cal-legend-pill cal-present">
                  <span className="legend-indicator" /> Present (On-Time)
                </span>
                <span className="cal-legend-pill cal-late">
                  <span className="legend-indicator" /> Late Arrival
                </span>
                <span className="cal-legend-pill cal-absent">
                  <span className="legend-indicator" /> Absent
                </span>
                <span className="cal-legend-pill cal-leave">
                  <span className="legend-indicator" /> Approved Leave
                </span>
                <span className="cal-legend-pill cal-holiday">
                  <span className="legend-indicator" /> Public Holiday
                </span>
                <span className="cal-legend-pill cal-weekend">
                  <span className="legend-indicator" /> Weekend Off
                </span>
              </div>

              {calendarLoading ? (
                <div className="calendar-loading-box">
                  <RefreshCw size={24} className="spin-icon" />
                  <p>Loading employee attendance calendar...</p>
                </div>
              ) : calendarError ? (
                <div className="calendar-error-box">
                  <AlertCircle size={20} />
                  <span>{calendarError}</span>
                </div>
              ) : calendarData?.days ? (
                <div className="calendar-grid">
                  {calendarData.days.map((dayItem) => (
                    <div
                      key={dayItem.day}
                      className={`calendar-cell cell-${dayItem.type}`}
                      title={`${dayItem.date}: ${dayItem.status_label}${dayItem.check_in ? ` | In: ${new Date(dayItem.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${dayItem.check_out ? ` | Out: ${new Date(dayItem.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                    >
                      <div className="cell-top">
                        <span className="cell-day-num">{dayItem.day}</span>
                        <span className="cell-type-badge">{dayItem.type}</span>
                      </div>
                      <div className="cell-body">
                        <span className="cell-status-text">{dayItem.status_label}</span>
                        {dayItem.check_in && (
                          <div className="cell-time-detail">
                            <span>{new Date(dayItem.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {dayItem.check_out && <span> - {new Date(dayItem.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                        )}
                        {dayItem.total_hours > 0 && (
                          <div className="cell-hours-badge font-numeric">{dayItem.total_hours}h</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="calendar-empty-box">No calendar records available for this month.</div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Analytics;
