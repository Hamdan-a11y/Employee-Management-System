import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Lock,
  FileText,
  Download,
  Calendar,
  RefreshCw,
  Sliders,
  X,
  Search,
  Eye,
  Check,
  ShieldCheck,
  Info
} from 'lucide-react';
import './Payroll.css';

export default function Payroll() {
  const { user } = useAuth();
  const isAdminOrHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [loading, setLoading] = useState(false);
  const [runData, setRunData] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selected Payslip Modal state
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [payslipDetails, setPayslipDetails] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Salary Management Modal
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salariesList, setSalariesList] = useState([]);
  const [selectedEmployeeSalary, setSelectedEmployeeSalary] = useState(null);
  const [salaryAuditHistory, setSalaryAuditHistory] = useState([]);
  const [salaryForm, setSalaryForm] = useState({
    basic_salary: '',
    allowances: '',
    fixed_deductions: '',
    effective_date: ''
  });

  // Settings Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    late_arrival_threshold: 3,
    late_deduction_days: 1.0,
    overtime_multiplier: 1.5,
    standard_daily_hours: 8.0,
    currency: 'PKR'
  });

  // Fetch departments
  useEffect(() => {
    api.get('/departments')
      .then(res => setDepartments(res.data || []))
      .catch(() => {});
  }, []);

  // Fetch run data when month changes
  const fetchRunData = async (month = currentMonth) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(`/payroll/runs/${month}`);
      setRunData(res.data.run || null);
      setPayslips(res.data.payslips || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setRunData(null);
        setPayslips([]);
      } else {
        setErrorMsg(err.response?.data?.message || 'Failed to load payroll data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunData(currentMonth);
  }, [currentMonth]);

  // Generate Payroll Run
  const handleGeneratePayroll = async () => {
    if (!window.confirm(`Generate DRAFT payroll run for ${currentMonth}? This will compute payslips for all active employees.`)) {
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.post('/payroll/runs/generate', { month: currentMonth });
      setSuccessMsg(res.data.message || 'Payroll generated in Draft status.');
      await fetchRunData(currentMonth);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to generate payroll.');
    } finally {
      setActionLoading(false);
    }
  };

  // Acknowledge Warnings
  const handleAcknowledgeWarnings = async () => {
    if (!runData?.id) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post(`/payroll/runs/${runData.id}/acknowledge-warnings`);
      setSuccessMsg('Payroll warnings acknowledged successfully.');
      await fetchRunData(currentMonth);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to acknowledge warnings.');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Payroll Run
  const handleApprovePayroll = async () => {
    if (!runData?.id) return;
    if (!window.confirm(`Approve payroll run for ${currentMonth}? This will finalize calculations, lock the month's attendance records, and notify all employees.`)) {
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/payroll/runs/${runData.id}/approve`);
      setSuccessMsg(res.data.message || 'Payroll run approved successfully.');
      await fetchRunData(currentMonth);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to approve payroll.');
    } finally {
      setActionLoading(false);
    }
  };

  // Lock Payroll Run
  const handleLockPayroll = async () => {
    if (!runData?.id) return;
    if (!window.confirm(`Permanently LOCK payroll run for ${currentMonth}? Once locked, payslips become completely immutable.`)) {
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/payroll/runs/${runData.id}/lock`);
      setSuccessMsg(res.data.message || 'Payroll run is now permanently LOCKED.');
      await fetchRunData(currentMonth);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to lock payroll.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Payslip Detail
  const handleViewPayslip = async (payslipId) => {
    setSelectedPayslip(payslipId);
    setModalLoading(true);
    try {
      const res = await api.get(`/payroll/payslips/${payslipId}`);
      setPayslipDetails(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load payslip details.');
      setSelectedPayslip(null);
    } finally {
      setModalLoading(false);
    }
  };

  // Download PDF
  const handleDownloadPDF = async (payslipId, empName) => {
    try {
      const response = await api.get(`/payroll/payslips/${payslipId}/pdf`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Payslip_${empName || 'Employee'}_${currentMonth}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF payslip.');
    }
  };

  // Open Salaries Modal
  const handleOpenSalaries = async () => {
    setShowSalaryModal(true);
    try {
      const res = await api.get('/payroll/salaries');
      setSalariesList(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Select Employee to edit salary
  const handleSelectEmployeeForSalary = async (emp) => {
    setSelectedEmployeeSalary(emp);
    setSalaryForm({
      basic_salary: emp.basic_salary || 0,
      allowances: emp.allowances || 0,
      fixed_deductions: emp.fixed_deductions || 0,
      effective_date: emp.effective_date ? emp.effective_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    });

    try {
      const res = await api.get(`/payroll/salaries/${emp.employee_id}`);
      setSalaryAuditHistory(res.data.history || []);
    } catch (err) {
      setSalaryAuditHistory([]);
    }
  };

  // Save Salary Structure
  const handleSaveSalary = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeSalary) return;
    try {
      await api.put(`/payroll/salaries/${selectedEmployeeSalary.employee_id}`, salaryForm);
      alert('Salary structure updated successfully.');
      const res = await api.get('/payroll/salaries');
      setSalariesList(res.data.data || []);
      const histRes = await api.get(`/payroll/salaries/${selectedEmployeeSalary.employee_id}`);
      setSalaryAuditHistory(histRes.data.history || []);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update salary.');
    }
  };

  // Open Settings Modal
  const handleOpenSettings = async () => {
    setShowSettingsModal(true);
    try {
      const res = await api.get('/payroll/settings');
      setSettingsForm(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put('/payroll/settings', settingsForm);
      alert('Payroll settings saved.');
      setShowSettingsModal(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save settings.');
    }
  };

  // Filtered payslips
  const filteredPayslips = payslips.filter(p => {
    const matchesSearch = !searchQuery || 
      p.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.employee_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.designation?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !departmentFilter || String(p.department_id) === String(departmentFilter);
    return matchesSearch && matchesDept;
  });

  // Calculate warnings across payslips
  const allWarnings = [];
  payslips.forEach(p => {
    if (p.warnings && Array.isArray(p.warnings)) {
      p.warnings.forEach(w => {
        allWarnings.push({
          employee_name: p.employee_name,
          ...w
        });
      });
    }
  });

  const isCreator = runData?.created_by === user?.id;

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div className="payroll-container">
          {/* Header */}
          <div className="payroll-header">
            <div>
              <h1 className="payroll-title">Payroll & Payslips</h1>
              <p className="payroll-subtitle">
                Monthly payroll processing, salary structures, attendance deductions, and PDF voucher disbursement.
              </p>
            </div>
            {isAdminOrHR && (
              <div className="payroll-header-actions">
                <button className="btn-secondary-ems" onClick={handleOpenSalaries}>
                  <DollarSign size={16} />
                  Salary Structures
                </button>
                <button className="btn-secondary-ems" onClick={handleOpenSettings}>
                  <Sliders size={16} />
                  Rules & Settings
                </button>
              </div>
            )}
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="payroll-warning-banner" style={{ background: '#fef2f2', borderColor: '#fee2e2', borderLeftColor: '#ef4444' }}>
              <div className="warning-title" style={{ color: '#991b1b' }}>
                <AlertTriangle size={18} />
                {errorMsg}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="payroll-warning-banner" style={{ background: '#ecfdf5', borderColor: '#d1fae5', borderLeftColor: '#10b981' }}>
              <div className="warning-title" style={{ color: '#065f46' }}>
                <CheckCircle2 size={18} />
                {successMsg}
              </div>
            </div>
          )}

          {/* Month Selector & Controls Card */}
          <div className="payroll-control-card">
            <div className="payroll-month-bar">
              <div className="payroll-month-selector">
                <label htmlFor="payroll-month-input">Payroll Month</label>
                <input
                  id="payroll-month-input"
                  type="month"
                  className="payroll-month-input"
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {runData ? (
                  <span className={`payroll-status-badge status-badge-${runData.status?.toLowerCase()}`}>
                    {runData.status === 'Locked' && <Lock size={14} />}
                    {runData.status === 'Approved' && <CheckCircle2 size={14} />}
                    {runData.status === 'Draft' && <Info size={14} />}
                    Status: {runData.status}
                  </span>
                ) : (
                  <span className="payroll-status-badge status-badge-none">
                    No Run Generated
                  </span>
                )}

                {/* Workflow Buttons */}
                {!runData && (
                  <button
                    className="btn-primary-ems"
                    onClick={handleGeneratePayroll}
                    disabled={actionLoading}
                  >
                    <DollarSign size={16} />
                    Generate {currentMonth} Payroll
                  </button>
                )}

                {runData?.status === 'Draft' && (
                  <>
                    {runData.warnings_count > 0 && !runData.warnings_acknowledged && (
                      <button
                        className="btn-warning-ems"
                        onClick={handleAcknowledgeWarnings}
                        disabled={actionLoading}
                        title="Review and acknowledge draft warnings before approval"
                      >
                        <Check size={16} />
                        Acknowledge Warnings ({runData.warnings_count})
                      </button>
                    )}

                    <button
                      className="btn-success-ems"
                      onClick={handleApprovePayroll}
                      disabled={
                        actionLoading ||
                        isCreator ||
                        (runData.warnings_count > 0 && !runData.warnings_acknowledged)
                      }
                      title={
                        isCreator
                          ? 'Separation of Duties: Creator cannot approve this run. Second approver required.'
                          : runData.warnings_count > 0 && !runData.warnings_acknowledged
                          ? 'Acknowledge all warnings before approving.'
                          : 'Approve run and lock attendance'
                      }
                    >
                      <CheckCircle2 size={16} />
                      Approve Payroll
                    </button>
                  </>
                )}

                {runData?.status === 'Approved' && (
                  <button
                    className="btn-primary-ems"
                    onClick={handleLockPayroll}
                    disabled={actionLoading}
                    style={{ background: '#065f46', borderColor: '#065f46' }}
                  >
                    <Lock size={16} />
                    Lock Period (Finalize)
                  </button>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="payroll-metrics-grid">
              <div className="payroll-metric-box">
                <span className="label">Working Days</span>
                <span className="value">{runData?.working_days || '--'} Days</span>
              </div>
              <div className="payroll-metric-box">
                <span className="label">Active Employees</span>
                <span className="value">{runData?.total_employees || '--'}</span>
              </div>
              <div className="payroll-metric-box">
                <span className="label">Total Gross</span>
                <span className="value gross">
                  PKR {runData ? Number(runData.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                </span>
              </div>
              <div className="payroll-metric-box">
                <span className="label">Total Deductions</span>
                <span className="value deductions">
                  - PKR {runData ? Number(runData.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                </span>
              </div>
              <div className="payroll-metric-box">
                <span className="label">Total Net Pay</span>
                <span className="value net">
                  PKR {runData ? Number(runData.total_net).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Warnings Banner if any */}
          {allWarnings.length > 0 && (
            <div className="payroll-warning-banner">
              <div className="warning-banner-top">
                <div className="warning-title">
                  <AlertTriangle size={18} />
                  <span>
                    Pre-Approval Warnings ({allWarnings.length}): Review before approving
                  </span>
                </div>
                {runData?.status === 'Draft' && (
                  <div>
                    {runData.warnings_acknowledged ? (
                      <span style={{ fontSize: '0.8rem', color: '#065f46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} /> Warnings Acknowledged by {runData.warnings_acknowledged_by_name || 'HR'}
                      </span>
                    ) : (
                      <button className="btn-warning-ems" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={handleAcknowledgeWarnings}>
                        Acknowledge Warnings
                      </button>
                    )}
                  </div>
                )}
              </div>
              <ul className="warning-list">
                {allWarnings.map((w, idx) => (
                  <li key={idx}>
                    <span className="warning-bullet">•</span>
                    <strong>{w.employee_name}:</strong> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Payslips Table Card */}
          <div className="payroll-table-card">
            <div className="payroll-table-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="payroll-search-input"
                    placeholder="Search employee, email, designation..."
                    style={{ paddingLeft: '32px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="payroll-search-input"
                  style={{ width: '180px' }}
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{filteredPayslips.length}</strong> payslips
              </div>
            </div>

            <div className="payroll-table-container">
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="numeric-cell">Basic Salary</th>
                    <th className="numeric-cell">Payable Days</th>
                    <th className="numeric-cell">Overtime</th>
                    <th className="numeric-cell">Deductions</th>
                    <th className="numeric-cell">Net Pay (PKR)</th>
                    <th>Warnings</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
                        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>Loading payroll records...</p>
                      </td>
                    </tr>
                  ) : filteredPayslips.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        {runData ? 'No employee payslips matched your filter.' : `No payroll run generated for ${currentMonth}. Click "Generate Payroll" above to create draft.`}
                      </td>
                    </tr>
                  ) : (
                    filteredPayslips.map((ps) => {
                      const hasWarnings = ps.warnings && ps.warnings.length > 0;
                      const isNegative = Number(ps.net_pay) <= 0;

                      return (
                        <tr key={ps.id}>
                          <td>
                            <div className="employee-cell">
                              <span className="employee-name">{ps.employee_name}</span>
                              <span className="employee-meta">{ps.designation} • {ps.department_name || 'General'}</span>
                            </div>
                          </td>
                          <td className="numeric-cell">
                            PKR {Number(ps.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="numeric-cell">
                            {ps.payable_days} / {ps.working_days_in_month}
                            {ps.payable_days < ps.working_days_in_month && (
                              <span style={{ display: 'block', fontSize: '0.725rem', color: '#b45309' }}>
                                (Prorated)
                              </span>
                            )}
                          </td>
                          <td className="numeric-cell">
                            {Number(ps.overtime_hours) > 0 ? (
                              <>
                                <span style={{ color: '#15803d', fontWeight: 600 }}>
                                  +PKR {Number(ps.overtime_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                                  {ps.overtime_hours} hrs @ 1.5x
                                </span>
                              </>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>--</span>
                            )}
                          </td>
                          <td className="numeric-cell">
                            <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                              -PKR {Number(ps.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                              {ps.absent_days} abs • {ps.unpaid_leave_days} unp • {ps.late_arrivals_count} lates
                            </span>
                          </td>
                          <td className={`numeric-cell net-pay-cell ${isNegative ? 'negative' : ''}`}>
                            PKR {Number(ps.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            {hasWarnings ? (
                              <span
                                className="warning-icon-pill"
                                title={ps.warnings.map(w => w.message).join(' | ')}
                              >
                                <AlertTriangle size={12} />
                                {ps.warnings.length} alert{ps.warnings.length > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}>
                                <CheckCircle2 size={12} /> Clean
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="btn-secondary-ems"
                                style={{ padding: '5px 10px', fontSize: '0.775rem' }}
                                onClick={() => handleViewPayslip(ps.id)}
                                title="View detailed line-by-line breakdown"
                              >
                                <Eye size={13} />
                                View
                              </button>
                              <button
                                className="btn-secondary-ems"
                                style={{ padding: '5px 8px', fontSize: '0.775rem' }}
                                onClick={() => handleDownloadPDF(ps.id, ps.employee_name)}
                                title="Download PDF voucher"
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal: Payslip Breakdown & Links */}
          {selectedPayslip && (
            <div className="modal-overlay" onClick={() => setSelectedPayslip(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h3 className="modal-title">
                      Payslip Breakdown — {payslipDetails?.payslip?.employee_name || 'Employee'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Period: {payslipDetails?.payslip?.month} • Status: {payslipDetails?.payslip?.status}
                    </p>
                  </div>
                  <button
                    className="btn-secondary-ems"
                    style={{ padding: '4px', border: 'none' }}
                    onClick={() => setSelectedPayslip(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="modal-body">
                  {modalLoading ? (
                    <div style={{ textAlign: 'center', padding: '30px' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto' }} />
                    </div>
                  ) : payslipDetails ? (
                    <>
                      {/* Rates Overview */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Basic Salary</span>
                          <span className="font-numeric" style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.basic_salary).toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Daily Rate</span>
                          <span className="font-numeric" style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.daily_rate).toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Hourly Rate</span>
                          <span className="font-numeric" style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.hourly_rate).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Line Items Table */}
                      <div>
                        <div className="breakdown-section-title">
                          <span>Line Items & Calculations</span>
                          <span style={{ fontSize: '0.75rem', textTransform: 'none', color: 'var(--text-muted)' }}>
                            Links directly to attendance & leaves
                          </span>
                        </div>

                        <table className="breakdown-table">
                          <thead>
                            <tr>
                              <th>Description / Reason</th>
                              <th>Rate & Qty</th>
                              <th>Linked Records</th>
                              <th style={{ textAlign: 'right' }}>Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payslipDetails.items?.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  <strong>{item.description}</strong>
                                </td>
                                <td>
                                  {item.rate && item.quantity ? (
                                    <span className="rate-badge">
                                      {item.quantity} @ PKR {Number(item.rate).toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="rate-badge">--</span>
                                  )}
                                </td>
                                <td>
                                  {item.related_entity_type ? (
                                    <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                                      {item.related_entity_type} {item.related_entity_ids?.length ? `(${item.related_entity_ids.length} records)` : ''}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>--</span>
                                  )}
                                </td>
                                <td className={item.category === 'DEDUCTION' ? 'amount-negative' : 'amount-positive'}>
                                  {item.category === 'DEDUCTION' ? '-' : '+'} PKR {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Net Pay Box */}
                      <div className="payslip-summary-box">
                        <div>
                          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                            Gross Earnings: <strong>PKR {Number(payslipDetails.payslip.gross_pay).toLocaleString()}</strong>
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#b91c1c' }}>
                            Total Deductions: <strong>-PKR {Number(payslipDetails.payslip.total_deductions).toLocaleString()}</strong>
                          </div>
                          {Number(payslipDetails.payslip.adjustments_amount) !== 0 && (
                            <div style={{ fontSize: '0.825rem', color: '#0369a1' }}>
                              Net Adjustments: <strong>PKR {Number(payslipDetails.payslip.adjustments_amount).toLocaleString()}</strong>
                            </div>
                          )}
                        </div>

                        <div className="payslip-summary-net">
                          <span className="label">Net Pay</span>
                          <span className="amount">
                            PKR {Number(payslipDetails.payslip.net_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="modal-footer">
                  <button
                    className="btn-primary-ems"
                    onClick={() => handleDownloadPDF(payslipDetails?.payslip?.id, payslipDetails?.payslip?.employee_name)}
                  >
                    <Download size={16} />
                    Download PDF Payslip
                  </button>
                  <button className="btn-secondary-ems" onClick={() => setSelectedPayslip(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Salary Structure Management */}
          {showSalaryModal && (
            <div className="modal-overlay" onClick={() => setShowSalaryModal(false)}>
              <div className="modal-content" style={{ maxWidth: '850px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">Employee Salary Structures</h3>
                  <button className="btn-secondary-ems" style={{ padding: '4px', border: 'none' }} onClick={() => setShowSalaryModal(false)}>
                    <X size={18} />
                  </button>
                </div>

                <div className="modal-body" style={{ maxHeight: '70vh' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Left: Employee List */}
                    <div style={{ borderRight: '1px solid var(--border-color)', paddingRight: '15px' }}>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-secondary)' }}>
                        Select Active Employee
                      </h4>
                      <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {salariesList.map(s => (
                          <div
                            key={s.employee_id}
                            onClick={() => handleSelectEmployeeForSalary(s)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: selectedEmployeeSalary?.employee_id === s.employee_id ? '#e2e8f0' : '#f8fafc',
                              border: '1px solid var(--border-color)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.employee_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.designation}</div>
                            </div>
                            <span className="font-numeric" style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                              PKR {Number(s.basic_salary).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Edit Form & History */}
                    <div>
                      {selectedEmployeeSalary ? (
                        <form onSubmit={handleSaveSalary}>
                          <h4 style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                            Edit Salary: <strong>{selectedEmployeeSalary.employee_name}</strong>
                          </h4>

                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                              Basic Salary (PKR) *
                            </label>
                            <input
                              type="number"
                              className="payroll-search-input"
                              style={{ width: '100%' }}
                              value={salaryForm.basic_salary}
                              onChange={(e) => setSalaryForm({ ...salaryForm, basic_salary: e.target.value })}
                              required
                            />
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                              Fixed Allowances (PKR)
                            </label>
                            <input
                              type="number"
                              className="payroll-search-input"
                              style={{ width: '100%' }}
                              value={salaryForm.allowances}
                              onChange={(e) => setSalaryForm({ ...salaryForm, allowances: e.target.value })}
                            />
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                              Fixed Deductions (PKR)
                            </label>
                            <input
                              type="number"
                              className="payroll-search-input"
                              style={{ width: '100%' }}
                              value={salaryForm.fixed_deductions}
                              onChange={(e) => setSalaryForm({ ...salaryForm, fixed_deductions: e.target.value })}
                            />
                          </div>

                          <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                              Effective Date *
                            </label>
                            <input
                              type="date"
                              className="payroll-search-input"
                              style={{ width: '100%' }}
                              value={salaryForm.effective_date}
                              onChange={(e) => setSalaryForm({ ...salaryForm, effective_date: e.target.value })}
                              required
                            />
                          </div>

                          <button type="submit" className="btn-primary-ems" style={{ width: '100%', justifyContent: 'center' }}>
                            Save & Record Audit History
                          </button>

                          {/* Audit History */}
                          <div style={{ marginTop: 20 }}>
                            <h5 style={{ fontSize: '0.775rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
                              Salary Change History (Audit Log)
                            </h5>
                            <div style={{ maxHeight: '130px', overflowY: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {salaryAuditHistory.length === 0 ? (
                                <p>No previous changes recorded.</p>
                              ) : (
                                salaryAuditHistory.map(h => (
                                  <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <div><strong>{h.user_name}</strong> on {new Date(h.created_at).toLocaleDateString()}</div>
                                    <div style={{ color: '#0f172a' }}>{h.details}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </form>
                      ) : (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>
                          Select an employee from the list to view or edit their salary structure.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn-secondary-ems" onClick={() => setShowSalaryModal(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Payroll Settings */}
          {showSettingsModal && (
            <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
              <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">Configurable Payroll Rules</h3>
                  <button className="btn-secondary-ems" style={{ padding: '4px', border: 'none' }} onClick={() => setShowSettingsModal(false)}>
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveSettings}>
                  <div className="modal-body">
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Late Arrival Deduction Threshold (e.g. 3 lates = 1 day)
                      </label>
                      <input
                        type="number"
                        className="payroll-search-input"
                        style={{ width: '100%' }}
                        value={settingsForm.late_arrival_threshold}
                        onChange={(e) => setSettingsForm({ ...settingsForm, late_arrival_threshold: e.target.value })}
                        required
                        min="1"
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Overtime Rate Multiplier (e.g. 1.5x)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        className="payroll-search-input"
                        style={{ width: '100%' }}
                        value={settingsForm.overtime_multiplier}
                        onChange={(e) => setSettingsForm({ ...settingsForm, overtime_multiplier: e.target.value })}
                        required
                        min="1"
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Standard Work Hours Per Day (e.g. 8.0)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        className="payroll-search-input"
                        style={{ width: '100%' }}
                        value={settingsForm.standard_daily_hours}
                        onChange={(e) => setSettingsForm({ ...settingsForm, standard_daily_hours: e.target.value })}
                        required
                        min="4"
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Base Currency
                      </label>
                      <input
                        type="text"
                        className="payroll-search-input"
                        style={{ width: '100%', background: '#f1f5f9' }}
                        value="PKR"
                        disabled
                      />
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button type="submit" className="btn-primary-ems">
                      Save Settings
                    </button>
                    <button type="button" className="btn-secondary-ems" onClick={() => setShowSettingsModal(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
