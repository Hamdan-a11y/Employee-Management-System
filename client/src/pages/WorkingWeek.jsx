import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Calendar,
  Clock,
  History,
  Building2,
  Layers,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import './WorkingWeek.css';

const DAYS = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' }
];

const WorkingWeek = () => {
  const { user, isAdmin, isHR } = useAuth();
  const canManage = Boolean(isAdmin || isHR);
  const { success, error: notifyError } = useNotification();

  // Scope selection
  const [scope, setScope] = useState('company'); // 'company' | 'department' | 'shift'
  const [departmentId, setDepartmentId] = useState('');
  const [shiftId, setShiftId] = useState('');

  // Dropdown options
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);

  // Active / Current working week config
  const [currentConfig, setCurrentConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // History records
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form state for creating a new versioned policy
  const todayStr = new Date().toISOString().slice(0, 10);
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr);
  const [daysState, setDaysState] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Fetch departments & shifts on mount
  useEffect(() => {
    api.get('/departments')
      .then((res) => setDepartments(res.data || []))
      .catch(() => {});

    api.get('/shifts')
      .then((res) => setShifts(res.data.shifts || res.data || []))
      .catch(() => {});
  }, []);

  // Fetch current config & history whenever scope changes
  const fetchData = useCallback(async () => {
    if (scope === 'department' && !departmentId) {
      setCurrentConfig(null);
      setHistoryRecords([]);
      return;
    }
    if (scope === 'shift' && !shiftId) {
      setCurrentConfig(null);
      setHistoryRecords([]);
      return;
    }

    try {
      setLoadingConfig(true);
      setLoadingHistory(true);
      const params = { scope };
      if (scope === 'department') params.department_id = departmentId;
      if (scope === 'shift') params.shift_id = shiftId;

      const [currentRes, historyRes] = await Promise.all([
        api.get('/working-week/current', { params }),
        api.get('/working-week/history', { params })
      ]);

      const cfg = currentRes.data.config;
      setCurrentConfig(cfg);
      if (cfg) {
        setDaysState({
          monday: Boolean(cfg.monday),
          tuesday: Boolean(cfg.tuesday),
          wednesday: Boolean(cfg.wednesday),
          thursday: Boolean(cfg.thursday),
          friday: Boolean(cfg.friday),
          saturday: Boolean(cfg.saturday),
          sunday: Boolean(cfg.sunday)
        });
      }

      setHistoryRecords(historyRes.data.history || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load working week data.');
    } finally {
      setLoadingConfig(false);
      setLoadingHistory(false);
    }
  }, [scope, departmentId, shiftId, notifyError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleDay = (key) => {
    setDaysState((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setFormError('');

    const atLeastOneWorkingDay = Object.values(daysState).some(Boolean);
    if (!atLeastOneWorkingDay) {
      setFormError('At least one day of the week must be marked as a working day.');
      return;
    }

    if (!effectiveFrom) {
      setFormError('Effective from date is required to ensure audit trail and avoid recalculating historical months.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        scope,
        department_id: scope === 'department' ? departmentId : null,
        shift_id: scope === 'shift' ? shiftId : null,
        effective_from: effectiveFrom,
        monday: daysState.monday,
        tuesday: daysState.tuesday,
        wednesday: daysState.wednesday,
        thursday: daysState.thursday,
        friday: daysState.friday,
        saturday: daysState.saturday,
        sunday: daysState.sunday
      };

      const res = await api.post('/working-week', payload);
      success(res.data.message || 'Working week policy saved successfully.');
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to update working week configuration.');
    } finally {
      setSaving(false);
    }
  };

  const workingDaysCount = Object.values(daysState).filter(Boolean).length;

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content working-week-main">
        {/* Header */}
        <div className="working-week-header">
          <div>
            <h1 className="working-week-title">Working Week Settings</h1>
            <p className="working-week-subtitle">
              Define standard working days vs weekends. Changes use effective dates to preserve past attendance, payroll, and leave accuracy.
            </p>
          </div>
        </div>

        {/* Scope Selector Card */}
        <div className="card working-week-scope-card">
          <div className="scope-selection-row">
            <div className="scope-pills">
              <button
                type="button"
                onClick={() => { setScope('company'); }}
                className={`scope-pill-btn ${scope === 'company' ? 'active' : ''}`}
              >
                <Building2 size={16} />
                <span>Company Default</span>
              </button>
              <button
                type="button"
                onClick={() => { setScope('department'); }}
                className={`scope-pill-btn ${scope === 'department' ? 'active' : ''}`}
              >
                <Layers size={16} />
                <span>By Department</span>
              </button>
              <button
                type="button"
                onClick={() => { setScope('shift'); }}
                className={`scope-pill-btn ${scope === 'shift' ? 'active' : ''}`}
              >
                <Clock size={16} />
                <span>By Shift</span>
              </button>
            </div>

            {scope === 'department' && (
              <div className="scope-target-select">
                <label className="text-xs font-semibold text-secondary">Select Department:</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="select"
                >
                  <option value="">-- Choose Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'shift' && (
              <div className="scope-target-select">
                <label className="text-xs font-semibold text-secondary">Select Shift:</label>
                <select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  className="select"
                >
                  <option value="">-- Choose Shift --</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Configuration Form Card */}
        <div className="card working-week-form-card">
          <div className="card-header-styled">
            <div className="card-header-left">
              <Calendar size={18} className="text-primary" />
              <h2 className="card-header-title">
                {scope === 'company'
                  ? 'Company-wide Working Week'
                  : scope === 'department'
                  ? 'Department Working Week Policy'
                  : 'Shift Working Week Policy'}
              </h2>
            </div>
            <div className="working-days-badge">
              <span>{workingDaysCount} Working Days / Week</span>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="working-week-form">
            {formError && (
              <div className="working-week-alert" role="alert">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <p className="text-sm text-secondary mb-4">
              Check the days that are considered official working days. Unchecked days will be treated as official weekends across attendance, payroll, and leave calculations.
            </p>

            {/* Days Checkbox Grid */}
            <div className="days-selection-grid">
              {DAYS.map((day) => {
                const isChecked = daysState[day.key];
                return (
                  <label
                    key={day.key}
                    className={`day-card ${isChecked ? 'is-working' : 'is-weekend'} ${
                      !canManage ? 'disabled' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canManage}
                      onChange={() => handleToggleDay(day.key)}
                      className="day-checkbox"
                    />
                    <div className="day-card-content">
                      <span className="day-short">{day.short}</span>
                      <span className="day-full">{day.label}</span>
                      <span className={`day-status-pill ${isChecked ? 'work' : 'off'}`}>
                        {isChecked ? 'Working' : 'Weekend'}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Effective Date & Metadata */}
            <div className="effective-date-section">
              <div className="form-group effective-date-group">
                <label className="form-label">
                  Effective From Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  required
                  disabled={!canManage}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="input"
                />
                <span className="text-xs text-muted">
                  Past months before this date will retain their historical working week configuration.
                </span>
              </div>

              {canManage && (
                <div className="save-btn-wrap">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save size={16} />
                    <span>{saving ? 'Saving...' : 'Apply Working Week Policy'}</span>
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Configuration History Card */}
        <div className="card working-week-history-card">
          <div className="card-header-styled">
            <div className="card-header-left">
              <History size={18} className="text-secondary" />
              <h2 className="card-header-title">Policy Version History</h2>
            </div>
            <span className="text-xs text-muted font-mono">
              {historyRecords.length} records found
            </span>
          </div>

          <div className="table-responsive">
            <table className="working-week-history-table">
              <thead>
                <tr>
                  <th>Effective From</th>
                  <th>Working Days</th>
                  <th>Off Days (Weekend)</th>
                  <th>Created At</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan="5" className="empty-history-cell">
                      Loading policy history...
                    </td>
                  </tr>
                ) : historyRecords.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-history-cell">
                      No policy history recorded for this scope.
                    </td>
                  </tr>
                ) : (
                  historyRecords.map((item) => {
                    const workingDays = DAYS.filter((d) => item[d.key]).map((d) => d.short);
                    const offDays = DAYS.filter((d) => !item[d.key]).map((d) => d.short);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="font-semibold text-primary font-mono">
                            {item.effective_from}
                          </div>
                        </td>
                        <td>
                          <div className="days-chip-list">
                            {workingDays.map((d) => (
                              <span key={d} className="chip-day work">
                                {d}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="days-chip-list">
                            {offDays.length === 0 ? (
                              <span className="text-muted text-xs">None (7-day work week)</span>
                            ) : (
                              offDays.map((d) => (
                                <span key={d} className="chip-day off">
                                  {d}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="text-xs font-mono text-muted">
                          {item.created_at ? item.created_at.slice(0, 10) : '—'}
                        </td>
                        <td className="text-sm">
                          {item.created_by_name || 'System Admin'}
                        </td>
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

export default WorkingWeek;
