import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  FileText,
  Download,
  Eye,
  CheckCircle2,
  Lock,
  Calendar,
  X,
  RefreshCw,
  Clock,
  ShieldCheck
} from 'lucide-react';
import './MyPayslips.css';
import './Payroll.css';

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslipId, setSelectedPayslipId] = useState(null);
  const [payslipDetails, setPayslipDetails] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    fetchMyPayslips();
  }, []);

  const fetchMyPayslips = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payroll/my-payslips');
      setPayslips(res.data || []);
    } catch (err) {
      console.error('Failed to load payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewBreakdown = async (id) => {
    setSelectedPayslipId(id);
    setModalLoading(true);
    try {
      const res = await api.get(`/payroll/payslips/${id}`);
      setPayslipDetails(res.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load payslip details.');
      setSelectedPayslipId(null);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDownloadPDF = async (id, month) => {
    try {
      const response = await api.get(`/payroll/payslips/${id}/pdf`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `My_Payslip_${month}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF payslip.');
    }
  };

  const formatMonthTitle = (yearMonth) => {
    if (!yearMonth) return '';
    const [y, m] = yearMonth.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div className="mypayslips-container">
          <div className="mypayslips-header">
            <h1 className="mypayslips-title">My Payslips</h1>
            <p className="mypayslips-subtitle">
              View your monthly salary breakdown, attendance deductions, overtime earnings, and official PDF vouchers.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
              <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading your payslips...</p>
            </div>
          ) : payslips.length === 0 ? (
            <div className="empty-payslips-card">
              <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3>No Released Payslips Yet</h3>
              <p style={{ maxWidth: '420px', margin: '8px auto 0' }}>
                Your monthly payslips will appear here once they are officially approved and released by Human Resources.
              </p>
            </div>
          ) : (
            <div className="mypayslips-grid">
              {payslips.map((p) => (
                <div key={p.id} className="payslip-card">
                  <div>
                    <div className="payslip-card-header">
                      <div>
                        <div className="payslip-month">{formatMonthTitle(p.month)}</div>
                        <span className="payslip-period-label">{p.month} Period</span>
                      </div>
                      <span className={`payroll-status-badge status-badge-${p.status.toLowerCase()}`}>
                        {p.status === 'Locked' ? <Lock size={12} /> : <CheckCircle2 size={12} />}
                        {p.status}
                      </span>
                    </div>

                    <div className="payslip-card-body">
                      <div className="payslip-row">
                        <span className="label">Basic Salary</span>
                        <span className="value">PKR {Number(p.basic_salary).toLocaleString()}</span>
                      </div>
                      <div className="payslip-row">
                        <span className="label">Payable Days</span>
                        <span className="value">{p.payable_days} / {p.working_days_in_month} Days</span>
                      </div>
                      <div className="payslip-row">
                        <span className="label">Gross Earnings</span>
                        <span className="value" style={{ color: '#15803d' }}>
                          PKR {Number(p.gross_pay).toLocaleString()}
                        </span>
                      </div>
                      <div className="payslip-row">
                        <span className="label">Total Deductions</span>
                        <span className="value" style={{ color: '#b91c1c' }}>
                          -PKR {Number(p.total_deductions).toLocaleString()}
                        </span>
                      </div>
                      {Number(p.adjustments_amount) !== 0 && (
                        <div className="payslip-row">
                          <span className="label">Adjustments</span>
                          <span className="value" style={{ color: '#0369a1' }}>
                            PKR {Number(p.adjustments_amount).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="payslip-row net-row">
                        <span className="label">Net Pay</span>
                        <span className="value">PKR {Number(p.net_pay).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="payslip-card-footer">
                    <button
                      className="btn-secondary-ems"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => handleViewBreakdown(p.id)}
                    >
                      <Eye size={15} />
                      View Breakdown
                    </button>
                    <button
                      className="btn-primary-ems"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => handleDownloadPDF(p.id, p.month)}
                    >
                      <Download size={15} />
                      PDF Voucher
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Breakdown Modal */}
          {selectedPayslipId && (
            <div className="modal-overlay" onClick={() => setSelectedPayslipId(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h3 className="modal-title">
                      Payslip Breakdown — {formatMonthTitle(payslipDetails?.payslip?.month)}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Voucher Reference: PS-{payslipDetails?.payslip?.id} • Currency: PKR
                    </p>
                  </div>
                  <button
                    className="btn-secondary-ems"
                    style={{ padding: '4px', border: 'none' }}
                    onClick={() => setSelectedPayslipId(null)}
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
                          <span style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.basic_salary).toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Daily Rate</span>
                          <span style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.daily_rate).toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Hourly Rate</span>
                          <span style={{ fontWeight: 700 }}>PKR {Number(payslipDetails.payslip.hourly_rate).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        <div className="breakdown-section-title">
                          <span>Earnings & Deductions Itemization</span>
                        </div>
                        <table className="breakdown-table">
                          <thead>
                            <tr>
                              <th>Description / Reason</th>
                              <th>Rate & Qty</th>
                              <th>Type</th>
                              <th style={{ textAlign: 'right' }}>Amount (PKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payslipDetails.items?.map((item) => (
                              <tr key={item.id}>
                                <td><strong>{item.description}</strong></td>
                                <td>
                                  {item.rate && item.quantity ? (
                                    <span className="rate-badge">{item.quantity} @ {Number(item.rate).toFixed(2)}</span>
                                  ) : '--'}
                                </td>
                                <td>
                                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                    {item.category}
                                  </span>
                                </td>
                                <td className={item.category === 'DEDUCTION' ? 'amount-negative' : 'amount-positive'}>
                                  {item.category === 'DEDUCTION' ? '-' : '+'} PKR {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary */}
                      <div className="payslip-summary-box">
                        <div>
                          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                            Gross: <strong>PKR {Number(payslipDetails.payslip.gross_pay).toLocaleString()}</strong>
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#b91c1c' }}>
                            Deductions: <strong>-PKR {Number(payslipDetails.payslip.total_deductions).toLocaleString()}</strong>
                          </div>
                        </div>

                        <div className="payslip-summary-net">
                          <span className="label">Total Net Salary</span>
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
                    onClick={() => handleDownloadPDF(payslipDetails?.payslip?.id, payslipDetails?.payslip?.month)}
                  >
                    <Download size={16} />
                    Download Official PDF
                  </button>
                  <button className="btn-secondary-ems" onClick={() => setSelectedPayslipId(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
