import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import MonthClosedBanner from '../components/MonthClosedBanner';
import DateRangePicker from '../components/DateRangePicker';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  User,
  PlusCircle,
  X,
  Building2,
  Check,
  AlertCircle,
  MapPin,
  Navigation,
  CalendarDays
} from 'lucide-react';
import './Attendance.css';

const Attendance = () => {
  const { user, isAdmin, isHR, isDeptManager, isEmployee, can } = useAuth();
  const canManageAttendance = isAdmin || isHR || isDeptManager || (typeof can === 'function' && can('attendance.manage'));
  const canSelectCalendarEmployee = isAdmin || isHR || isDeptManager;
  const hasLinkedEmployee = Boolean(user?.employee_id);
  const canExport = isAdmin || isHR || (typeof can === 'function' && can('employee.export'));
  const { success, error: notifyError, subscribeDataChange } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'logs';
  const [isMonthClosed, setIsMonthClosed] = useState(false);
  const [logSort, setLogSort] = useState({ field: 'date', dir: 'desc' });

  const toggleLogSort = (field) => {
    setLogSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' }
    );
  };

  // Live Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Today's Status State
  const [todayStatus, setTodayStatus] = useState({
    hasCheckedIn: false,
    hasCheckedOut: false,
    record: null,
    employeeId: null
  });
  const [punching, setPunching] = useState(false);

  // Geolocation & Exemption State
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [isExempt, setIsExempt] = useState(false);
  const [exemptionDetails, setExemptionDetails] = useState(null);

  // Departments List for Filters
  const [departments, setDepartments] = useState([]);

  // ==========================================
  // 1. LOGS TAB STATE
  // ==========================================
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPagination, setLogsPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [logSearch, setLogSearch] = useState('');
  const [logDept, setLogDept] = useState('all');
  const [logStatus, setLogStatus] = useState('all');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logLimit, setLogLimit] = useState(10);

  // ==========================================
  // 2. CORRECTIONS TAB STATE
  // ==========================================
  const [corrections, setCorrections] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionStatusFilter, setCorrectionStatusFilter] = useState('all');
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    requested_check_in: '',
    requested_check_out: '',
    reason: ''
  });

  // Reject Modal State
  const [rejectModalTarget, setRejectModalTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // ==========================================
  // 3. MONTHLY REPORT TAB STATE
  // ==========================================
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();
  const [reportYear, setReportYear] = useState(currentYearNum);
  const [reportMonth, setReportMonth] = useState(currentMonthNum);
  const [reportDept, setReportDept] = useState('all');
  const [reportData, setReportData] = useState({ report: [], summary: {} });
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  // ==========================================
  // 4. ATTENDANCE CALENDAR TAB STATE
  // ==========================================
  const [calYear, setCalYear] = useState(currentYearNum);
  const [calMonth, setCalMonth] = useState(currentMonthNum);
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calEmployees, setCalEmployees] = useState([]);
  const [calEmployeesLoading, setCalEmployeesLoading] = useState(false);
  const [calSelectedEmployeeId, setCalSelectedEmployeeId] = useState('');
  const [calEmpDropdownOpen, setCalEmpDropdownOpen] = useState(false);
  const [calEmpSearch, setCalEmpSearch] = useState('');
  const calEmpPickerRef = useRef(null);

  // Update live clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Switch Tab
  const handleTabChange = (tabName) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabName);
    setSearchParams(next, { replace: true });
  };

  // Fetch initial departments and today's status
  useEffect(() => {
    api.get('/departments')
      .then((res) => setDepartments(res.data || []))
      .catch((err) => console.error('Failed to load departments', err));

    if (hasLinkedEmployee) {
      api.get('/offices/exemptions/check-self')
        .then((res) => {
          setIsExempt(Boolean(res.data?.isExempt));
          setExemptionDetails(res.data?.exemption || null);
        })
        .catch(() => {});

      fetchTodayStatus();
    }
  }, [hasLinkedEmployee]);

  // Browser Geolocation Helper
  const obtainGeolocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = {
          message: 'Geolocation is not supported by your browser.',
          guide: 'Please use a modern browser (such as Chrome, Edge, Firefox, or Safari) to record attendance.'
        };
        setLocationError(err);
        reject(err);
        return;
      }

      setLocationLoading(true);
      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationLoading(false);
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          resolve(coords);
        },
        (err) => {
          setLocationLoading(false);
          let message = 'Unable to determine your location.';
          let guide = '';

          if (err.code === 1) { // PERMISSION_DENIED
            message = 'Location access permission was denied.';
            guide = 'Please click the site permissions icon in your browser address bar (lock icon), set Location to "Allow", and click Retry Location.';
          } else if (err.code === 2) { // POSITION_UNAVAILABLE
            message = 'GPS / Location position unavailable.';
            guide = 'Please ensure device location services are enabled or step outdoors / near a window for better satellite reception.';
          } else if (err.code === 3) { // TIMEOUT
            message = 'Location request timed out.';
            guide = 'Location lookup took longer than 10 seconds. Check your internet connection and click Retry Location.';
          }

          const fullErr = { message, guide, code: err.code };
          setLocationError(fullErr);
          reject(fullErr);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }, []);

  // Fetch today's punch status
  const fetchTodayStatus = async () => {
    try {
      const res = await api.get('/attendance/today');
      setTodayStatus(res.data);
    } catch (err) {
      console.error('Error fetching today status:', err);
    }
  };

  // Check In Handler
  const handleCheckIn = async () => {
    try {
      setPunching(true);
      let coords = null;

      if (!isExempt) {
        try {
          coords = await obtainGeolocation();
        } catch (geoErr) {
          setPunching(false);
          return; // Error message already stored in locationError
        }
      } else if (navigator.geolocation) {
        // Optional non-blocking capture for exempt staff
        try {
          coords = await new Promise((res) => {
            navigator.geolocation.getCurrentPosition(
              (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
              () => res(null),
              { timeout: 3000 }
            );
          });
        } catch (e) {}
      }

      const res = await api.post('/attendance/check-in', coords || {});
      success(res.data.message || 'Check-in recorded successfully!');
      setLocationError(null);
      await fetchTodayStatus();
      if (activeTab === 'logs') fetchLogs();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check in.';
      notifyError(msg);
    } finally {
      setPunching(false);
    }
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    try {
      setPunching(true);
      let coords = null;

      if (!isExempt) {
        try {
          coords = await obtainGeolocation();
        } catch (geoErr) {
          setPunching(false);
          return; // Error message already stored in locationError
        }
      } else if (navigator.geolocation) {
        // Optional non-blocking capture for exempt staff
        try {
          coords = await new Promise((res) => {
            navigator.geolocation.getCurrentPosition(
              (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
              () => res(null),
              { timeout: 3000 }
            );
          });
        } catch (e) {}
      }

      const res = await api.post('/attendance/check-out', coords || {});
      success(res.data.message || 'Check-out recorded successfully!');
      setLocationError(null);
      await fetchTodayStatus();
      if (activeTab === 'logs') fetchLogs();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check out.';
      notifyError(msg);
    } finally {
      setPunching(false);
    }
  };

  // ==========================================
  // FETCH LOGS
  // ==========================================
  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const params = {
        page: logPage,
        limit: logLimit
      };
      if (logSearch.trim()) params.search = logSearch.trim();
      if (logDept !== 'all') params.department_id = logDept;
      if (logStatus !== 'all') params.status = logStatus;
      if (logStartDate) params.startDate = logStartDate;
      if (logEndDate) params.endDate = logEndDate;

      const res = await api.get('/attendance/history', { params });
      setLogs(res.data.records || []);
      setLogsPagination(res.data.pagination || {
        total: 0,
        page: logPage,
        limit: logLimit,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load attendance logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [logPage, logLimit, logSearch, logDept, logStatus, logStartDate, logEndDate, notifyError]);

  useEffect(() => {
    if (activeTab === 'logs') {
      const timer = setTimeout(() => {
        fetchLogs();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchLogs]);

  // ==========================================
  // FETCH CORRECTIONS
  // ==========================================
  const fetchCorrections = useCallback(async () => {
    try {
      setCorrectionsLoading(true);
      const params = { status: correctionStatusFilter };
      const res = await api.get('/attendance/corrections', { params });
      setCorrections(res.data.corrections || []);
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load correction requests.');
    } finally {
      setCorrectionsLoading(false);
    }
  }, [correctionStatusFilter, notifyError]);

  useEffect(() => {
    if (activeTab === 'corrections') {
      fetchCorrections();
    }
  }, [activeTab, fetchCorrections]);

  // Submit Correction Request
  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmittingCorrection(true);
      const res = await api.post('/attendance/corrections', correctionForm);
      success(res.data.message || 'Correction request submitted!');
      setIsCorrectionModalOpen(false);
      setCorrectionForm({
        date: new Date().toISOString().split('T')[0],
        requested_check_in: '',
        requested_check_out: '',
        reason: ''
      });
      fetchCorrections();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to submit correction request.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Approve Correction
  const handleApproveCorrection = async (id) => {
    try {
      const res = await api.patch(`/attendance/corrections/${id}/approve`);
      success(res.data.message || 'Attendance correction approved!');
      fetchCorrections();
      fetchTodayStatus();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to approve correction.');
    }
  };

  // Reject Correction
  const handleConfirmReject = async () => {
    if (!rejectModalTarget) return;
    try {
      setRejecting(true);
      const res = await api.patch(`/attendance/corrections/${rejectModalTarget.id}/reject`, {
        rejection_reason: rejectReason
      });
      success(res.data.message || 'Correction request rejected.');
      setRejectModalTarget(null);
      setRejectReason('');
      fetchCorrections();
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to reject correction.');
    } finally {
      setRejecting(false);
    }
  };

  // ==========================================
  // FETCH MONTHLY REPORT
  // ==========================================
  const fetchMonthlyReport = useCallback(async () => {
    try {
      setReportLoading(true);
      const params = {
        year: reportYear,
        month: reportMonth
      };
      if (reportDept !== 'all') params.department_id = reportDept;

      const res = await api.get('/attendance/report/monthly', { params });
      setReportData(res.data || { report: [], summary: {} });
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to load monthly attendance report.');
    } finally {
      setReportLoading(false);
    }
  }, [reportYear, reportMonth, reportDept, notifyError]);

  useEffect(() => {
    if (activeTab === 'report') {
      fetchMonthlyReport();
    }
  }, [activeTab, fetchMonthlyReport]);

  // Export Monthly Report (CSV / Excel)
  const handleExportMonthly = async (format) => {
    try {
      setExportingReport(true);
      const params = new URLSearchParams({
        year: reportYear,
        month: reportMonth
      });
      if (reportDept !== 'all') params.append('department_id', reportDept);

      const endpoint = `/attendance/report/export/${format}?${params.toString()}`;
      const res = await api.get(endpoint, { responseType: 'blob' });

      const blob = new Blob([res.data], {
        type: format === 'csv'
          ? 'text/csv;charset=utf-8;'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_report_${reportYear}_${String(reportMonth).padStart(2, '0')}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success(`Monthly attendance report exported to ${format.toUpperCase()}!`);
    } catch (err) {
      notifyError(`Failed to export attendance report to ${format.toUpperCase()}.`);
    } finally {
      setExportingReport(false);
    }
  };

  // Format Time Helper
  const formatTimeStr = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ==========================================
  // FETCH ATTENDANCE CALENDAR
  // ==========================================
  useEffect(() => {
    if (activeTab !== 'calendar' || !canSelectCalendarEmployee || calEmployees.length > 0) return;

    let cancelled = false;
    setCalEmployeesLoading(true);
    api.get('/employees')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
        setCalEmployees(list);
        if (list.length > 0) {
          setCalSelectedEmployeeId((prev) => {
            if (prev) return prev;
            const ownMatch = user?.employee_id && list.find((emp) => String(emp.id) === String(user.employee_id));
            return ownMatch ? String(ownMatch.id) : String(list[0].id);
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load employees for calendar picker:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setCalEmployeesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, canSelectCalendarEmployee, calEmployees.length, user?.employee_id]);

  useEffect(() => {
    if (!calEmpDropdownOpen) return;
    const handleOutside = (e) => {
      if (calEmpPickerRef.current && !calEmpPickerRef.current.contains(e.target)) {
        setCalEmpDropdownOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setCalEmpDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [calEmpDropdownOpen]);

  const fetchEmployeeCalendar = useCallback(async () => {
    if (canSelectCalendarEmployee) {
      if (!calSelectedEmployeeId) {
        setCalData(null);
        return;
      }
    } else if (!hasLinkedEmployee) {
      setCalData(null);
      return;
    }

    try {
      setCalLoading(true);
      const params = { year: calYear, month: calMonth };
      if (canSelectCalendarEmployee && calSelectedEmployeeId) {
        params.employeeId = calSelectedEmployeeId;
      }
      const res = await api.get('/calendar/employee-calendar', { params });
      setCalData(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setCalData(null);
        return;
      }
      notifyError(err.response?.data?.message || 'Failed to load employee attendance calendar.');
    } finally {
      setCalLoading(false);
    }
  }, [calYear, calMonth, canSelectCalendarEmployee, calSelectedEmployeeId, hasLinkedEmployee, notifyError]);

  useEffect(() => {
    if (activeTab === 'calendar') {
      fetchEmployeeCalendar();
    }
  }, [activeTab, fetchEmployeeCalendar]);

  // Real-time listener for attendance data-changed events
  useEffect(() => {
    if (!subscribeDataChange) return;
    const unsubscribe = subscribeDataChange((eventData) => {
      if (eventData.event === 'attendance:updated') {
        if (hasLinkedEmployee) fetchTodayStatus();
        if (activeTab === 'logs') fetchLogs();
        if (activeTab === 'corrections') fetchCorrections();
        if (activeTab === 'monthly') fetchMonthlyReport();
        if (activeTab === 'calendar') fetchEmployeeCalendar();
      }
    });
    return unsubscribe;
  }, [subscribeDataChange, activeTab, hasLinkedEmployee, fetchTodayStatus, fetchLogs, fetchCorrections, fetchMonthlyReport, fetchEmployeeCalendar]);

  const handlePrevCalMonth = () => {
    if (calMonth === 1) {
      setCalMonth(12);
      setCalYear((prev) => prev - 1);
    } else {
      setCalMonth((prev) => prev - 1);
    }
  };

  const handleNextCalMonth = () => {
    if (calMonth === 12) {
      setCalMonth(1);
      setCalYear((prev) => prev + 1);
    } else {
      setCalMonth((prev) => prev + 1);
    }
  };

  const handleTodayCal = () => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth() + 1);
  };

  // Format Date Helper
  const formatDateStr = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate live working hours for active check-in
  const getLiveWorkedHours = () => {
    if (!todayStatus.record || !todayStatus.record.check_in) return '0.00';
    if (todayStatus.record.check_out) {
      return Number(todayStatus.record.total_hours || 0).toFixed(2);
    }
    const checkIn = new Date(todayStatus.record.check_in);
    const diffMs = currentTime.getTime() - checkIn.getTime();
    if (diffMs < 0) return '0.00';
    return (diffMs / (1000 * 60 * 60)).toFixed(2);
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content attendance-main">
        {/* Header with Title and Live Clock */}
        <div className="attendance-header">
          <div>
            <h1 className="attendance-title">Employee Attendance Management</h1>
            <p className="attendance-subtitle">
              Daily check-ins, work hour calculations, monthly aggregated reports, and correction approvals.
            </p>
          </div>

          <div className="attendance-live-clock-card">
            <Clock size={20} className="clock-icon" />
            <div className="clock-details">
              <span className="clock-time">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
              <span className="clock-date">
                {currentTime.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <MonthClosedBanner
          month={activeTab === 'report' && reportMonth ? reportMonth : new Date().toISOString().slice(0, 7)}
          onStatusChange={setIsMonthClosed}
        />

        {/* Quick Punch Card for Logged In Employee */}
        {hasLinkedEmployee && (
        <div className="card attendance-punch-card">
          <div className="punch-status-wrap">
            <div className="punch-indicator-col">
              <span className="punch-col-title">Today's Punch Status</span>
              <div className="punch-status-row">
                {!todayStatus.hasCheckedIn ? (
                  <span className="badge badge-inactive">Not Checked In</span>
                ) : !todayStatus.hasCheckedOut ? (
                  <span className="badge badge-active">
                    Checked In at {formatTimeStr(todayStatus.record?.check_in)}
                  </span>
                ) : (
                  <span className="badge badge-completed">
                    Completed Shift ({todayStatus.record?.total_hours} hrs)
                  </span>
                )}

                {todayStatus.record?.is_late ? (
                  <span className="badge badge-late" title={`Arrived late (${todayStatus.record.late_minutes}m)`}>
                    <AlertTriangle size={12} />
                    <span>Late ({todayStatus.record.late_minutes}m)</span>
                  </span>
                ) : null}

                {todayStatus.record?.is_short_day ? (
                  <span className="badge badge-late" style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }} title="Working hours under shift minimum">
                    <AlertTriangle size={12} />
                    <span>Short Day</span>
                  </span>
                ) : null}

                {isExempt && (
                  <span className="badge badge-active" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }} title={`Location Exempt: ${exemptionDetails?.reason || 'Approved'}`}>
                    <MapPin size={12} />
                    <span>Exempt (Remote)</span>
                  </span>
                )}

                {todayStatus.record?.check_in_office_name && (
                  <span className="badge badge-inactive" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }} title={`Checked in at ${todayStatus.record.check_in_office_name} (${Math.round(todayStatus.record.check_in_distance || 0)}m, accuracy ±${Math.round(todayStatus.record.check_in_accuracy || 0)}m)`}>
                    <MapPin size={12} />
                    <span>{todayStatus.record.check_in_office_name} ({Math.round(todayStatus.record.check_in_distance || 0)}m)</span>
                  </span>
                )}

                {todayStatus.record?.is_flagged_suspicious ? (
                  <span className="badge badge-late" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }} title={todayStatus.record.suspicious_reason}>
                    <AlertTriangle size={12} />
                    <span>Flagged: {todayStatus.record.suspicious_reason}</span>
                  </span>
                ) : null}

                {todayStatus.shift && (
                  <span className="badge badge-inactive" style={{ background: '#f8fafc', color: 'var(--text-secondary)' }} title="Assigned daily shift">
                    <Clock size={12} />
                    <span>{todayStatus.shift.name} ({todayStatus.shift.type === 'flexible' ? 'Flexible' : `${todayStatus.shift.start_time?.slice(0, 5)} - ${todayStatus.shift.end_time?.slice(0, 5)}`})</span>
                  </span>
                )}

                {todayStatus.record?.is_corrected ? (
                  <span className="badge badge-corrected" title="Approved by Manager / HR">
                    <CheckCircle size={12} />
                    <span>Corrected</span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="punch-stats-col">
              <div className="punch-stat-item">
                <span className="stat-label">Check In</span>
                <span className="stat-value">{formatTimeStr(todayStatus.record?.check_in)}</span>
              </div>
              <div className="punch-stat-item">
                <span className="stat-label">Check Out</span>
                <span className="stat-value">{formatTimeStr(todayStatus.record?.check_out)}</span>
              </div>
              <div className="punch-stat-item">
                <span className="stat-label">Hours Worked</span>
                <span className="stat-value highlight">{getLiveWorkedHours()} hrs</span>
              </div>
            </div>

            <div className="punch-actions-col">
              {locationError && (
                <div className="attendance-geo-error" role="alert">
                  <div className="attendance-geo-error-msg">
                    <AlertCircle size={16} className="text-danger" />
                    <div>
                      <strong>{locationError.message}</strong>
                      {locationError.guide && <p className="attendance-geo-guide">{locationError.guide}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => obtainGeolocation()}
                    className="btn btn-secondary btn-xs attendance-geo-retry"
                  >
                    <RotateCcw size={12} />
                    <span>Retry Location</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isMonthClosed || todayStatus.hasCheckedIn || punching}
                className="btn btn-primary punch-btn"
                title={isMonthClosed ? 'Month is closed' : todayStatus.hasCheckedIn ? 'Already checked in for today' : 'Check in for today'}
              >
                <LogIn size={16} />
                <span>{punching ? (locationLoading ? 'Locating...' : 'Recording...') : 'Check In'}</span>
              </button>

              <button
                type="button"
                onClick={handleCheckOut}
                disabled={isMonthClosed || !todayStatus.hasCheckedIn || todayStatus.hasCheckedOut || punching}
                className="btn btn-danger punch-btn"
                title={
                  !todayStatus.hasCheckedIn 
                    ? 'Must check in before checking out' 
                    : todayStatus.hasCheckedOut 
                      ? 'Already checked out for today' 
                      : 'Check out for today'
                }
              >
                <LogOut size={16} />
                <span>{punching ? (locationLoading ? 'Locating...' : 'Recording...') : 'Check Out'}</span>
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Tab Navigation */}
        <div className="attendance-tabs-bar">
          <button
            type="button"
            onClick={() => handleTabChange('logs')}
            className={`attendance-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          >
            <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
            <span data-text="Attendance Logs">Attendance Logs</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('corrections')}
            className={`attendance-tab-btn ${activeTab === 'corrections' ? 'active' : ''}`}
          >
            <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
            <span data-text="Correction Requests">Correction Requests</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('report')}
            className={`attendance-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
          >
            <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />
            <span data-text="Monthly Report">Monthly Report</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('calendar')}
            className={`attendance-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          >
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
            <span data-text="Attendance Calendar">Attendance Calendar</span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: ATTENDANCE LOGS */}
        {/* ========================================================= */}
        {activeTab === 'logs' && (
          <div className="attendance-tab-content">
            {/* Filter Bar */}
            <div className="card attendance-filter-card">
              <div className={`attendance-filters-row ${!(isAdmin || isHR) ? 'no-dept' : ''}`}>
                <div className="attendance-search-box">
                  <Search size={15} className="attendance-search-icon" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search employees"
                    aria-label="Search employees"
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value);
                      setLogPage(1);
                    }}
                    className="input attendance-search-input"
                  />
                  {logSearch && (
                    <button
                      type="button"
                      onClick={() => setLogSearch('')}
                      className="attendance-clear-btn"
                      aria-label="Clear search"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {(isAdmin || isHR) && (
                  <select
                    value={logDept}
                    onChange={(e) => {
                      setLogDept(e.target.value);
                      setLogPage(1);
                    }}
                    className="select attendance-select"
                    aria-label="Filter by Department"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}

                <select
                  value={logStatus}
                  onChange={(e) => {
                    setLogStatus(e.target.value);
                    setLogPage(1);
                  }}
                  className="select attendance-select"
                  aria-label="Filter by Status"
                >
                  <option value="all">All Statuses</option>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Half Day">Half Day</option>
                </select>

                <div className="attendance-date-range">
                  <DateRangePicker
                    startDate={logStartDate}
                    endDate={logEndDate}
                    label="Date"
                    onChange={({ startDate, endDate }) => {
                      setLogStartDate(startDate);
                      setLogEndDate(endDate);
                      setLogPage(1);
                    }}
                  />
                </div>

                {(logSearch || ((isAdmin || isHR) && logDept !== 'all') || logStatus !== 'all' || logStartDate || logEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogSearch('');
                      setLogDept('all');
                      setLogStatus('all');
                      setLogStartDate('');
                      setLogEndDate('');
                      setLogPage(1);
                    }}
                    className="attendance-filter-reset-btn"
                    title="Clear all active filters"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    <span>
                      Clear filters (
                      {[
                        Boolean(logSearch),
                        (isAdmin || isHR) && logDept !== 'all',
                        logStatus !== 'all',
                        Boolean(logStartDate || logEndDate),
                      ].filter(Boolean).length}
                      )
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Logs Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll logs-no-scroll">
                <table className="attendance-table attendance-logs-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th logs-col-emp" title="Employee">Employee</th>
                      <th className="attendance-th logs-col-dept" title="Department">Department</th>
                      <th className="attendance-th logs-col-date" title="Date">
                        <button type="button" className="attendance-sort-btn" onClick={() => toggleLogSort('date')}>
                          <span>Date</span>
                          <ArrowUpDown size={12} className={`attendance-sort-icon ${logSort.field === 'date' ? 'active' : ''}`} />
                        </button>
                      </th>
                      <th className="attendance-th logs-col-in" title="Check In">Check In</th>
                      <th className="attendance-th logs-col-out" title="Check Out">Check Out</th>
                      <th className="attendance-th numeric logs-col-hours" title="Hours">
                        <button type="button" className="attendance-sort-btn numeric" onClick={() => toggleLogSort('hours')}>
                          <span>Hours</span>
                          <ArrowUpDown size={12} className={`attendance-sort-icon ${logSort.field === 'hours' ? 'active' : ''}`} />
                        </button>
                      </th>
                      <th className="attendance-th logs-col-loc" title="Location">Location</th>
                      <th className="attendance-th logs-col-status" title="Status">
                        <button type="button" className="attendance-sort-btn" onClick={() => toggleLogSort('status')}>
                          <span>Status</span>
                          <ArrowUpDown size={12} className={`attendance-sort-icon ${logSort.field === 'status' ? 'active' : ''}`} />
                        </button>
                      </th>
                      <th className="attendance-th logs-col-corr" title="Correction">Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan="9" className="attendance-empty-cell">
                          Loading attendance records...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="attendance-empty-cell">
                          No attendance records match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      [...logs].sort((a, b) => {
                        const factor = logSort.dir === 'asc' ? 1 : -1;
                        if (logSort.field === 'hours') {
                          return ((Number(a.total_hours) || 0) - (Number(b.total_hours) || 0)) * factor;
                        }
                        if (logSort.field === 'status') {
                          return String(a.status || '').localeCompare(String(b.status || '')) * factor;
                        }
                        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * factor;
                      }).map((record) => {
                        const hoursVal = Number(record.total_hours || 0);
                        const isAbsentZero = hoursVal === 0 && record.status === 'Absent';
                        const statusSlug = record.is_missing_checkout
                          ? 'missing-checkout'
                          : (record.status || 'Present').toLowerCase().replace(/\s+/g, '-');
                        const statusLabel = record.is_missing_checkout ? 'Missing Checkout' : record.status;

                        return (
                          <tr key={record.id} className="attendance-tr logs-row">
                            <td className="attendance-td logs-col-emp" data-label="Employee">
                              <div className="attendance-emp-col">
                                <span className="attendance-emp-name" title={record.employee_name}>
                                  {record.employee_name}
                                </span>
                                <span className="attendance-emp-id">#{record.employee_id}</span>
                              </div>
                            </td>
                            <td className="attendance-td logs-col-dept" data-label="Department">
                              <span className="attendance-dept-text" title={record.department_name || 'Unassigned'}>
                                {record.department_name || 'Unassigned'}
                              </span>
                            </td>
                            <td className="attendance-td logs-col-date" data-label="Date">
                              {formatDateStr(record.date)}
                            </td>
                            <td className="attendance-td logs-col-in" data-label="Check In">
                              {record.check_in ? (
                                <div className="attendance-time-tag">
                                  <span>{formatTimeStr(record.check_in)}</span>
                                  {record.is_late ? (
                                    <span className="tag-late" title={`Late by ${record.late_minutes} minutes`}>
                                      +{record.late_minutes}m
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="attendance-empty-dash">—</span>
                              )}
                            </td>
                            <td className="attendance-td logs-col-out" data-label="Check Out">
                              {record.check_out ? (
                                <span>{formatTimeStr(record.check_out)}</span>
                              ) : (
                                <span className="attendance-empty-dash">—</span>
                              )}
                            </td>
                            <td className="attendance-td numeric logs-col-hours" data-label="Hours">
                              {isAbsentZero ? (
                                <span className="attendance-empty-dash">—</span>
                              ) : (
                                <span className="attendance-hours-plain">
                                  {hoursVal.toFixed(2)}h
                                </span>
                              )}
                            </td>
                            <td className="attendance-td logs-col-loc" data-label="Location">
                              {record.check_in_location_status === 'inside' ? (
                                <span className="badge badge-office-tag" title={`Distance: ${Math.round(record.check_in_distance || 0)}m to ${record.check_in_office_name || 'Office'}`}>
                                  <MapPin size={11} />
                                  <span>{record.check_in_office_name || 'Office'}</span>
                                </span>
                              ) : record.check_in_location_status === 'exempt' ? (
                                <span className="badge badge-exempt-tag" title="Location exempt (Remote/Field)">
                                  <MapPin size={11} />
                                  <span>Exempt</span>
                                </span>
                              ) : record.check_in_location_status === 'outside' ? (
                                <span className="badge badge-late" title="Check-in outside office geofence">
                                  <AlertTriangle size={11} />
                                  <span>Outside</span>
                                </span>
                              ) : null}
                            </td>
                            <td className="attendance-td logs-col-status" data-label="Status">
                              <span className={`att-status-soft status-${statusSlug}`} title={statusLabel}>
                                <span className="att-status-dot" aria-hidden="true" />
                                <span className="att-status-text">{statusLabel}</span>
                              </span>
                            </td>
                            <td className="attendance-td logs-col-corr" data-label="Correction">
                              {record.is_corrected ? (
                                <span className="badge badge-corrected">Corrected</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Logs Pagination Bar */}
              {!logsLoading && logsPagination.total > 0 && (
                <div className="attendance-pagination-bar">
                  <span className="attendance-pagination-info">
                    Showing <strong>{(logPage - 1) * logLimit + 1}</strong> to{' '}
                    <strong>{Math.min(logPage * logLimit, logsPagination.total)}</strong> of{' '}
                    <strong>{logsPagination.total}</strong> records
                  </span>

                  <div className="attendance-pagination-actions">
                    <select
                      value={logLimit}
                      onChange={(e) => {
                        setLogLimit(Number(e.target.value));
                        setLogPage(1);
                      }}
                      className="select attendance-page-size-select"
                    >
                      <option value={10}>10 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={!logsPagination.hasPrevPage}
                      className="btn btn-secondary btn-sm"
                    >
                      <ChevronLeft size={14} />
                      <span>Prev</span>
                    </button>

                    <span className="attendance-page-num-display">
                      Page {logPage} of {logsPagination.totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setLogPage((p) => Math.min(logsPagination.totalPages, p + 1))}
                      disabled={!logsPagination.hasNextPage}
                      className="btn btn-secondary btn-sm"
                    >
                      <span>Next</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CORRECTIONS */}
        {/* ========================================================= */}
        {activeTab === 'corrections' && (
          <div className="attendance-tab-content">
            <div className="attendance-corrections-top-actions">
              <div className="status-pill-filter">
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('all')}
                  className={`pill-btn ${correctionStatusFilter === 'all' ? 'active' : ''}`}
                >
                  All Requests
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('PENDING')}
                  className={`pill-btn ${correctionStatusFilter === 'PENDING' ? 'active' : ''}`}
                >
                  Pending
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('APPROVED')}
                  className={`pill-btn ${correctionStatusFilter === 'APPROVED' ? 'active' : ''}`}
                >
                  Approved
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStatusFilter('REJECTED')}
                  className={`pill-btn ${correctionStatusFilter === 'REJECTED' ? 'active' : ''}`}
                >
                  Rejected
                </button>
              </div>

              {/* Submit request button for employees */}
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(true)}
                className="btn btn-primary"
              >
                <PlusCircle size={15} />
                <span>Submit Correction Request</span>
              </button>
            </div>

            {/* Corrections Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th">Employee</th>
                      <th className="attendance-th">Target Date</th>
                      <th className="attendance-th">Requested Check-In</th>
                      <th className="attendance-th">Requested Check-Out</th>
                      <th className="attendance-th">Reason</th>
                      <th className="attendance-th">Status</th>
                      <th className="attendance-th">Reviewed By</th>
                      {canManageAttendance && <th className="attendance-th actions">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {correctionsLoading ? (
                      <tr>
                        <td colSpan={canManageAttendance ? 8 : 7} className="attendance-empty-cell">
                          Loading correction requests...
                        </td>
                      </tr>
                    ) : corrections.length === 0 ? (
                      <tr>
                        <td colSpan={canManageAttendance ? 8 : 7} className="attendance-empty-cell">
                          No correction requests found for the selected status.
                        </td>
                      </tr>
                    ) : (
                      corrections.map((corr) => (
                        <tr key={corr.id} className="attendance-tr">
                          <td className="attendance-td">
                            <div className="attendance-emp-col">
                              <span className="attendance-emp-name">{corr.employee_name}</span>
                              <span className="attendance-emp-id">ID #{corr.employee_id}</span>
                            </div>
                          </td>
                          <td className="attendance-td font-medium">
                            {formatDateStr(corr.date)}
                          </td>
                          <td className="attendance-td">
                            {formatTimeStr(corr.requested_check_in)}
                          </td>
                          <td className="attendance-td">
                            {formatTimeStr(corr.requested_check_out)}
                          </td>
                          <td className="attendance-td max-w-sm">
                            <span className="correction-reason-text" title={corr.reason}>
                              {corr.reason}
                            </span>
                            {corr.rejection_reason && (
                              <div className="correction-rejection-note">
                                <strong>Rejection note:</strong> {corr.rejection_reason}
                              </div>
                            )}
                          </td>
                          <td className="attendance-td">
                            <span className={`badge ${
                              corr.status === 'APPROVED' 
                                ? 'badge-active' 
                                : corr.status === 'REJECTED' 
                                  ? 'badge-late' 
                                  : 'badge-pending'
                            }`}>
                              {corr.status}
                            </span>
                          </td>
                          <td className="attendance-td">
                            <span className="text-muted">
                              {corr.reviewer_name ? `${corr.reviewer_name}` : 'Awaiting Review'}
                            </span>
                          </td>
                          {canManageAttendance && (
                            <td className="attendance-td actions">
                              {corr.status === 'PENDING' ? (
                                <div className="correction-actions-group">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveCorrection(corr.id)}
                                    className="btn btn-secondary btn-sm action-approve"
                                    title="Approve and apply correction"
                                  >
                                    <Check size={14} />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectModalTarget(corr);
                                      setRejectReason('');
                                    }}
                                    className="btn btn-danger btn-sm action-reject"
                                    title="Reject correction"
                                  >
                                    <X size={14} />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: MONTHLY REPORT */}
        {/* ========================================================= */}
        {activeTab === 'report' && (
          <div className="attendance-tab-content">
            {/* Report Filter & Export Bar */}
            <div className="card attendance-filter-card">
              <div className="attendance-report-toolbar">
                <div className="attendance-report-selects">
                  <div className="report-select-wrap">
                    <span className="report-select-label">Month:</span>
                    <select
                      value={reportMonth}
                      onChange={(e) => setReportMonth(Number(e.target.value))}
                      className="select"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const date = new Date(2026, m - 1, 1);
                        return (
                          <option key={m} value={m}>
                            {date.toLocaleString('default', { month: 'long' })}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="report-select-wrap">
                    <span className="report-select-label">Year:</span>
                    <select
                      value={reportYear}
                      onChange={(e) => setReportYear(Number(e.target.value))}
                      className="select"
                    >
                      {[currentYearNum - 1, currentYearNum, currentYearNum + 1].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  {(isAdmin || isHR) && (
                    <div className="report-select-wrap">
                      <span className="report-select-label">Department:</span>
                      <select
                        value={reportDept}
                        onChange={(e) => setReportDept(e.target.value)}
                        className="select"
                      >
                        <option value="all">All Departments</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {canExport && (
                  <div className="attendance-report-export-btns">
                    <button
                      type="button"
                      disabled={exportingReport}
                      onClick={() => handleExportMonthly('csv')}
                      className="btn btn-secondary btn-sm"
                    >
                      <FileText size={14} className="text-indigo" />
                      <span>{exportingReport ? 'Exporting...' : 'Export CSV'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingReport}
                      onClick={() => handleExportMonthly('excel')}
                      className="btn btn-secondary btn-sm"
                    >
                      <FileSpreadsheet size={14} className="text-emerald" />
                      <span>{exportingReport ? 'Exporting...' : 'Export Excel'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="attendance-kpi-grid">
              <div className="card kpi-card">
                <span className="kpi-label">Employees Tracked</span>
                <span className="kpi-value">{reportData.summary?.totalEmployees || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Total Days Present</span>
                <span className="kpi-value text-emerald">{reportData.summary?.totalPresentDays || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Late Arrivals</span>
                <span className="kpi-value text-amber">{reportData.summary?.totalLateDays || 0}</span>
              </div>
              <div className="card kpi-card">
                <span className="kpi-label">Total Hours Worked</span>
                <span className="kpi-value text-indigo">{reportData.summary?.totalHours || 0}h</span>
              </div>
            </div>

            {/* Report Table */}
            <div className="card attendance-table-card">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr className="attendance-thead">
                      <th className="attendance-th">Employee</th>
                      <th className="attendance-th">Department</th>
                      <th className="attendance-th">Designation</th>
                      <th className="attendance-th">Days Present</th>
                      <th className="attendance-th">Late Days</th>
                      <th className="attendance-th">Half Days</th>
                      <th className="attendance-th">Total Hours</th>
                      <th className="attendance-th">Avg Hours / Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportLoading ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          Compiling monthly attendance report...
                        </td>
                      </tr>
                    ) : reportData.report.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="attendance-empty-cell">
                          No attendance data found for the selected month and year.
                        </td>
                      </tr>
                    ) : (
                      reportData.report.map((row) => (
                        <tr key={row.employee_id} className="attendance-tr">
                          <td className="attendance-td">
                            <div className="attendance-emp-col">
                              <span className="attendance-emp-name">{row.employee_name}</span>
                              <span className="attendance-emp-id">ID #{row.employee_id}</span>
                            </div>
                          </td>
                          <td className="attendance-td">
                            {row.department_name || 'Unassigned'}
                          </td>
                          <td className="attendance-td">
                            {row.designation || '—'}
                          </td>
                          <td className="attendance-td font-medium text-emerald">
                            {row.days_present || 0}
                          </td>
                          <td className="attendance-td">
                            {row.days_late > 0 ? (
                              <span className="tag-late">{row.days_late}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="attendance-td">
                            {row.days_half_day || 0}
                          </td>
                          <td className="attendance-td font-semibold">
                            {Number(row.total_hours_worked || 0).toFixed(2)} hrs
                          </td>
                          <td className="attendance-td">
                            {Number(row.avg_hours_per_day || 0).toFixed(2)} hrs/day
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ATTENDANCE CALENDAR */}
        {/* ========================================================= */}
        {activeTab === 'calendar' && (
          <div className="attendance-tab-content">
            {/* Toolbar Card */}
            <div className="card att-cal-toolbar-card">
              <div className="att-cal-toolbar">
                <div className="att-cal-nav">
                  <button
                    type="button"
                    onClick={handlePrevCalMonth}
                    className="btn btn-secondary btn-sm"
                    title="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="att-cal-month-label">
                    <CalendarDays size={18} className="text-primary" />
                    <span className="font-bold text-lg">
                      {new Date(calYear, calMonth - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextCalMonth}
                    className="btn btn-secondary btn-sm"
                    title="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleTodayCal}
                    className="btn btn-ghost btn-sm"
                  >
                    Today
                  </button>
                </div>

                {canSelectCalendarEmployee && (
                  <div className="att-cal-emp-picker" ref={calEmpPickerRef}>
                    {(() => {
                      const selectedEmp = calEmployees.find((e) => String(e.id) === String(calSelectedEmployeeId));
                      const searchTerm = calEmpSearch.trim().toLowerCase();
                      const filteredEmps = calEmployees.filter((e) => {
                        if (!searchTerm) return true;
                        return (
                          String(e.name || '').toLowerCase().includes(searchTerm) ||
                          String(e.id || '').includes(searchTerm) ||
                          String(e.department_name || '').toLowerCase().includes(searchTerm)
                        );
                      });

                      return (
                        <>
                          <button
                            type="button"
                            className={`att-cal-emp-trigger ${calEmpDropdownOpen ? 'open' : ''}`}
                            onClick={() => setCalEmpDropdownOpen((prev) => !prev)}
                            disabled={calEmployeesLoading}
                            aria-expanded={calEmpDropdownOpen}
                            aria-label="Select employee for attendance calendar"
                          >
                            <User size={15} className="att-cal-emp-icon" />
                            <span className="att-cal-emp-label">
                              {calEmployeesLoading
                                ? 'Loading employees...'
                                : selectedEmp
                                  ? `${selectedEmp.name} (#${selectedEmp.id})`
                                  : 'Select an employee'}
                            </span>
                            <ChevronDown size={14} className={`att-cal-emp-chevron ${calEmpDropdownOpen ? 'rotated' : ''}`} />
                          </button>

                          {calEmpDropdownOpen && (
                            <div className="att-cal-emp-menu" role="listbox">
                              <div className="att-cal-emp-search-wrap">
                                <Search size={14} className="att-cal-emp-search-icon" />
                                <input
                                  type="text"
                                  className="att-cal-emp-search-input"
                                  placeholder="Search name, ID, or department..."
                                  value={calEmpSearch}
                                  onChange={(e) => setCalEmpSearch(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              <div className="att-cal-emp-list">
                                {filteredEmps.length === 0 ? (
                                  <div className="att-cal-emp-empty">No matching employees</div>
                                ) : (
                                  filteredEmps.map((emp) => {
                                    const isSelected = String(emp.id) === String(calSelectedEmployeeId);
                                    return (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        className={`att-cal-emp-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                          setCalSelectedEmployeeId(String(emp.id));
                                          setCalEmpDropdownOpen(false);
                                          setCalEmpSearch('');
                                        }}
                                      >
                                        <div className="att-cal-emp-opt-main">
                                          <span className="att-cal-emp-opt-name">{emp.name}</span>
                                          <span className="att-cal-emp-opt-meta">
                                            #{emp.id}{emp.department_name ? ` · ${emp.department_name}` : ''}
                                          </span>
                                        </div>
                                        {isSelected && <Check size={14} className="att-cal-emp-check" />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {canSelectCalendarEmployee && !calEmployeesLoading && !calSelectedEmployeeId ? (
              <div className="card att-cal-empty-state">
                <CalendarDays size={28} className="att-cal-empty-icon" />
                <p>Select an employee to view their calendar</p>
              </div>
            ) : (
            <>
            {/* Summary Metrics */}
            {calData?.summary && (
              <div className="att-cal-metrics-row">
                <div className="card att-metric-card metric-present">
                  <span className="att-metric-label">Present</span>
                  <span className="att-metric-value">{calData.summary.presentCount}</span>
                </div>
                <div className="card att-metric-card metric-late">
                  <span className="att-metric-label">Late Arrival</span>
                  <span className="att-metric-value">{calData.summary.lateCount}</span>
                </div>
                <div className="card att-metric-card metric-absent">
                  <span className="att-metric-label">Unexcused Absent</span>
                  <span className="att-metric-value">{calData.summary.absentCount}</span>
                </div>
                <div className="card att-metric-card metric-leave">
                  <span className="att-metric-label">Approved Leave</span>
                  <span className="att-metric-value">{calData.summary.leaveCount} d</span>
                </div>
                <div className="card att-metric-card metric-holiday">
                  <span className="att-metric-label">Public Holidays</span>
                  <span className="att-metric-value">{calData.summary.holidayCount}</span>
                </div>
              </div>
            )}

            {/* Calendar Grid */}
            <div className="card att-cal-grid-card">
              <div className="att-cal-weekdays">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {calLoading ? (
                <div className="att-cal-loading">Loading attendance calendar...</div>
              ) : !calData?.days ? (
                <div className="att-cal-empty-state">
                  <CalendarDays size={28} className="att-cal-empty-icon" />
                  <p>No attendance calendar found for this employee.</p>
                </div>
              ) : (
                <div className="att-cal-days-grid">
                  {/* Empty cells for offset */}
                  {Array.from({ length: new Date(calYear, calMonth - 1, 1).getDay() }).map((_, idx) => (
                    <div key={`offset-${idx}`} className="att-cal-day-cell empty"></div>
                  ))}

                  {/* Day cells */}
                  {calData?.days?.map((d) => {
                    const statusClass = `cell-type-${d.type}`;
                    return (
                      <div
                        key={d.date}
                        className={`att-cal-day-cell ${statusClass}`}
                        title={`${d.date}: ${d.title}`}
                      >
                        <div className="att-cal-cell-header">
                          <span className="att-cal-day-num">{d.day}</span>
                          <span className={`att-cal-badge badge-${d.type}`}>{d.badge}</span>
                        </div>
                        <div className="att-cal-cell-body">
                          {d.attendance?.check_in && (
                            <div className="att-cal-time-row font-mono">
                              {formatTimeStr(d.attendance.check_in)}
                              {d.attendance.check_out && ` - ${formatTimeStr(d.attendance.check_out)}`}
                            </div>
                          )}
                          {d.attendance?.total_hours > 0 && (
                            <div className="att-cal-hours-row font-mono">
                              {d.attendance.total_hours} hrs
                            </div>
                          )}
                          {d.holiday && (
                            <div className="att-cal-holiday-name" title={d.holiday.name}>
                              {d.holiday.name}
                            </div>
                          )}
                          {d.leave && (
                            <div className="att-cal-leave-type">
                              {d.leave.leave_type} {d.leave.is_half_day ? '(½ d)' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: SUBMIT CORRECTION REQUEST */}
        {/* ========================================================= */}
        {isCorrectionModalOpen && (
          <div className="modal-backdrop">
            <div className="card modal-card attendance-modal-card">
              <div className="modal-header">
                <div className="modal-icon attendance-modal-icon">
                  <PlusCircle size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Request Attendance Correction</h3>
                  <p className="modal-subtitle">
                    Submit verified timestamps and reason for manager review.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCorrectionSubmit} className="attendance-modal-form">
                <div className="form-group">
                  <label className="label">Target Date *</label>
                  <input
                    type="date"
                    required
                    value={correctionForm.date}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="input"
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="label">Requested Check-In *</label>
                    <input
                      type="datetime-local"
                      required
                      value={correctionForm.requested_check_in}
                      onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_check_in: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Requested Check-Out *</label>
                    <input
                      type="datetime-local"
                      required
                      value={correctionForm.requested_check_out}
                      onChange={(e) => setCorrectionForm((prev) => ({ ...prev, requested_check_out: e.target.value }))}
                      className="input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Reason / Justification *</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Forgot to punch out due to on-site client meeting..."
                    value={correctionForm.reason}
                    onChange={(e) => setCorrectionForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="input textarea"
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => setIsCorrectionModalOpen(false)}
                    disabled={submittingCorrection}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCorrection}
                    className="btn btn-primary"
                  >
                    {submittingCorrection ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL: REJECT CORRECTION */}
        {/* ========================================================= */}
        {rejectModalTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon text-danger">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="modal-title">Reject Attendance Correction</h3>
                  <p className="modal-subtitle">
                    Specify the reason why this correction is being rejected.
                  </p>
                </div>
              </div>

              <div className="modal-body-text">
                Rejecting request from <strong>{rejectModalTarget.employee_name}</strong> for date <strong>{formatDateStr(rejectModalTarget.date)}</strong>.
              </div>

              <div className="form-group mt-3">
                <label className="label">Rejection Reason</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Timestamps could not be verified with building security logs."
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
                  {rejecting ? 'Rejecting...' : 'Reject Correction'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Attendance;

