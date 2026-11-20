import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
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

          {/* Low Data Notice */}
          {summary?.low_data && !isEmployee && (
            <div className="low-data-banner">
              <Info size={18} className="text-amber-600" />
              <span>
                <strong>Low Data Notice:</strong> The selected period or department contains fewer than 5 attendance records. Projections and rankings may have limited statistical weight.
              </span>
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

          {/* Core Analytics Grid */}
          {!isEmployee && (
            <div className="analytics-dual-grid">
              {/* Chart 1: Department Attendance % Bar Chart */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Department Attendance Rate (%)</h3>
                    <p className="card-desc">Present days vs scheduled working days (excludes weekends, holidays, leaves).</p>
                  </div>
                </div>

                <div className="dept-bars-list">
                  {deptAttendance.length === 0 ? (
                    <div className="chart-empty-state">No department attendance records found.</div>
                  ) : (
                    deptAttendance.map((d) => (
                      <div key={d.department_id} className="dept-bar-row">
                        <div className="dept-bar-label-line">
                          <span className="dept-name">{d.department_name}</span>
                          <span className="dept-stat font-numeric">
                            <strong>{d.attendance_pct}%</strong> ({d.present_days}/{d.expected_days}d)
                          </span>
                        </div>
                        <div className="dept-bar-track">
                          <div
                            className={`dept-bar-fill ${d.attendance_pct >= 90 ? 'bg-emerald-500' : d.attendance_pct >= 75 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, d.attendance_pct)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chart 2: Monthly Absenteeism Velocity with LAG */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Monthly Absenteeism Trend</h3>
                    <p className="card-desc">Absent day volume with month-over-month rate of change using LAG().</p>
                  </div>
                </div>

                <div className="trend-table-wrapper">
                  {absenteeismTrend.length === 0 ? (
                    <div className="chart-empty-state">No absenteeism recorded for this duration.</div>
                  ) : (
                    <table className="mini-trend-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Absences</th>
                          <th>Prev Month</th>
                          <th>MoM Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absenteeismTrend.map((row, idx) => (
                          <tr key={idx}>
                            <td className="font-semibold text-slate-800">{row.month}</td>
                            <td className="font-numeric font-bold">{row.absent_days}</td>
                            <td className="font-numeric text-slate-500">{row.prev_month_absent_days}</td>
                            <td>
                              {row.change_from_prev > 0 ? (
                                <span className="trend-badge trend-up">
                                  <ArrowUpRight size={13} />
                                  <span>+{row.change_from_prev} ({row.pct_change}%)</span>
                                </span>
                              ) : row.change_from_prev < 0 ? (
                                <span className="trend-badge trend-down">
                                  <ArrowDownRight size={13} />
                                  <span>{row.change_from_prev} ({row.pct_change}%)</span>
                                </span>
                              ) : (
                                <span className="trend-badge trend-neutral">0 (0.0%)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Overtime & Working Hours Grid */}
          {!isEmployee && (
            <div className="analytics-dual-grid">
              {/* Overtime Trend Stacked Bars */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Approved Overtime Hours</h3>
                    <p className="card-desc">Monthly overtime volume classified by regular, weekend, and holiday.</p>
                  </div>
                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-dot bg-blue-500" /> Regular</span>
                    <span className="legend-item"><span className="legend-dot bg-emerald-500" /> Weekend</span>
                    <span className="legend-item"><span className="legend-dot bg-purple-500" /> Holiday</span>
                  </div>
                </div>

                <div className="overtime-bars-container">
                  {overtimeTrend.length === 0 ? (
                    <div className="chart-empty-state">No approved overtime hours recorded in this range.</div>
                  ) : (
                    overtimeTrend.map((t, idx) => (
                      <div key={idx} className="ot-month-item">
                        <div className="ot-month-label">{t.month}</div>
                        <div className="ot-stacked-bar">
                          {t.total_hours > 0 ? (
                            <>
                              <div
                                className="ot-segment bg-blue-500"
                                style={{ width: `${(t.regular_hours / maxOtHours) * 100}%` }}
                                title={`Regular: ${t.regular_hours}h`}
                              />
                              <div
                                className="ot-segment bg-emerald-500"
                                style={{ width: `${(t.weekend_hours / maxOtHours) * 100}%` }}
                                title={`Weekend: ${t.weekend_hours}h`}
                              />
                              <div
                                className="ot-segment bg-purple-500"
                                style={{ width: `${(t.holiday_hours / maxOtHours) * 100}%` }}
                                title={`Holiday: ${t.holiday_hours}h`}
                              />
                            </>
                          ) : (
                            <div className="ot-zero-bar" />
                          )}
                        </div>
                        <div className="ot-total font-numeric">{t.total_hours}h</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Average Working Hours Per Department */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Average Working Hours</h3>
                    <p className="card-desc">Recorded productive hours per department and month.</p>
                  </div>
                </div>

                <div className="hours-list">
                  {workingHours.length === 0 ? (
                    <div className="chart-empty-state">No working hours data available.</div>
                  ) : (
                    workingHours.map((h, idx) => (
                      <div key={idx} className="hours-row">
                        <div className="hours-dept-info">
                          <span className="hours-dept-name">{h.department_name}</span>
                          <span className="hours-month">{h.month}</span>
                        </div>
                        <div className="hours-val-wrap">
                          <span className="hours-val font-numeric">{h.avg_hours} hrs/day</span>
                          <span className="hours-count font-numeric">({h.days_count} entries)</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tables: Punctuality Ranking & Frequent Lates */}
          {!isEmployee && (
            <div className="analytics-dual-grid">
              {/* Punctuality Rankings (Top & Bottom 10) */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Punctuality Ranking (Top & Bottom 10)</h3>
                    <p className="card-desc">On-time days / days present. Ignores staff with &lt; 5 days present.</p>
                  </div>
                </div>

                <div className="ranking-lists">
                  <div className="ranking-col">
                    <h4 className="ranking-subtitle text-emerald-700">Top 10 Most Punctual</h4>
                    {punctuality.top10.length === 0 ? (
                      <p className="no-rankings-text">No employees qualified (requires &ge; 5 present days).</p>
                    ) : (
                      punctuality.top10.map((emp) => (
                        <div key={emp.employee_id} className="ranking-item">
                          <div className="rank-badge gold">#{emp.rank_pos}</div>
                          <div className="rank-emp-info">
                            <button
                              type="button"
                              className="rank-name-link"
                              onClick={() => handleOpenCalendar(emp.employee_id)}
                              title="View employee calendar"
                            >
                              {emp.employee_name}
                            </button>
                            <span className="rank-dept">{emp.department_name}</span>
                          </div>
                          <div className="rank-rate font-numeric text-emerald-600">
                            {emp.punctuality_pct}%
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="ranking-col">
                    <h4 className="ranking-subtitle text-amber-700">Bottom 10 Needs Attention</h4>
                    {punctuality.bottom10.length === 0 ? (
                      <p className="no-rankings-text">No employees qualified.</p>
                    ) : (
                      punctuality.bottom10.map((emp) => (
                        <div key={emp.employee_id} className="ranking-item">
                          <div className="rank-badge warn">#{emp.rank_pos}</div>
                          <div className="rank-emp-info">
                            <button
                              type="button"
                              className="rank-name-link"
                              onClick={() => handleOpenCalendar(emp.employee_id)}
                              title="View employee calendar"
                            >
                              {emp.employee_name}
                            </button>
                            <span className="rank-dept">{emp.department_name}</span>
                          </div>
                          <div className="rank-rate font-numeric text-amber-600">
                            {emp.punctuality_pct}%
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Frequent Late Arrivals Table */}
              <div className="analytics-card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">Frequent Late Arrivals</h3>
                    <p className="card-desc">Employees with highest volume of tardiness and total lost minutes.</p>
                  </div>
                </div>

                <div className="late-table-wrapper">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Late Days</th>
                        <th>Total Lost Time</th>
                        <th>Avg Late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frequentLates.items.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="empty-table-cell">No late check-ins recorded for this period.</td>
                        </tr>
                      ) : (
                        frequentLates.items.map((emp) => (
                          <tr key={emp.employee_id}>
                            <td>
                              <button
                                type="button"
                                className="rank-name-link"
                                onClick={() => handleOpenCalendar(emp.employee_id)}
                              >
                                {emp.employee_name}
                              </button>
                            </td>
                            <td className="text-slate-600">{emp.department_name}</td>
                            <td className="font-numeric font-bold text-amber-700">{emp.late_days}</td>
                            <td className="font-numeric">{emp.total_late_minutes} mins</td>
                            <td className="font-numeric text-slate-500">{emp.avg_late_minutes}m</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {frequentLates.totalPages > 1 && (
                    <div className="table-pagination">
                      <button
                        type="button"
                        disabled={latesPage <= 1}
                        onClick={() => setLatesPage((p) => Math.max(1, p - 1))}
                        className="page-nav-btn"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="page-nav-text">Page {latesPage} of {frequentLates.totalPages}</span>
                      <button
                        type="button"
                        disabled={latesPage >= frequentLates.totalPages}
                        onClick={() => setLatesPage((p) => Math.min(frequentLates.totalPages, p + 1))}
                        className="page-nav-btn"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
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
