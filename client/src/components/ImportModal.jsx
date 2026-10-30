import React, { useState, useRef } from 'react';
import api from '../services/api';
import { 
  Upload, 
  X, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Download, 
  ArrowRight, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import './ImportModal.css';

const ImportModal = ({ isOpen, onClose, onImportSuccess }) => {
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('errors'); // 'errors' or 'valid'
  const [generalError, setGeneralError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/employees/import/template', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'employee_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setGeneralError('Failed to download template. Please try again.');
    }
  };

  const processFile = async (selectedFile) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setGeneralError('Please upload a valid CSV (.csv) file.');
      return;
    }

    setFile(selectedFile);
    setGeneralError('');
    setValidating(true);
    setValidationResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/employees/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setValidationResult(res.data);
      // If there are errors, default to errors tab so user reviews them first
      if (res.data.invalidCount > 0) {
        setActiveTab('errors');
      } else {
        setActiveTab('valid');
      }
    } catch (err) {
      setGeneralError(err.response?.data?.message || 'Failed to validate CSV file. Check column format.');
    } finally {
      setValidating(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleReset = () => {
    setFile(null);
    setValidationResult(null);
    setGeneralError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExecuteImport = async () => {
    if (!validationResult || validationResult.validCount === 0) return;

    try {
      setImporting(true);
      setGeneralError('');
      const res = await api.post('/employees/import/execute', {
        records: validationResult.validRecords
      });
      onImportSuccess(res.data.message || `Successfully imported ${res.data.insertedCount} records!`);
      handleReset();
      onClose();
    } catch (err) {
      setGeneralError(err.response?.data?.message || 'Failed to import employee records.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="import-modal-overlay" onClick={onClose}>
      <div 
        className="import-modal-dialog card" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="import-modal-title"
      >
        {/* Modal Header */}
        <div className="import-modal-header">
          <div>
            <h2 id="import-modal-title" className="import-modal-title">
              Import Employees via CSV
            </h2>
            <p className="import-modal-subtitle">
              Bulk upload employee records, validate constraints, and import to MySQL directory.
            </p>
          </div>

          <div className="import-header-controls">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn btn-secondary btn-sm"
              title="Download formatted sample template"
            >
              <Download size={14} />
              <span>Sample Template</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="import-modal-close-btn"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {generalError && (
          <div className="import-alert-error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{generalError}</span>
          </div>
        )}

        {/* Modal Content */}
        <div className="import-modal-body">
          {!validationResult && !validating && (
            <div 
              className={`import-dropzone ${isDragOver ? 'drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <div className="import-dropzone-icon">
                <Upload size={28} />
              </div>

              <div className="import-dropzone-text">
                <span className="dropzone-primary-text">Click to browse or drag & drop CSV file</span>
                <span className="dropzone-secondary-text">Comma-separated values (.csv) up to 5MB</span>
              </div>

              <div className="import-columns-hint">
                <span className="hint-label">Expected Columns:</span>
                <span className="hint-pill">Name</span>
                <span className="hint-pill">Email</span>
                <span className="hint-pill">Phone</span>
                <span className="hint-pill">Department</span>
                <span className="hint-pill">Designation</span>
                <span className="hint-pill optional">Status</span>
              </div>
            </div>
          )}

          {validating && (
            <div className="import-loading-state">
              <RefreshCw size={24} className="spin-icon" />
              <span>Validating CSV rows against database constraints...</span>
            </div>
          )}

          {validationResult && (
            <div className="import-results-container">
              {/* Metric summary bar */}
              <div className="import-summary-bar">
                <div className="summary-card total">
                  <span className="summary-label">Total Rows</span>
                  <span className="summary-value">{validationResult.totalRows}</span>
                </div>

                <div className="summary-card valid">
                  <span className="summary-label">Ready to Import</span>
                  <span className="summary-value text-success">{validationResult.validCount}</span>
                </div>

                <div className="summary-card invalid">
                  <span className="summary-label">Invalid Rows</span>
                  <span className="summary-value text-danger">{validationResult.invalidCount}</span>
                </div>
              </div>

              {/* Status Notice */}
              {validationResult.invalidCount > 0 ? (
                <div className="import-alert-warning">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>{validationResult.invalidCount} row(s)</strong> have validation errors. 
                    You can review specific row issues below and proceed with importing only the valid records.
                  </div>
                </div>
              ) : (
                <div className="import-alert-success">
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <div>
                    All <strong>{validationResult.validCount} row(s)</strong> passed validation and are ready to import!
                  </div>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="import-tab-nav">
                <button
                  type="button"
                  className={`import-tab-btn ${activeTab === 'valid' ? 'active' : ''}`}
                  onClick={() => setActiveTab('valid')}
                >
                  <CheckCircle2 size={14} color="#10b981" />
                  <span>Valid Records ({validationResult.validCount})</span>
                </button>

                {validationResult.invalidCount > 0 && (
                  <button
                    type="button"
                    className={`import-tab-btn ${activeTab === 'errors' ? 'active' : ''}`}
                    onClick={() => setActiveTab('errors')}
                  >
                    <AlertTriangle size={14} color="#f59e0b" />
                    <span>Errors to Review ({validationResult.invalidCount})</span>
                  </button>
                )}
              </div>

              {/* Tab Content: Errors Table */}
              {activeTab === 'errors' && validationResult.invalidCount > 0 && (
                <div className="import-table-wrapper">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>Row #</th>
                        <th>Employee</th>
                        <th>Email / Details</th>
                        <th>Validation Reason(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.invalidRecords.map((item, idx) => (
                        <tr key={idx} className="error-row">
                          <td>
                            <span className="badge badge-inactive">Row {item.row}</span>
                          </td>
                          <td>
                            <div className="table-emp-name">{item.name}</div>
                            <div className="table-emp-sub">{item.designation || 'No title'}</div>
                          </td>
                          <td>
                            <div className="table-emp-email">{item.email}</div>
                            <div className="table-emp-sub">Dept: {item.department || 'None'}</div>
                          </td>
                          <td>
                            <div className="error-reasons-list">
                              {item.reasons.map((r, rIdx) => (
                                <span key={rIdx} className="error-reason-pill">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab Content: Valid Records Preview Table */}
              {activeTab === 'valid' && (
                <div className="import-table-wrapper">
                  {validationResult.validCount === 0 ? (
                    <div className="import-empty-valid">
                      No valid records found in this file. Please fix the errors above and re-upload.
                    </div>
                  ) : (
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>Row #</th>
                          <th>Full Name</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Department</th>
                          <th>Designation</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.validRecords.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="badge badge-inactive">#{item.row}</span>
                            </td>
                            <td className="font-semibold">{item.name}</td>
                            <td>{item.email}</td>
                            <td>{item.phone}</td>
                            <td>
                              <span className="badge badge-inactive">{item.department_name}</span>
                            </td>
                            <td>{item.designation}</td>
                            <td>
                              <span className={`badge-status ${item.status === 'Active' ? 'badge-status-active' : 'badge-status-inactive'}`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="import-modal-footer">
          <div className="footer-left">
            {validationResult && (
              <button
                type="button"
                onClick={handleReset}
                disabled={importing}
                className="btn btn-secondary"
              >
                Choose Another File
              </button>
            )}
          </div>

          <div className="footer-right">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="btn btn-secondary"
            >
              Cancel
            </button>

            {validationResult && validationResult.validCount > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing}
                className="btn btn-primary"
              >
                {importing ? (
                  <>
                    <RefreshCw size={14} className="spin-icon" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight size={14} />
                    <span>Import {validationResult.validCount} Valid Record{validationResult.validCount === 1 ? '' : 's'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
