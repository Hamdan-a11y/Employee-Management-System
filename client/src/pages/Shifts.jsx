import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  CalendarDays,
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sun,
  Sunset,
  Moon,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Users,
  Building2,
  Calendar,
  Search,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Info
} from 'lucide-react';
import './Shifts.css';

const Shifts = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee } = useAuth();
  const { success, error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'shifts';

  const canManageShifts = Boolean(isAdmin || isHR);
  const canAssignShifts = Boolean(isAdmin || isHR || isDeptManager);

  const handleTabChange = (tabName) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabName);
    setSearchParams(next, { replace: true });
  };

  // ==========================================
  // 1. SHIFTS TAB STATE
  // ==========================================
  const [shifts, setShifts] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [shiftSearch, setShiftSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal: Create / Edit Shift
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    type: 'morning',
    start_time: '09:00',
    end_time: '17:00',
    grace_minutes: 15,
    break_minutes: 60,
    min_working_minutes: 480,
    is_active: true,
    is_default: false
  });
  const [savingShift, setSavingShift] = useState(false);
  const [shiftFormError, setShiftFormError] = useState('');

  // Modal: Create Rotation
  const [isRotationModalOpen, setIsRotationModalOpen] = useState(false);
  const [rotationForm, setRotationForm] = useState({
    name: '',
    description: '',
    steps: [{ week_number: 1, shift_id: '' }]
  });
  const [savingRotation, setSavingRotation] = useState(false);

  // ==========================================
  // 2. ASSIGN SHIFT TAB STATE
  // ==========================================
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingAssignOptions, setLoadingAssignOptions] = useState(false);

  const [assignTargetType, setAssignTargetType] = useState('department'); // 'department' | 'employee'
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [assignShiftType, setAssignShiftType] = useState('shift'); // 'shift' | 'rotation'
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [selectedRotationId, setSelectedRotationId] = useState('');
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isOngoing, setIsOngoing] = useState(true);
  const [assignEndDate, setAssignEndDate] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Filter for employee multi-select
  const [empPickerSearch, setEmpPickerSearch] = useState('');

  // ==========================================
  // 3. WEEKLY SCHEDULE VIEW STATE
  // ==========================================
  const [scheduleData, setScheduleData] = useState({ days: [], employees: [] });
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleDeptFilter, setScheduleDeptFilter] = useState('all');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  });

  // ==========================================
  // API LOADERS
  // ==========================================

  const fetchShiftsAndRotations = useCallback(async () => {
    try {
      setLoadingShifts(true);
      const [resShifts, resRot] = await Promise.all([
        api.get('/shifts'),
        api.get('/shifts/rotations/all')
      ]);
      setShifts(Array.isArray(resShifts.data) ? resShifts.data : []);
      setRotations(Array.isArray(resRot.data) ? resRot.data : []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load shifts.');
    } finally {
      setLoadingShifts(false);
    }
  }, [notifyError]);

  const fetchAssignMeta = useCallback(async () => {
    try {
      setLoadingAssignOptions(true);
      const [deptRes, empRes] = await Promise.all([
        api.get('/departments'),
        api.get('/employees?limit=500&status=Active')
      ]);
      const depts = Array.isArray(deptRes.data) ? deptRes.data : [];
      setDepartments(depts);
      if (depts.length > 0 && !selectedDeptId) {
        if (isDeptManager && user?.department_id) {
          setSelectedDeptId(String(user.department_id));
        } else {
          setSelectedDeptId(String(depts[0].id));
        }
      }

      const emps = empRes.data?.employees || (Array.isArray(empRes.data) ? empRes.data : []);
      setEmployees(emps);
    } catch (err) {
      console.error('Failed to load assignment options', err);
    } finally {
      setLoadingAssignOptions(false);
    }
  }, [isDeptManager, user?.department_id, selectedDeptId]);

  const fetchSchedule = useCallback(async () => {
    try {
      setScheduleLoading(true);
      const params = { startDate: currentWeekStart };
      if (scheduleDeptFilter !== 'all') {
        params.department_id = scheduleDeptFilter;
      }
      const res = await api.get('/shifts/schedule', { params });
      setScheduleData(res.data);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load weekly schedule.');
    } finally {
      setScheduleLoading(false);
    }
  }, [currentWeekStart, scheduleDeptFilter, notifyError]);

  useEffect(() => {
    fetchShiftsAndRotations();
    fetchAssignMeta();
  }, [fetchShiftsAndRotations, fetchAssignMeta]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      fetchSchedule();
    }
  }, [activeTab, fetchSchedule]);

  // ==========================================
  // SHIFT CRUD HANDLERS
  // ==========================================

  const handleOpenCreateShift = () => {
    setEditingShiftId(null);
    setShiftForm({
      name: '',
      type: 'morning',
      start_time: '09:00',
      end_time: '17:00',
      grace_minutes: 15,
      break_minutes: 60,
      min_working_minutes: 480,
      is_active: true,
      is_default: false
    });
    setShiftFormError('');
    setIsShiftModalOpen(true);
  };

  const handleOpenEditShift = (shift) => {
    setEditingShiftId(shift.id);
    setShiftForm({
      name: shift.name,
      type: shift.type,
      start_time: shift.start_time ? shift.start_time.slice(0, 5) : '09:00',
      end_time: shift.end_time ? shift.end_time.slice(0, 5) : '17:00',
      grace_minutes: shift.grace_minutes,
      break_minutes: shift.break_minutes,
      min_working_minutes: shift.min_working_minutes,
      is_active: Boolean(shift.is_active),
      is_default: Boolean(shift.is_default)
    });
    setShiftFormError('');
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e) => {
    e.preventDefault();
    setShiftFormError('');

    if (!shiftForm.name.trim()) {
      setShiftFormError('Please enter a shift name.');
      return;
    }

    if (shiftForm.type !== 'flexible' && (!shiftForm.start_time || !shiftForm.end_time)) {
      setShiftFormError('Start time and end time are required.');
      return;
    }

    try {
      setSavingShift(true);
      if (editingShiftId) {
        await api.put(`/shifts/${editingShiftId}`, shiftForm);
        success('Shift template updated successfully!');
      } else {
        await api.post('/shifts', shiftForm);
        success('Shift template created successfully!');
      }
      setIsShiftModalOpen(false);
      fetchShiftsAndRotations();
    } catch (err) {
      setShiftFormError(err.response?.data?.message || 'Failed to save shift.');
    } finally {
      setSavingShift(false);
    }
  };

  const handleToggleShiftStatus = async (shift) => {
    try {
      const res = await api.patch(`/shifts/${shift.id}/status`, { is_active: !shift.is_active });
      success(res.data.message);
      fetchShiftsAndRotations();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to toggle shift status.');
    }
  };

  const handleDeleteShift = async (shift) => {
    if (!window.confirm(`Are you sure you want to delete shift "${shift.name}"?`)) return;
    try {
      const res = await api.delete(`/shifts/${shift.id}`);
      success(res.data.message);
      fetchShiftsAndRotations();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Cannot delete shift.');
    }
  };

  // Rotation creator
  const handleAddRotationStep = () => {
    const nextWeek = rotationForm.steps.length + 1;
    setRotationForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { week_number: nextWeek, shift_id: shifts[0]?.id || '' }]
    }));
  };

  const handleRemoveRotationStep = (index) => {
    if (rotationForm.steps.length <= 1) return;
    const filtered = rotationForm.steps.filter((_, i) => i !== index);
    const renumbered = filtered.map((s, idx) => ({ ...s, week_number: idx + 1 }));
    setRotationForm((prev) => ({ ...prev, steps: renumbered }));
  };

  const handleSaveRotation = async (e) => {
    e.preventDefault();
    if (!rotationForm.name.trim()) {
      notifyError('Please enter a rotation pattern name.');
      return;
    }
    for (let i = 0; i < rotationForm.steps.length; i++) {
      if (!rotationForm.steps[i].shift_id) {
        notifyError(`Please select a shift for Week ${i + 1}.`);
        return;
      }
    }

    try {
      setSavingRotation(true);
      await api.post('/shifts/rotations', rotationForm);
      success('Weekly rotation pattern created successfully!');
      setIsRotationModalOpen(false);
      setRotationForm({ name: '', description: '', steps: [{ week_number: 1, shift_id: '' }] });
      fetchShiftsAndRotations();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to create rotation pattern.');
    } finally {
      setSavingRotation(false);
    }
  };

  const handleDeleteRotation = async (rot) => {
    if (!window.confirm(`Delete rotation pattern "${rot.name}"?`)) return;
    try {
      const res = await api.delete(`/shifts/rotations/${rot.id}`);
      success(res.data.message);
      fetchShiftsAndRotations();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Cannot delete rotation pattern.');
    }
  };

  // ==========================================
  // ASSIGN SHIFT HANDLERS & PREVIEW
  // ==========================================

  // Automatically trigger preview when target or dates change
  const runAssignmentPreview = useCallback(async () => {
    if (!assignStartDate) return;

    if (assignTargetType === 'department' && !selectedDeptId) return;
    if (assignTargetType === 'employee' && selectedEmployeeIds.length === 0) {
      setPreviewData(null);
      return;
    }

    try {
      setPreviewLoading(true);
      setPreviewError('');

      const payload = {
        target_type: assignTargetType,
        department_id: assignTargetType === 'department' ? selectedDeptId : undefined,
        employee_ids: assignTargetType === 'employee' ? selectedEmployeeIds : undefined,
        start_date: assignStartDate,
        end_date: isOngoing ? null : assignEndDate || null
      };

      const res = await api.post('/shifts/assignments/preview', payload);
      setPreviewData(res.data);
    } catch (err) {
      setPreviewError(err.response?.data?.message || 'Failed to preview assignment.');
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [assignTargetType, selectedDeptId, selectedEmployeeIds, assignStartDate, isOngoing, assignEndDate]);

  useEffect(() => {
    if (activeTab === 'assign') {
      const timer = setTimeout(() => {
        runAssignmentPreview();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, runAssignmentPreview]);

  const handleSubmitAssignment = async (e) => {
    e.preventDefault();

    if (!assignStartDate) {
      notifyError('Please specify a start date.');
      return;
    }

    if (!isOngoing && assignEndDate && assignEndDate < assignStartDate) {
      notifyError('End date cannot be earlier than start date.');
      return;
    }

    if (assignShiftType === 'shift' && !selectedShiftId) {
      notifyError('Please select a shift template.');
      return;
    }
    if (assignShiftType === 'rotation' && !selectedRotationId) {
      notifyError('Please select a rotation pattern.');
      return;
    }

    if (previewData?.has_overlaps) {
      notifyError('Cannot assign shift: Overlapping assignments detected. Please resolve them first.');
      return;
    }

    try {
      setSubmittingAssign(true);
      const payload = {
        target_type: assignTargetType,
        department_id: assignTargetType === 'department' ? selectedDeptId : undefined,
        employee_ids: assignTargetType === 'employee' ? selectedEmployeeIds : undefined,
        shift_id: assignShiftType === 'shift' ? selectedShiftId : undefined,
        rotation_id: assignShiftType === 'rotation' ? selectedRotationId : undefined,
        start_date: assignStartDate,
        end_date: isOngoing ? null : assignEndDate || null,
        notes: assignNotes
      };

      const res = await api.post('/shifts/assignments', payload);
      success(res.data.message || 'Shifts assigned successfully!');
      setSelectedEmployeeIds([]);
      setAssignNotes('');
      runAssignmentPreview();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to assign shift.');
    } finally {
      setSubmittingAssign(false);
    }
  };

  // Week Navigator Helpers
  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d.toISOString().split('T')[0]);
  };

  const handleThisWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    setCurrentWeekStart(d.toISOString().split('T')[0]);
  };

  // Helper icons for shift types
  const getShiftTypeIcon = (type) => {
    switch (type) {
      case 'morning':
        return <Sun size={14} />;
      case 'evening':
        return <Sunset size={14} />;
      case 'night':
        return <Moon size={14} />;
      case 'flexible':
        return <Sliders size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '—';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  // Filtered shifts
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(shiftSearch.toLowerCase());
      const matchType = typeFilter === 'ALL' || s.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [shifts, shiftSearch, typeFilter]);

  // Filtered employees for multi-select
  const filteredPickerEmployees = useMemo(() => {
    return employees.filter((e) => {
      const q = empPickerSearch.toLowerCase();
      return e.name.toLowerCase().includes(q) || (e.department_name && e.department_name.toLowerCase().includes(q));
    });
  }, [employees, empPickerSearch]);

  const toggleSelectAllEmployees = () => {
    if (selectedEmployeeIds.length === filteredPickerEmployees.length) {
      setSelectedEmployeeIds([]);
    } else {
      setSelectedEmployeeIds(filteredPickerEmployees.map((e) => e.id));
    }
  };

  const toggleEmployeeSelection = (id) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content shifts-main">
        {/* Header */}
        <div className="shifts-header">
          <div className="shifts-title-group">
            <div className="shifts-title-row">
              <h1 className="shifts-title">Advanced Shift Management</h1>
              <span className="shifts-scope-pill">
                <ShieldCheck size={13} />
                <span>{canManageShifts ? 'Admin / HR Control' : isDeptManager ? 'Department Manager' : 'Employee Schedule'}</span>
              </span>
            </div>
            <p className="shifts-subtitle">
              Configure shift templates, weekly rotational cycles, bulk assignments with overlap detection, and attendance rules.
            </p>
          </div>

          <div className="shifts-header-actions">
            {canManageShifts && (
              <>
                <button onClick={handleOpenCreateShift} className="btn btn-primary">
                  <Plus size={16} />
                  <span>Create Shift</span>
                </button>
                <button onClick={() => setIsRotationModalOpen(true)} className="btn btn-secondary">
                  <RotateCcw size={16} />
                  <span>New Rotation</span>
                </button>
              </>
            )}
            {canAssignShifts && activeTab !== 'assign' && (
              <button onClick={() => handleTabChange('assign')} className="btn btn-secondary">
                <Users size={16} />
                <span>Assign Shifts</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="shifts-tabs-container">
          <button
            className={`shifts-tab-btn ${activeTab === 'shifts' ? 'active' : ''}`}
            onClick={() => handleTabChange('shifts')}
          >
            <Clock size={16} />
            <span>Shift Templates & Rotations</span>
          </button>
          <button
            className={`shifts-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => handleTabChange('schedule')}
          >
            <CalendarDays size={16} />
            <span>Weekly Schedule Grid</span>
          </button>
          {canAssignShifts && (
            <button
              className={`shifts-tab-btn ${activeTab === 'assign' ? 'active' : ''}`}
              onClick={() => handleTabChange('assign')}
            >
              <Users size={16} />
              <span>Assign Shift or Rotation</span>
            </button>
          )}
        </div>

        {/* =========================================================
            TAB 1: SHIFTS & ROTATIONS
            ========================================================= */}
        {activeTab === 'shifts' && (
          <div>
            {/* Stats Row */}
            <div className="shifts-stats-grid">
              <div className="shifts-stat-card">
                <div className="shifts-stat-icon morning">
                  <Sun size={22} />
                </div>
                <div>
                  <div className="shifts-stat-value font-numeric">{shifts.length}</div>
                  <div className="shifts-stat-label">Total Shift Templates</div>
                </div>
              </div>

              <div className="shifts-stat-card">
                <div className="shifts-stat-icon morning">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <div className="shifts-stat-value font-numeric">
                    {shifts.filter((s) => s.is_active).length}
                  </div>
                  <div className="shifts-stat-label">Active Shifts</div>
                </div>
              </div>

              <div className="shifts-stat-card">
                <div className="shifts-stat-icon night">
                  <Moon size={22} />
                </div>
                <div>
                  <div className="shifts-stat-value font-numeric">
                    {shifts.filter((s) => s.crosses_midnight).length}
                  </div>
                  <div className="shifts-stat-label">Crosses Midnight (Night)</div>
                </div>
              </div>

              <div className="shifts-stat-card">
                <div className="shifts-stat-icon rotation">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <div className="shifts-stat-value font-numeric">{rotations.length}</div>
                  <div className="shifts-stat-label">Rotational Patterns</div>
                </div>
              </div>
            </div>

            {/* Shifts Table Card */}
            <div className="shifts-card">
              <div className="shifts-card-header">
                <h2 className="shifts-card-title">
                  <Clock size={18} />
                  <span>Configured Shift Templates</span>
                </h2>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      className="shifts-input"
                      placeholder="Search shifts..."
                      value={shiftSearch}
                      onChange={(e) => setShiftSearch(e.target.value)}
                      style={{ paddingLeft: '32px', width: '200px' }}
                    />
                  </div>

                  <select
                    className="shifts-select"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{ width: '130px' }}
                  >
                    <option value="ALL">All Types</option>
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              </div>

              <div className="shifts-table-wrap">
                {loadingShifts ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading shift templates...
                  </div>
                ) : filteredShifts.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center' }}>
                    <Clock size={36} style={{ color: 'var(--text-secondary)', marginBottom: '8px' }} />
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No shifts match your search</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Adjust filters or click "Create Shift" to define a new shift schedule.
                    </p>
                  </div>
                ) : (
                  <table className="shifts-table">
                    <thead>
                      <tr>
                        <th>Shift Name</th>
                        <th>Type</th>
                        <th>Working Hours</th>
                        <th>Grace</th>
                        <th>Break</th>
                        <th>Min Hours</th>
                        <th>Status</th>
                        {canManageShifts && <th style={{ textAlign: 'right' }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShifts.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="shift-name-cell">
                              <span className="shift-name-title">{s.name}</span>
                              {s.is_default && <span className="badge-default">Default System Shift</span>}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span className={`badge-shift-type badge-${s.type}`}>
                                {getShiftTypeIcon(s.type)}
                                <span>{s.type}</span>
                              </span>
                              {s.crosses_midnight && (
                                <span className="badge-midnight" title="End time is earlier than start time. Attendance belongs to start date.">
                                  <Moon size={10} />
                                  <span>Crosses Midnight (+1d)</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="shift-time-cell">
                            {s.type === 'flexible' ? (
                              <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Flexible (No fixed start/end)</span>
                            ) : (
                              `${formatTimeDisplay(s.start_time)} – ${formatTimeDisplay(s.end_time)}`
                            )}
                          </td>
                          <td className="shift-time-cell">
                            {s.type === 'flexible' ? '—' : `${s.grace_minutes} mins`}
                          </td>
                          <td className="shift-time-cell">{s.break_minutes} mins</td>
                          <td className="shift-time-cell">
                            {(s.min_working_minutes / 60).toFixed(1)} hrs ({s.min_working_minutes}m)
                          </td>
                          <td>
                            <span className={`badge-active-status ${s.is_active ? 'active' : 'inactive'}`}>
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: s.is_active ? '#10b981' : '#94a3b8'
                                }}
                              />
                              <span>{s.is_active ? 'Active' : 'Inactive'}</span>
                            </span>
                          </td>
                          {canManageShifts && (
                            <td style={{ textAlign: 'right' }}>
                              <div className="shifts-actions-cell" style={{ justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => handleOpenEditShift(s)}
                                  className="btn-icon-action"
                                  title="Edit Shift Template"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  onClick={() => handleToggleShiftStatus(s)}
                                  className="btn-icon-action"
                                  title={s.is_active ? 'Deactivate Shift' : 'Activate Shift'}
                                >
                                  {s.is_active ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                                </button>
                                {s.can_delete ? (
                                  <button
                                    onClick={() => handleDeleteShift(s)}
                                    className="btn-icon-action danger"
                                    title="Delete unassigned shift"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                ) : (
                                  <span
                                    title="Shift is actively assigned or used in a rotation. It can only be deactivated."
                                    style={{ color: 'var(--text-secondary)', cursor: 'not-allowed', padding: '6px' }}
                                  >
                                    <ShieldCheck size={14} />
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Rotational Patterns Section */}
            <div className="shifts-card">
              <div className="shifts-card-header">
                <h2 className="shifts-card-title">
                  <RotateCcw size={18} />
                  <span>Weekly Rotational Shift Cycles</span>
                </h2>
                {canManageShifts && (
                  <button onClick={() => setIsRotationModalOpen(true)} className="btn btn-secondary btn-sm">
                    <Plus size={14} />
                    <span>Create Rotation Pattern</span>
                  </button>
                )}
              </div>

              <div className="shifts-card-body">
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Rotational shifts cycle employees automatically through multi-week patterns (e.g. Week 1 Morning, Week 2 Evening, Week 3 Night). The system deterministically computes the shift for any date.
                </p>

                {rotations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                    <RotateCcw size={32} style={{ color: 'var(--text-secondary)', marginBottom: '8px' }} />
                    <p style={{ fontWeight: 600 }}>No weekly rotation patterns defined</p>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      Define a multi-week schedule to rotate shifts automatically without manual re-assignments.
                    </p>
                  </div>
                ) : (
                  <div className="rotations-grid">
                    {rotations.map((rot) => (
                      <div key={rot.id} className="rotation-card">
                        <div className="rotation-card-header">
                          <div>
                            <h3 className="rotation-title">{rot.name}</h3>
                            <p className="rotation-desc">{rot.description || `${rot.steps?.length}-Week Repeating Cycle`}</p>
                          </div>
                          {canManageShifts && rot.assignment_count === 0 && (
                            <button
                              onClick={() => handleDeleteRotation(rot)}
                              className="btn-icon-action danger"
                              title="Delete Rotation"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="rotation-steps-list">
                          {rot.steps?.map((step) => (
                            <div key={step.id} className="rotation-step-item">
                              <span className="rotation-step-week">Week {step.week_number}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className={`badge-shift-type badge-${step.shift_type}`}>
                                  {step.shift_name}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: ASSIGN SHIFT OR ROTATION
            ========================================================= */}
        {activeTab === 'assign' && (
          <form onSubmit={handleSubmitAssignment} className="assign-form-layout">
            {/* Left: Assignment Setup Form */}
            <div className="shifts-card">
              <div className="shifts-card-header">
                <h2 className="shifts-card-title">
                  <Users size={18} />
                  <span>Assign Shift or Rotational Pattern</span>
                </h2>
              </div>

              <div className="shifts-card-body">
                {/* 1. Target Selection */}
                <div className="assign-form-group">
                  <label className="assign-label">1. Assignment Target</label>
                  <div className="assign-choice-grid">
                    <button
                      type="button"
                      className={`assign-choice-btn ${assignTargetType === 'department' ? 'active' : ''}`}
                      onClick={() => setAssignTargetType('department')}
                    >
                      <Building2 size={20} />
                      <div>
                        <div className="assign-choice-title">Whole Department</div>
                        <div className="assign-choice-desc">Assigns each active employee in a single transaction</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`assign-choice-btn ${assignTargetType === 'employee' ? 'active' : ''}`}
                      onClick={() => setAssignTargetType('employee')}
                    >
                      <Users size={20} />
                      <div>
                        <div className="assign-choice-title">Specific Employee(s)</div>
                        <div className="assign-choice-desc">Select one or multiple team members</div>
                      </div>
                    </button>
                  </div>

                  {assignTargetType === 'department' ? (
                    <div>
                      <select
                        className="shifts-select"
                        value={selectedDeptId}
                        onChange={(e) => setSelectedDeptId(e.target.value)}
                        disabled={isDeptManager}
                        required
                      >
                        <option value="">-- Choose Department --</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.employee_count || d.approved_headcount || 0} employees)
                          </option>
                        ))}
                      </select>
                      {isDeptManager && (
                        <p className="assign-hint">
                          <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          As Department Manager, you can assign shifts to your department.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <input
                          type="text"
                          className="shifts-input"
                          placeholder="Filter employees..."
                          value={empPickerSearch}
                          onChange={(e) => setEmpPickerSearch(e.target.value)}
                          style={{ maxWidth: '240px', padding: '6px 10px', fontSize: '0.8125rem' }}
                        />
                        <button
                          type="button"
                          onClick={toggleSelectAllEmployees}
                          className="btn btn-secondary btn-sm"
                        >
                          {selectedEmployeeIds.length === filteredPickerEmployees.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>

                      <div className="employee-select-box">
                        {filteredPickerEmployees.map((emp) => {
                          const isChecked = selectedEmployeeIds.includes(emp.id);
                          return (
                            <label key={emp.id} className="employee-check-item">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEmployeeSelection(emp.id)}
                              />
                              <div className="employee-check-meta">
                                <span className="employee-check-name">{emp.name}</span>
                                <span className="employee-check-dept">
                                  {emp.designation} • {emp.department_name || 'No Dept'}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Shift or Rotation Selection */}
                <div className="assign-form-group">
                  <label className="assign-label">2. Shift Type to Apply</label>
                  <div className="assign-choice-grid">
                    <button
                      type="button"
                      className={`assign-choice-btn ${assignShiftType === 'shift' ? 'active' : ''}`}
                      onClick={() => setAssignShiftType('shift')}
                    >
                      <Clock size={20} />
                      <div>
                        <div className="assign-choice-title">Fixed Shift Template</div>
                        <div className="assign-choice-desc">Single constant daily shift</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`assign-choice-btn ${assignShiftType === 'rotation' ? 'active' : ''}`}
                      onClick={() => setAssignShiftType('rotation')}
                    >
                      <RotateCcw size={20} />
                      <div>
                        <div className="assign-choice-title">Weekly Rotation Cycle</div>
                        <div className="assign-choice-desc">Advances weekly pattern automatically</div>
                      </div>
                    </button>
                  </div>

                  {assignShiftType === 'shift' ? (
                    <select
                      className="shifts-select"
                      value={selectedShiftId}
                      onChange={(e) => setSelectedShiftId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Shift Template --</option>
                      {shifts.filter((s) => s.is_active).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.type === 'flexible' ? 'Flexible' : `${formatTimeDisplay(s.start_time)} - ${formatTimeDisplay(s.end_time)}`})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="shifts-select"
                      value={selectedRotationId}
                      onChange={(e) => setSelectedRotationId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Rotation Pattern --</option>
                      {rotations.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.steps?.length || 0} weeks cycle)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 3. Effective Dates */}
                <div className="assign-form-group">
                  <label className="assign-label">3. Effective Dates</label>
                  <div className="shifts-form-grid-2">
                    <div>
                      <span className="assign-hint">Start Date *</span>
                      <input
                        type="date"
                        className="shifts-input"
                        value={assignStartDate}
                        onChange={(e) => setAssignStartDate(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <span className="assign-hint">End Date (Optional)</span>
                      <input
                        type="date"
                        className="shifts-input"
                        value={assignEndDate}
                        onChange={(e) => setAssignEndDate(e.target.value)}
                        disabled={isOngoing}
                        required={!isOngoing}
                      />
                    </div>
                  </div>

                  <label className="shifts-checkbox-row">
                    <input
                      type="checkbox"
                      checked={isOngoing}
                      onChange={(e) => {
                        setIsOngoing(e.target.checked);
                        if (e.target.checked) setAssignEndDate('');
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      Ongoing schedule (no expiration end date)
                    </span>
                  </label>
                </div>

                {/* Notes */}
                <div className="assign-form-group">
                  <label className="assign-label">Notes or Internal Reason</label>
                  <input
                    type="text"
                    className="shifts-input"
                    placeholder="e.g. Q4 Rotation schedule, Special Project night coverage"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Right: Live Preview & Overlap Warning Card */}
            <div className="assign-preview-card">
              <div className="preview-title-row">
                <Users size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Assignment Preview</h3>
              </div>

              {previewLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Calculating preview and overlap checks...
                </div>
              ) : previewError ? (
                <div className="preview-overlap-banner" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
                  <div className="preview-overlap-title" style={{ color: '#991b1b' }}>
                    <AlertCircle size={16} />
                    <span>Preview Error</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#b91c1c', margin: 0 }}>{previewError}</p>
                </div>
              ) : previewData ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Impacted Employees</span>
                    <span className="preview-badge-count">
                      {previewData.total_employees} Employee{previewData.total_employees === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Overlap Warning Box */}
                  {previewData.has_overlaps ? (
                    <div className="preview-overlap-banner">
                      <div className="preview-overlap-title">
                        <AlertTriangle size={16} />
                        <span>Overlap Conflict Detected ({previewData.overlaps.length})</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '8px' }}>
                        The following employees have active overlapping assignments. Requirement 2 prevents overlapping assignments; please close existing assignments first:
                      </p>
                      <ul className="preview-overlap-list">
                        {previewData.overlaps.map((o) => (
                          <li key={o.employee_id}>
                            <strong>{o.employee_name}</strong>: {o.existing_assignment?.shift_name || o.existing_assignment?.rotation_name} ({o.existing_assignment?.start_date} to {o.existing_assignment?.end_date})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: 600, fontSize: '0.8125rem' }}>
                        <CheckCircle2 size={16} />
                        <span>No conflicts detected. Ready to assign!</span>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    <strong>Schedule:</strong> {assignStartDate} {isOngoing ? '(Ongoing)' : `to ${assignEndDate}`}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={submittingAssign || previewData.has_overlaps || previewData.total_employees === 0}
                  >
                    {submittingAssign ? 'Assigning...' : `Confirm & Assign to ${previewData.total_employees} Employees`}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Select target employees or a department to preview assignment.
                </div>
              )}
            </div>
          </form>
        )}

        {/* =========================================================
            TAB 3: WEEKLY SCHEDULE VIEW
            ========================================================= */}
        {activeTab === 'schedule' && (
          <div>
            {/* Schedule Controls */}
            <div className="schedule-controls">
              <div className="schedule-nav-group">
                <button onClick={handlePrevWeek} className="btn btn-secondary btn-sm" title="Previous Week">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={handleThisWeek} className="btn btn-secondary btn-sm">
                  This Week
                </button>
                <button onClick={handleNextWeek} className="btn btn-secondary btn-sm" title="Next Week">
                  <ChevronRight size={16} />
                </button>
                <span className="schedule-week-display">
                  {scheduleData.days?.length > 0
                    ? `${scheduleData.days[0].date} — ${scheduleData.days[scheduleData.days.length - 1].date}`
                    : 'Loading week...'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {!isEmployee && (
                  <select
                    className="shifts-select"
                    value={scheduleDeptFilter}
                    onChange={(e) => setScheduleDeptFilter(e.target.value)}
                    style={{ width: '180px', padding: '6px 10px', fontSize: '0.8125rem' }}
                    disabled={isDeptManager}
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="schedule-legend">
                  <div className="schedule-legend-item">
                    <span className="schedule-legend-dot morning" />
                    <span>Morning</span>
                  </div>
                  <div className="schedule-legend-item">
                    <span className="schedule-legend-dot evening" />
                    <span>Evening</span>
                  </div>
                  <div className="schedule-legend-item">
                    <span className="schedule-legend-dot night" />
                    <span>Night (+1d Midnight)</span>
                  </div>
                  <div className="schedule-legend-item">
                    <span className="schedule-legend-dot flexible" />
                    <span>Flexible</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule Grid */}
            <div className="schedule-grid-wrap">
              {scheduleLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading schedule grid...
                </div>
              ) : scheduleData.employees?.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center' }}>
                  <CalendarDays size={40} style={{ color: 'var(--text-secondary)', marginBottom: '8px' }} />
                  <p style={{ fontWeight: 600 }}>No active employees found for this schedule</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Check your department filter or assign shifts from the "Assign Shift" tab.
                  </p>
                </div>
              ) : (
                <table className="schedule-grid">
                  <thead>
                    <tr>
                      <th className="schedule-emp-col" style={{ padding: '12px 16px', textAlign: 'left' }}>
                        Employee
                      </th>
                      {scheduleData.days?.map((d) => (
                        <th key={d.date} className={`schedule-day-col ${d.is_today ? 'today' : ''}`}>
                          <div className="schedule-day-header-day">{d.day_of_week}</div>
                          <div className="schedule-day-header-date">{d.day_number}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleData.employees?.map((row) => (
                      <tr key={row.employee_id}>
                        <td className="schedule-emp-col schedule-emp-cell">
                          <div className="schedule-emp-name">{row.employee_name}</div>
                          <div className="schedule-emp-sub">
                            {row.designation} • {row.department_name}
                          </div>
                        </td>
                        {scheduleData.days?.map((d) => {
                          const shift = row.schedule?.[d.date];
                          if (!shift) return <td key={d.date} />;
                          return (
                            <td key={d.date} style={{ height: '70px', padding: '4px' }}>
                              <div className={`schedule-shift-block ${shift.type || 'morning'}`}>
                                <div className="schedule-shift-title-row">
                                  <span className="schedule-shift-name" title={shift.name}>
                                    {shift.name}
                                  </span>
                                  {shift.crosses_midnight && (
                                    <span title="Night shift crosses midnight into following day" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                      <Moon size={11} />
                                    </span>
                                  )}
                                </div>

                                <div className="schedule-shift-time">
                                  {shift.type === 'flexible'
                                    ? 'Flexible'
                                    : `${shift.start_time?.slice(0, 5)} - ${shift.end_time?.slice(0, 5)}`}
                                  {shift.crosses_midnight && ' (+1d)'}
                                </div>

                                {shift.source === 'rotation' ? (
                                  <span className="schedule-source-tag">Wk {shift.rotation_week}</span>
                                ) : shift.source === 'default' ? (
                                  <span className="schedule-source-tag" style={{ opacity: 0.6 }}>Default</span>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            MODAL: CREATE / EDIT SHIFT TEMPLATE
            ========================================================= */}
        {isShiftModalOpen && (
          <div className="shifts-modal-backdrop" onClick={() => setIsShiftModalOpen(false)}>
            <div className="shifts-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="shifts-modal-header">
                <h3 className="shifts-modal-title">
                  {editingShiftId ? 'Edit Shift Template' : 'Create New Shift Template'}
                </h3>
                <button onClick={() => setIsShiftModalOpen(false)} className="btn-icon-action">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveShift}>
                <div className="shifts-modal-body">
                  {shiftFormError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: '6px', color: '#991b1b', marginBottom: '16px', fontSize: '0.875rem' }}>
                      <AlertCircle size={15} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                      {shiftFormError}
                    </div>
                  )}

                  <div className="assign-form-group">
                    <label className="assign-label">Shift Name *</label>
                    <input
                      type="text"
                      className="shifts-input"
                      placeholder="e.g. Standard Morning Shift"
                      value={shiftForm.name}
                      onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="assign-form-group">
                    <label className="assign-label">Shift Type *</label>
                    <select
                      className="shifts-select"
                      value={shiftForm.type}
                      onChange={(e) => setShiftForm({ ...shiftForm, type: e.target.value })}
                    >
                      <option value="morning">Morning Shift (Daytime)</option>
                      <option value="evening">Evening Shift (Afternoon / Evening)</option>
                      <option value="night">Night Shift (Overnight / Crosses Midnight)</option>
                      <option value="flexible">Flexible Shift (No fixed hours, minimum duration)</option>
                    </select>
                  </div>

                  {shiftForm.type !== 'flexible' ? (
                    <div className="shifts-form-grid-2">
                      <div className="assign-form-group">
                        <label className="assign-label">Start Time *</label>
                        <input
                          type="time"
                          className="shifts-input"
                          value={shiftForm.start_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                          required
                        />
                      </div>

                      <div className="assign-form-group">
                        <label className="assign-label">End Time *</label>
                        <input
                          type="time"
                          className="shifts-input"
                          value={shiftForm.end_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                          required
                        />
                        {shiftForm.end_time < shiftForm.start_time && (
                          <p style={{ fontSize: '0.75rem', color: '#6d28d9', marginTop: '4px', fontWeight: 600 }}>
                            <Moon size={11} style={{ display: 'inline', marginRight: '3px' }} />
                            Crosses Midnight: Attendance belongs to the shift start date.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px' }}>
                      <p style={{ fontSize: '0.8125rem', color: '#166534', margin: 0 }}>
                        <Sliders size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                        Flexible shifts have no start/end time. Employees can punch in anytime and are never marked late on check-in. Only minimum working minutes apply.
                      </p>
                    </div>
                  )}

                  <div className="shifts-form-grid-2">
                    {shiftForm.type !== 'flexible' ? (
                      <div className="assign-form-group">
                        <label className="assign-label">Grace Minutes</label>
                        <input
                          type="number"
                          className="shifts-input"
                          min="0"
                          max="120"
                          value={shiftForm.grace_minutes}
                          onChange={(e) => setShiftForm({ ...shiftForm, grace_minutes: e.target.value })}
                        />
                        <span className="assign-hint">Arrival cutoff after shift start</span>
                      </div>
                    ) : null}

                    <div className="assign-form-group">
                      <label className="assign-label">Break Minutes</label>
                      <input
                        type="number"
                        className="shifts-input"
                        min="0"
                        max="180"
                        value={shiftForm.break_minutes}
                        onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: e.target.value })}
                      />
                      <span className="assign-hint">Deducted from working hours on checkout</span>
                    </div>

                    <div className="assign-form-group">
                      <label className="assign-label">Minimum Working Minutes *</label>
                      <input
                        type="number"
                        className="shifts-input"
                        min="60"
                        max="1440"
                        step="30"
                        value={shiftForm.min_working_minutes}
                        onChange={(e) => setShiftForm({ ...shiftForm, min_working_minutes: e.target.value })}
                        required
                      />
                      <span className="assign-hint">Under this flags a Short Day (480 = 8h)</span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '8px' }}>
                    <label className="shifts-checkbox-row">
                      <input
                        type="checkbox"
                        checked={shiftForm.is_default}
                        onChange={(e) => setShiftForm({ ...shiftForm, is_default: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        Set as Company Default Shift (Fallback for employees with no specific assignment)
                      </span>
                    </label>

                    <label className="shifts-checkbox-row">
                      <input
                        type="checkbox"
                        checked={shiftForm.is_active}
                        onChange={(e) => setShiftForm({ ...shiftForm, is_active: e.target.checked })}
                      />
                      <span style={{ fontSize: '0.875rem' }}>Active and available for assignment</span>
                    </label>
                  </div>
                </div>

                <div className="shifts-modal-footer">
                  <button type="button" onClick={() => setIsShiftModalOpen(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingShift}>
                    {savingShift ? 'Saving...' : editingShiftId ? 'Update Shift' : 'Create Shift'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =========================================================
            MODAL: CREATE ROTATION PATTERN
            ========================================================= */}
        {isRotationModalOpen && (
          <div className="shifts-modal-backdrop" onClick={() => setIsRotationModalOpen(false)}>
            <div className="shifts-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="shifts-modal-header">
                <h3 className="shifts-modal-title">Create Weekly Rotation Pattern</h3>
                <button onClick={() => setIsRotationModalOpen(false)} className="btn-icon-action">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveRotation}>
                <div className="shifts-modal-body">
                  <div className="assign-form-group">
                    <label className="assign-label">Rotation Name *</label>
                    <input
                      type="text"
                      className="shifts-input"
                      placeholder="e.g. 3-Week Factory Shift Rotation"
                      value={rotationForm.name}
                      onChange={(e) => setRotationForm({ ...rotationForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="assign-form-group">
                    <label className="assign-label">Description (Optional)</label>
                    <input
                      type="text"
                      className="shifts-input"
                      placeholder="e.g. Week 1 Morning, Week 2 Evening, Week 3 Night"
                      value={rotationForm.description}
                      onChange={(e) => setRotationForm({ ...rotationForm, description: e.target.value })}
                    />
                  </div>

                  <div className="assign-form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="assign-label" style={{ margin: 0 }}>Weekly Steps</label>
                      <button type="button" onClick={handleAddRotationStep} className="btn btn-secondary btn-sm">
                        <Plus size={13} />
                        <span>Add Week</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {rotationForm.steps.map((step, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem', width: '65px' }}>
                            Week {step.week_number}
                          </span>
                          <select
                            className="shifts-select"
                            value={step.shift_id}
                            onChange={(e) => {
                              const updated = [...rotationForm.steps];
                              updated[idx].shift_id = e.target.value;
                              setRotationForm({ ...rotationForm, steps: updated });
                            }}
                            required
                          >
                            <option value="">-- Choose Shift for Week {step.week_number} --</option>
                            {shifts.filter((s) => s.is_active).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.type})
                              </option>
                            ))}
                          </select>
                          {rotationForm.steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRotationStep(idx)}
                              className="btn-icon-action danger"
                              title="Remove Week"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="shifts-modal-footer">
                  <button type="button" onClick={() => setIsRotationModalOpen(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingRotation}>
                    {savingRotation ? 'Saving...' : 'Create Rotation'}
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

export default Shifts;
