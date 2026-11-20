import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Calendar,
  CalendarDays,
  Plus,
  Edit2,
  Trash2,
  List,
  Building2,
  Lock,
  RotateCcw,
  Search,
  Check,
  X,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import './Holidays.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Holidays = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const canManageHolidays = Boolean(isAdmin || isHR);
  const { success, error: notifyError } = useNotification();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);

  // Modal / Side Panel State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    name: '',
    date: '',
    end_date: '',
    scope: 'all',
    department_id: ''
  });

  // Load Departments
  useEffect(() => {
    api.get('/departments')
      .then((res) => setDepartments(res.data || []))
      .catch(() => {});
  }, []);

  // Fetch Holidays
  const fetchHolidays = useCallback(async () => {
    try {
      setLoading(true);
      const params = { year: selectedYear };
      if (departmentFilter !== 'all') params.department_id = departmentFilter;

      const res = await api.get('/holidays', { params });
      setHolidays(res.data.holidays || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load holidays.');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, departmentFilter, notifyError]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingHolidayId(null);
    setFormError('');
    setForm({
      name: '',
      date: `${selectedYear}-01-01`,
      end_date: '',
      scope: 'all',
      department_id: ''
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (h) => {
    if (h.is_locked) {
      notifyError('This holiday falls in a closed or locked attendance month and cannot be modified.');
      return;
    }
    setEditingHolidayId(h.id);
    setFormError('');
    setForm({
      name: h.name,
      date: h.date,
      end_date: h.end_date || '',
      scope: h.scope,
      department_id: h.department_id || ''
    });
    setIsModalOpen(true);
  };

  // Save Holiday Handler
  const handleSaveHoliday = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Holiday name is required.');
      return;
    }
    if (!form.date) {
      setFormError('Start date is required.');
      return;
    }
    if (form.end_date && form.end_date < form.date) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }
    if (form.scope === 'department' && !form.department_id) {
      setFormError('Please select a department for department-scoped holiday.');
      return;
    }

    try {
      setSavingHoliday(true);
      const payload = {
        name: form.name.trim(),
        date: form.date,
        end_date: form.end_date || null,
        scope: form.scope,
        department_id: form.scope === 'department' ? form.department_id : null
      };

      if (editingHolidayId) {
        const res = await api.put(`/holidays/${editingHolidayId}`, payload);
        success(res.data.message || 'Holiday updated successfully.');
        if (res.data.recalculatedLeaves?.length > 0) {
          success(`Automatically refunded balance for ${res.data.recalculatedLeaves.length} overlapping leave request(s)!`);
        }
      } else {
        const res = await api.post('/holidays', payload);
        success(res.data.message || 'Holiday created successfully.');
        if (res.data.recalculatedLeaves?.length > 0) {
          success(`Automatically refunded balance for ${res.data.recalculatedLeaves.length} overlapping leave request(s)!`);
        }
      }

      setIsModalOpen(false);
      fetchHolidays();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save holiday.');
    } finally {
      setSavingHoliday(false);
    }
  };

  // Delete Holiday Handler
  const handleDeleteHoliday = async (h) => {
    if (h.is_locked) {
      notifyError('This holiday falls in a closed or locked attendance month and cannot be deleted.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete holiday "${h.name}"? Any leaves that were discounted for this holiday will be recalculated.`)) {
      return;
    }

    try {
      const res = await api.delete(`/holidays/${h.id}`);
      success(res.data.message || 'Holiday deleted.');
      fetchHolidays();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to delete holiday.');
    }
  };

  // Filtered Holidays for List View
  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        (h.department_name && h.department_name.toLowerCase().includes(q))
      );
    });
  }, [holidays, searchQuery]);

  // Calendar View Month Data Generator
  const calendarMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const firstDay = new Date(selectedYear, monthIndex, 1);
      const startingDayOfWeek = firstDay.getDay(); // 0 = Sun
      const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();

      const days = [];
      // Empty offset cells for days before first of month
      for (let i = 0; i < startingDayOfWeek; i++) {
        days.push({ empty: true });
      }

      // Populate actual days
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = (startingDayOfWeek + d - 1) % 7;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Check matching holidays
        const matchingHolidays = holidays.filter((h) => {
          const start = h.date;
          const end = h.end_date || h.date;
          return dateStr >= start && dateStr <= end;
        });

        days.push({
          empty: false,
          day: d,
          dateStr,
          isWeekend,
          holidays: matchingHolidays
        });
      }

      return {
        monthIndex,
        monthName: MONTH_NAMES[monthIndex],
        days
      };
    });
  }, [selectedYear, holidays]);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content holidays-main">
        {/* Header */}
        <div className="holidays-header">
          <div>
            <h1 className="holidays-title">Public Holidays & Calendar</h1>
            <p className="holidays-subtitle">
              Manage national, festival, and departmental holidays. Automatically integrated into attendance, absence, overtime, and leave calculations.
            </p>
          </div>

          <div className="holidays-header-actions">
            {canManageHolidays && (
              <button type="button" onClick={handleOpenCreate} className="btn btn-primary">
                <Plus size={16} />
                <span>Add Holiday</span>
              </button>
            )}
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="card holidays-toolbar-card">
          <div className="holidays-toolbar">
            {/* Year Selector */}
            <div className="holidays-year-selector">
              <button
                type="button"
                onClick={() => setSelectedYear((prev) => prev - 1)}
                className="btn btn-secondary btn-sm"
                title="Previous Year"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="holidays-current-year">{selectedYear}</span>
              <button
                type="button"
                onClick={() => setSelectedYear((prev) => prev + 1)}
                className="btn btn-secondary btn-sm"
                title="Next Year"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Department Filter */}
            {!isEmployee && (
              <div className="holidays-dept-filter">
                <Building2 size={15} className="text-muted" />
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="select holidays-select"
                >
                  <option value="all">All Departments / Scopes</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Input (List view) */}
            {viewMode === 'list' && (
              <div className="holidays-search-box">
                <Search size={15} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search holidays..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input holidays-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="btn btn-ghost btn-xs"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="holidays-view-toggle">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                title="List View"
              >
                <List size={16} />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                title="Calendar View"
              >
                <CalendarDays size={16} />
                <span>Calendar</span>
              </button>
            </div>
          </div>
        </div>

        {/* VIEW 1: LIST VIEW */}
        {viewMode === 'list' && (
          <div className="card holidays-table-card">
            <div className="table-responsive">
              <table className="holidays-table">
                <thead>
                  <tr>
                    <th>Holiday Name</th>
                    <th>Date / Duration</th>
                    <th>Scope</th>
                    <th>Department</th>
                    <th>Locked Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="holidays-empty-td">
                        Loading holidays for {selectedYear}...
                      </td>
                    </tr>
                  ) : filteredHolidays.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="holidays-empty-td">
                        No public holidays found for {selectedYear}.
                      </td>
                    </tr>
                  ) : (
                    filteredHolidays.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <div className="holiday-name-cell">
                            <span className="font-semibold text-primary">{h.name}</span>
                            {h.end_date && h.end_date !== h.date && (
                              <span className="badge badge-multi">Multi-day</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="holiday-dates-cell font-mono text-sm">
                            <span>{h.date}</span>
                            {h.end_date && h.end_date !== h.date && (
                              <span className="text-muted"> to {h.end_date}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              h.scope === 'all' ? 'badge-scope-all' : 'badge-scope-dept'
                            }`}
                          >
                            {h.scope === 'all' ? 'All Employees' : 'Department Specific'}
                          </span>
                        </td>
                        <td>{h.department_name || '—'}</td>
                        <td>
                          {h.is_locked ? (
                            <span
                              className="badge badge-locked"
                              title="Locked by closed attendance/payroll month"
                            >
                              <Lock size={12} />
                              <span>Closed Month</span>
                            </span>
                          ) : (
                            <span className="badge badge-open">Open</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="holidays-actions-row">
                            {canManageHolidays && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(h)}
                                  disabled={h.is_locked}
                                  className="btn btn-secondary btn-xs"
                                  title={
                                    h.is_locked
                                      ? 'Locked by closed payroll month'
                                      : 'Edit Holiday'
                                  }
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHoliday(h)}
                                  disabled={h.is_locked}
                                  className="btn btn-danger btn-xs"
                                  title={
                                    h.is_locked
                                      ? 'Locked by closed payroll month'
                                      : 'Delete Holiday'
                                  }
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 2: CALENDAR VIEW */}
        {viewMode === 'calendar' && (
          <div className="holidays-calendar-grid">
            {calendarMonths.map((m) => (
              <div key={m.monthIndex} className="card holiday-month-card">
                <div className="holiday-month-header">
                  <h3 className="holiday-month-title">{m.monthName}</h3>
                </div>
                <div className="holiday-month-weekdays">
                  <span>S</span>
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                </div>
                <div className="holiday-month-days-grid">
                  {m.days.map((d, idx) => {
                    if (d.empty) {
                      return <div key={`empty-${idx}`} className="month-day-cell empty"></div>;
                    }
                    const hasHoliday = d.holidays.length > 0;
                    return (
                      <div
                        key={d.dateStr}
                        className={`month-day-cell ${d.isWeekend ? 'weekend' : ''} ${
                          hasHoliday ? 'has-holiday' : ''
                        }`}
                        title={
                          hasHoliday
                            ? d.holidays.map((h) => `${h.name} (${h.scope})`).join(', ')
                            : d.isWeekend
                            ? 'Weekend'
                            : 'Working Day'
                        }
                      >
                        <span className="day-number">{d.day}</span>
                        {hasHoliday && <span className="holiday-indicator-dot"></span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL: ADD / EDIT HOLIDAY */}
        {isModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
            <div
              className="modal-content holiday-form-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Calendar size={20} className="modal-title-icon" />
                  <h2 className="modal-title">
                    {editingHolidayId ? 'Edit Public Holiday' : 'Add Public Holiday'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveHoliday}>
                <div className="modal-body holiday-modal-body">
                  {formError && (
                    <div className="holiday-alert-danger" role="alert">
                      <AlertCircle size={16} />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      Holiday Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eid-ul-Fitr, Independence Day"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="input"
                    />
                  </div>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">
                        Start Date <span className="required">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={form.date}
                        onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                        className="input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">End Date (Optional for Multi-Day)</label>
                      <input
                        type="date"
                        min={form.date || undefined}
                        value={form.end_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                        className="input"
                      />
                      <span className="text-xs text-muted">
                        Leave blank for single-day holidays.
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Applicable Scope</label>
                    <div className="holiday-scope-radios">
                      <label className="holiday-radio-card">
                        <input
                          type="radio"
                          name="scope"
                          value="all"
                          checked={form.scope === 'all'}
                          onChange={() => setForm((prev) => ({ ...prev, scope: 'all' }))}
                        />
                        <span>All Employees (Company-wide)</span>
                      </label>

                      <label className="holiday-radio-card">
                        <input
                          type="radio"
                          name="scope"
                          value="department"
                          checked={form.scope === 'department'}
                          onChange={() => setForm((prev) => ({ ...prev, scope: 'department' }))}
                        />
                        <span>Specific Department Only</span>
                      </label>
                    </div>
                  </div>

                  {form.scope === 'department' && (
                    <div className="form-group">
                      <label className="form-label">
                        Target Department <span className="required">*</span>
                      </label>
                      <select
                        required
                        value={form.department_id}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, department_id: e.target.value }))
                        }
                        className="select"
                      >
                        <option value="">Select Department...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="holiday-info-notice">
                    <Info size={16} className="text-primary flex-shrink-0" />
                    <p className="text-xs text-muted">
                      Adding or editing a holiday will automatically recalculate overlapping approved employee leave requests, refunding any working days covered by this holiday back to their leave balances.
                    </p>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="btn btn-secondary"
                    disabled={savingHoliday}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingHoliday}>
                    {savingHoliday ? 'Saving...' : editingHolidayId ? 'Save Changes' : 'Create Holiday'}
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

export default Holidays;
