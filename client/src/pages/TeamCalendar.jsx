import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Calendar,
  Users,
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Info,
  Clock,
  Sparkles,
  CalendarDays
} from 'lucide-react';
import './TeamCalendar.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TeamCalendar = () => {
  const { user, isAdmin, isHR, isDeptManager } = useAuth();
  const { error: notifyError } = useNotification();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [departmentId, setDepartmentId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [departments, setDepartments] = useState([]);
  const [calendarData, setCalendarData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load Departments
  useEffect(() => {
    api.get('/departments')
      .then((res) => {
        setDepartments(res.data || []);
        if (isDeptManager && user?.department_id) {
          setDepartmentId(String(user.department_id));
        }
      })
      .catch(() => {});
  }, [isDeptManager, user?.department_id]);

  // Fetch Team Calendar
  const fetchCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const params = { month: monthStr };
      if (departmentId !== 'all') {
        params.department_id = departmentId;
      }

      const res = await api.get('/calendar/team-calendar', { params });
      setCalendarData(res.data);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load team calendar.');
    } finally {
      setLoading(false);
    }
  }, [year, month, departmentId, notifyError]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // Month Navigation Handlers
  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((prev) => prev - 1);
    } else {
      setMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((prev) => prev + 1);
    } else {
      setMonth((prev) => prev + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (!calendarData?.employees) return [];
    if (!searchQuery.trim()) return calendarData.employees;
    const q = searchQuery.toLowerCase();
    return calendarData.employees.filter(
      (emp) =>
        emp.name?.toLowerCase().includes(q) ||
        emp.department_name?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q)
    );
  }, [calendarData, searchQuery]);

  // Legend cell class mapper
  const getCellClass = (item) => {
    switch (item.status) {
      case 'present':
        return 'cell-present';
      case 'late':
        return 'cell-late';
      case 'absent':
        return 'cell-absent';
      case 'leave':
        return 'cell-leave';
      case 'half_day_leave':
        return 'cell-half-leave';
      case 'holiday':
        return 'cell-holiday';
      case 'holiday_work':
        return 'cell-holiday-work';
      case 'weekend_work':
        return 'cell-weekend-work';
      case 'weekend':
        return 'cell-weekend';
      default:
        return 'cell-working-pending';
    }
  };

  const getCellShortCode = (item) => {
    switch (item.status) {
      case 'present':
        return 'P';
      case 'late':
        return 'L';
      case 'absent':
        return 'A';
      case 'leave':
        return 'LV';
      case 'half_day_leave':
        return '½L';
      case 'holiday':
        return 'H';
      case 'holiday_work':
        return 'HW';
      case 'weekend_work':
        return 'WW';
      case 'weekend':
        return '—';
      default:
        return '·';
    }
  };

  const days = calendarData?.days || [];

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content team-cal-main">
        {/* Header */}
        <div className="team-cal-header">
          <div>
            <h1 className="team-cal-title">Team Calendar & Leave Schedule</h1>
            <p className="team-cal-subtitle">
              Comprehensive monthly view of department schedules, public holidays, weekends, approved leaves, and attendance.
            </p>
          </div>

          <div className="team-cal-header-actions">
            <button type="button" onClick={handleToday} className="btn btn-secondary btn-sm">
              Today
            </button>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="card team-cal-toolbar-card">
          <div className="team-cal-toolbar">
            {/* Month & Year Navigator */}
            <div className="team-cal-month-nav">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="btn btn-secondary btn-sm"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="team-cal-current-label">
                <Calendar size={16} className="text-primary" />
                <span className="team-cal-month-text">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="btn btn-secondary btn-sm"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Department Filter */}
            {(!isDeptManager || isAdmin || isHR) && (
              <div className="team-cal-filter-item">
                <Building2 size={15} className="text-muted" />
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="select team-cal-select"
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

            {/* Employee Search */}
            <div className="team-cal-search-box">
              <Search size={15} className="text-muted" />
              <input
                type="text"
                placeholder="Search team member..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input team-cal-search-input"
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="team-cal-legend-bar">
          <div className="legend-item">
            <span className="legend-dot cell-present"></span>
            <span>Present</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-late"></span>
            <span>Late</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-absent"></span>
            <span>Absent</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-leave"></span>
            <span>Leave</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-half-leave"></span>
            <span>Half-Day</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-holiday"></span>
            <span>Holiday</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-holiday-work"></span>
            <span>Holiday Work</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-weekend-work"></span>
            <span>Weekend Work</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot cell-weekend"></span>
            <span>Weekend</span>
          </div>
        </div>

        {/* Matrix Grid Card */}
        <div className="card team-cal-matrix-card">
          {loading ? (
            <div className="team-cal-loading">Loading team schedule for {MONTH_NAMES[month - 1]} {year}...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="team-cal-empty">No active employees found matching the current filters.</div>
          ) : (
            <div className="team-cal-table-wrapper">
              <table className="team-cal-table">
                <thead>
                  <tr>
                    <th className="th-employee-fixed">Team Member</th>
                    {days.map((d) => (
                      <th
                        key={d.date}
                        className={`th-day ${d.isWeekend ? 'th-weekend' : ''} ${
                          d.isHoliday ? 'th-holiday' : ''
                        }`}
                        title={d.isHoliday ? d.holidayName : d.isWeekend ? 'Weekend' : 'Working Day'}
                      >
                        <div className="th-day-content">
                          <span className="th-day-num">{d.day}</span>
                          <span className="th-day-name">{d.dayName}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="td-employee-fixed">
                        <div className="emp-info-wrap">
                          <span className="emp-name">{emp.name}</span>
                          <span className="emp-sub">{emp.department_name || 'No Dept'}</span>
                        </div>
                      </td>
                      {emp.schedule.map((item) => {
                        const cellClass = getCellClass(item);
                        const shortCode = getCellShortCode(item);
                        return (
                          <td
                            key={item.date}
                            className={`td-day-cell ${cellClass}`}
                            title={`${emp.name} on ${item.date}: ${item.label || item.status}`}
                          >
                            <span className="cell-code">{shortCode}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TeamCalendar;
