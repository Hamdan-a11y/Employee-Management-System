import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Camera,
  Trash2,
  FileText,
  Upload,
  Download,
  ArrowLeft,
  Edit3,
  Check,
  X,
  AlertCircle,
  FileSpreadsheet,
  FileCheck,
  ShieldCheck,
  ExternalLink,
  RotateCcw,
  Archive
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import './EmployeeProfile.css';

const SERVER_BASE_URL = 'http://localhost:5000';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];
const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export default function EmployeeProfile() {
  const { success: notifySuccess, error: notifyError } = useNotification();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isEmployee } = useAuth();
  const effectiveId = id === 'me' ? (user?.employee_id || 'me') : id;

  // Employee data state
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Contact editing state
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ email: '', phone: '' });
  const [contactError, setContactError] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');
  const [contactSaving, setContactSaving] = useState(false);

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');
  const avatarInputRef = useRef(null);

  // Documents state
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docUploadModalOpen, setDocUploadModalOpen] = useState(false);
  const [docForm, setDocForm] = useState({ title: '', file: null });
  const [docUploadError, setDocUploadError] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState(null);
  const [deleteDocLoading, setDeleteDocLoading] = useState(false);

  // Fetch employee details
  const fetchEmployee = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await api.get(`/employees/${effectiveId}`);
      setEmployee(res.data);
      setContactForm({
        email: res.data.email || '',
        phone: res.data.phone || ''
      });
    } catch (err) {
      setPageError(err.response?.data?.message || 'Failed to load employee details.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreFromProfile = async () => {
    try {
      const res = await api.patch(`/employees/${effectiveId}/restore`);
      setEmployee((prev) => ({ ...prev, deleted_at: null }));
      notifySuccess(res.data.message || 'Employee restored successfully!');
    } catch (err) {
      notifyError(err.response?.data?.message || 'Failed to restore employee.');
    }
  };

  // Fetch employee documents
  const fetchDocuments = async () => {
    try {
      setLoadingDocs(true);
      const res = await api.get(`/employees/${effectiveId}/documents`);
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (effectiveId) {
      fetchEmployee();
      fetchDocuments();
    }
  }, [effectiveId]);

  // Handle avatar selection and upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    setAvatarSuccess('');

    // Frontend validation
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setAvatarError('Only JPEG, PNG, or WEBP image formats are allowed.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setAvatarError(`Image is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      setAvatarUploading(true);
      const res = await api.post(`/employees/${effectiveId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setEmployee((prev) => ({ ...prev, avatar_url: res.data.avatar_url }));
      const msg = 'Profile picture updated!';
      setAvatarSuccess(msg);
      notifySuccess(msg);
      setTimeout(() => setAvatarSuccess(''), 4000);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload profile picture.';
      setAvatarError(msg);
      notifyError(msg);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // Handle avatar removal
  const handleRemoveAvatar = async () => {
    if (!window.confirm('Are you sure you want to remove this profile picture?')) return;

    try {
      setAvatarUploading(true);
      setAvatarError('');
      await api.delete(`/employees/${effectiveId}/avatar`);
      setEmployee((prev) => ({ ...prev, avatar_url: null }));
      const msg = 'Profile picture removed.';
      setAvatarSuccess(msg);
      notifySuccess(msg);
      setTimeout(() => setAvatarSuccess(''), 4000);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove profile picture.';
      setAvatarError(msg);
      notifyError(msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Handle Contact Update
  const handleSaveContact = async (e) => {
    e.preventDefault();
    setContactError('');
    setContactSuccess('');

    const emailTrimmed = contactForm.email.trim();
    const phoneTrimmed = contactForm.phone.trim();

    if (!emailTrimmed) {
      setContactError('Email address is required.');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailTrimmed)) {
      setContactError('Please enter a valid email address.');
      return;
    }

    if (!phoneTrimmed) {
      setContactError('Phone number is required.');
      return;
    }

    if (phoneTrimmed.length > 20) {
      setContactError('Phone number cannot exceed 20 characters.');
      return;
    }

    try {
      setContactSaving(true);
      const res = await api.patch(`/employees/${effectiveId}/contact`, {
        email: emailTrimmed,
        phone: phoneTrimmed
      });
      setEmployee((prev) => ({
        ...prev,
        email: res.data.email,
        phone: res.data.phone
      }));
      setIsEditingContact(false);
      const msg = 'Contact details updated successfully!';
      setContactSuccess(msg);
      notifySuccess(msg);
      setTimeout(() => setContactSuccess(''), 4000);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update contact details.';
      setContactError(msg);
      notifyError(msg);
    } finally {
      setContactSaving(false);
    }
  };

  // Handle Document Upload
  const handleDocumentFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocUploadError('');

    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      setDocUploadError('Allowed formats: PDF, Word (DOC/DOCX), Images (JPEG/PNG/WEBP), or Text (TXT).');
      return;
    }

    if (file.size > MAX_DOC_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setDocUploadError(`Document is too large (${sizeMb} MB). Maximum size is 5 MB.`);
      return;
    }

    setDocForm((prev) => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, '')
    }));
  };

  const handleUploadDocumentSubmit = async (e) => {
    e.preventDefault();
    if (!docForm.file) {
      setDocUploadError('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('document', docForm.file);
    if (docForm.title.trim()) {
      formData.append('title', docForm.title.trim());
    }

    try {
      setDocUploading(true);
      setDocUploadError('');
      const res = await api.post(`/employees/${effectiveId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocuments((prev) => [res.data.document, ...prev]);
      setDocUploadModalOpen(false);
      setDocForm({ title: '', file: null });
      notifySuccess(`Document "${res.data.document.title || res.data.document.file_name}" uploaded successfully!`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload document.';
      setDocUploadError(msg);
      notifyError(msg);
    } finally {
      setDocUploading(false);
    }
  };

  // Handle Document Delete
  const handleConfirmDeleteDoc = async () => {
    if (!deleteDocTarget) return;

    try {
      setDeleteDocLoading(true);
      await api.delete(`/employees/${effectiveId}/documents/${deleteDocTarget.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteDocTarget.id));
      notifySuccess(`Document "${deleteDocTarget.title || deleteDocTarget.file_name}" deleted successfully.`);
      setDeleteDocTarget(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete document.';
      notifyError(msg);
    } finally {
      setDeleteDocLoading(false);
    }
  };

  // Handle Document Download
  const handleDownloadDoc = async (doc) => {
    try {
      const res = await api.get(`/employees/${effectiveId}/documents/${doc.id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name || 'document');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notifyError('Failed to download document. Please try again.');
    }
  };

  // Format bytes helper
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Document icon helper
  const getDocIcon = (type) => {
    if (type?.includes('pdf')) return <FileText className="doc-type-icon doc-icon-pdf" size={20} />;
    if (type?.includes('image')) return <Camera className="doc-type-icon doc-icon-img" size={20} />;
    if (type?.includes('word') || type?.includes('officedocument'))
      return <FileCheck className="doc-type-icon doc-icon-doc" size={20} />;
    return <FileSpreadsheet className="doc-type-icon doc-icon-txt" size={20} />;
  };

  // Avatar image URL builder
  const getAvatarSrc = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${SERVER_BASE_URL}${url}`;
  };

  if (loading) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="profile-main">
          <div className="profile-container">
            <div className="profile-loading-state">
              <div className="profile-spinner"></div>
              <p>Loading employee profile...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pageError || !employee) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="profile-main">
          <div className="profile-container">
            <div className="profile-error-banner">
              <AlertCircle size={22} />
              <div>
                <h3>Access Restricted</h3>
                <p>{pageError || 'Employee record could not be found or you do not have permission to access it.'}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {isEmployee && user?.employee_id && String(user.employee_id) !== String(id) && (
                  <Link to={`/employees/${user.employee_id}`} className="btn btn-primary">
                    Go to My Profile
                  </Link>
                )}
                {isAdmin ? (
                  <Link to="/employees" className="btn btn-secondary">
                    Back to Directory
                  </Link>
                ) : (
                  <Link to="/dashboard" className="btn btn-secondary">
                    Back to Dashboard
                  </Link>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const initials = employee.name
    ? employee.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'EM';

  return (
    <div className="app-container">
      <Sidebar />
      <main className="profile-main">
        <div className="profile-container">
      {/* Top Navigation Bar */}
      <div className="profile-top-bar">
        {isAdmin ? (
          <button
            onClick={() => navigate('/employees')}
            className="btn btn-secondary profile-back-btn"
          >
            <ArrowLeft size={16} />
            <span>Back to Directory</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary profile-back-btn"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        )}

        {isAdmin && (
          <div className="profile-top-actions">
            <Link
              to={`/employees/edit/${employee.id}`}
              className="btn btn-secondary"
            >
              <Edit3 size={15} />
              <span>Edit Information</span>
            </Link>
          </div>
        )}
      </div>

      {/* Archival Alert Banner for Soft-Deleted Record */}
      {employee.deleted_at && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b' }}>
            <Archive size={20} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.9375rem' }}>Archived Employee Record</strong>
              <span style={{ fontSize: '0.8125rem', color: '#7f1d1d' }}>
                This personnel record was soft-deleted on {new Date(employee.deleted_at).toLocaleString()}. All documents and history remain preserved.
              </span>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleRestoreFromProfile}
              className="btn btn-primary"
              style={{ backgroundColor: '#0d9488', borderColor: '#0d9488' }}
            >
              <RotateCcw size={15} />
              <span>Restore Employee</span>
            </button>
          )}
        </div>
      )}

      {/* Main Profile Header Card */}
      <div className="profile-header-card">
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper">
            {employee.avatar_url ? (
              <img
                src={getAvatarSrc(employee.avatar_url)}
                alt={employee.name}
                className="profile-avatar-image"
              />
            ) : (
              <div className="profile-avatar-fallback">
                <span>{initials}</span>
              </div>
            )}

            {/* Hidden native file input */}
            <input
              type="file"
              ref={avatarInputRef}
              onChange={handleAvatarChange}
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              disabled={avatarUploading}
            />

            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="profile-avatar-upload-trigger"
              title="Upload new profile picture"
              disabled={avatarUploading}
            >
              <Camera size={16} />
            </button>
          </div>

          <div className="profile-avatar-controls">
            <button
              type="button"
              className="profile-link-btn"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
            >
              {avatarUploading ? 'Uploading...' : employee.avatar_url ? 'Change Photo' : 'Upload Photo'}
            </button>
            {employee.avatar_url && (
              <>
                <span className="profile-dot-sep">•</span>
                <button
                  type="button"
                  className="profile-link-btn text-danger"
                  onClick={handleRemoveAvatar}
                  disabled={avatarUploading}
                >
                  Remove
                </button>
              </>
            )}
          </div>

          {avatarError && <div className="profile-inline-error">{avatarError}</div>}
          {avatarSuccess && <div className="profile-inline-success">{avatarSuccess}</div>}
        </div>

        <div className="profile-header-info">
          <div className="profile-header-name-row">
            <h1 className="profile-employee-name">{employee.name}</h1>
            <span
              className={`badge-status ${
                employee.status === 'Active' ? 'badge-status-active' : 'badge-status-inactive'
              }`}
            >
              {employee.status}
            </span>
          </div>

          <p className="profile-employee-title">
            <Briefcase size={16} />
            <span>{employee.designation}</span>
            <span className="profile-dot-sep">•</span>
            <Building2 size={16} />
            <span>{employee.department_name || 'Unassigned'}</span>
          </p>

          <div className="profile-meta-chips">
            <span className="profile-meta-chip">
              <strong>Employee ID:</strong> #{employee.id}
            </span>
            <span className="profile-meta-chip">
              <Calendar size={14} />
              Joined: {new Date(employee.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
            {employee.updated_at && (
              <span className="profile-meta-chip">
                <Clock size={14} />
                Last updated: {new Date(employee.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid Layout for Profile Details */}
      <div className="profile-content-grid">
        {/* Left Column: Employment Details & Contact Information */}
        <div className="profile-col-left">
          {/* Card: Contact Information (with Inline Editing) */}
          <div className="profile-card">
            <div className="profile-card-header">
              <div className="profile-card-title-group">
                <Mail size={18} className="profile-card-icon" />
                <h2 className="profile-card-title">Contact Information</h2>
              </div>
              {!isEditingContact && (
                <button
                  onClick={() => setIsEditingContact(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <Edit3 size={14} />
                  <span>Update Contact</span>
                </button>
              )}
            </div>

            <div className="profile-card-body">
              {contactSuccess && (
                <div className="profile-alert profile-alert-success">
                  <Check size={16} />
                  <span>{contactSuccess}</span>
                </div>
              )}
              {contactError && (
                <div className="profile-alert profile-alert-danger">
                  <AlertCircle size={16} />
                  <span>{contactError}</span>
                </div>
              )}

              {isEditingContact ? (
                <form onSubmit={handleSaveContact} className="profile-contact-form">
                  <div className="profile-form-group">
                    <label className="profile-label">Email Address *</label>
                    <div className="profile-input-wrapper">
                      <Mail size={16} className="profile-input-icon" />
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, email: e.target.value })
                        }
                        className="profile-input"
                        placeholder="name@company.com"
                        required
                        disabled={contactSaving}
                      />
                    </div>
                  </div>

                  <div className="profile-form-group">
                    <label className="profile-label">Phone Number *</label>
                    <div className="profile-input-wrapper">
                      <Phone size={16} className="profile-input-icon" />
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, phone: e.target.value })
                        }
                        className="profile-input"
                        placeholder="+1 (555) 000-0000"
                        required
                        disabled={contactSaving}
                      />
                    </div>
                  </div>

                  <div className="profile-form-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingContact(false);
                        setContactError('');
                        setContactForm({
                          email: employee.email || '',
                          phone: employee.phone || ''
                        });
                      }}
                      className="btn btn-secondary btn-sm"
                      disabled={contactSaving}
                    >
                      <X size={14} />
                      <span>Cancel</span>
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={contactSaving}
                    >
                      <Check size={14} />
                      <span>{contactSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="profile-details-list">
                  <div className="profile-detail-row">
                    <div className="profile-detail-label">
                      <Mail size={15} />
                      <span>Work Email</span>
                    </div>
                    <div className="profile-detail-value">
                      <a href={`mailto:${employee.email}`} className="profile-email-link">
                        {employee.email}
                      </a>
                    </div>
                  </div>

                  <div className="profile-detail-row">
                    <div className="profile-detail-label">
                      <Phone size={15} />
                      <span>Phone Number</span>
                    </div>
                    <div className="profile-detail-value">
                      <a href={`tel:${employee.phone}`} className="profile-phone-link">
                        {employee.phone}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card: Employment & Organization Overview */}
          <div className="profile-card">
            <div className="profile-card-header">
              <div className="profile-card-title-group">
                <Briefcase size={18} className="profile-card-icon" />
                <h2 className="profile-card-title">Employment Overview</h2>
              </div>
            </div>

            <div className="profile-card-body">
              <div className="profile-details-list">
                <div className="profile-detail-row">
                  <div className="profile-detail-label">
                    <Building2 size={15} />
                    <span>Department</span>
                  </div>
                  <div className="profile-detail-value font-semibold">
                    {employee.department_name || 'Unassigned'}
                  </div>
                </div>

                <div className="profile-detail-row">
                  <div className="profile-detail-label">
                    <Briefcase size={15} />
                    <span>Job Designation</span>
                  </div>
                  <div className="profile-detail-value">
                    {employee.designation}
                  </div>
                </div>

                <div className="profile-detail-row">
                  <div className="profile-detail-label">
                    <ShieldCheck size={15} />
                    <span>Employment Status</span>
                  </div>
                  <div className="profile-detail-value">
                    <span
                      className={`badge-status ${
                        employee.status === 'Active' ? 'badge-status-active' : 'badge-status-inactive'
                      }`}
                    >
                      {employee.status}
                    </span>
                  </div>
                </div>

                <div className="profile-detail-row">
                  <div className="profile-detail-label">
                    <Calendar size={15} />
                    <span>Record Created</span>
                  </div>
                  <div className="profile-detail-value">
                    {new Date(employee.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Documents Management */}
        <div className="profile-col-right">
          <div className="profile-card profile-docs-card">
            <div className="profile-card-header">
              <div className="profile-card-title-group">
                <FileText size={18} className="profile-card-icon" />
                <h2 className="profile-card-title">Employee Documents</h2>
                <span className="profile-count-pill">{documents.length}</span>
              </div>
              <button
                onClick={() => {
                  setDocForm({ title: '', file: null });
                  setDocUploadError('');
                  setDocUploadModalOpen(true);
                }}
                className="btn btn-primary btn-sm"
              >
                <Upload size={14} />
                <span>Upload Document</span>
              </button>
            </div>

            <div className="profile-card-body profile-docs-body">
              {loadingDocs ? (
                <div className="profile-docs-loading">Loading documents...</div>
              ) : documents.length === 0 ? (
                <div className="profile-docs-empty">
                  <FileText size={36} className="profile-docs-empty-icon" />
                  <h4>No documents uploaded yet</h4>
                  <p>
                    Store resumes, IDs, contracts, or tax files securely for this employee.
                  </p>
                  <button
                    onClick={() => {
                      setDocForm({ title: '', file: null });
                      setDocUploadError('');
                      setDocUploadModalOpen(true);
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Upload size={14} />
                    <span>Upload First Document</span>
                  </button>
                </div>
              ) : (
                <div className="profile-docs-list">
                  {documents.map((doc) => (
                    <div key={doc.id} className="profile-doc-item">
                      <div className="profile-doc-icon-wrapper">
                        {getDocIcon(doc.file_type)}
                      </div>
                      <div className="profile-doc-meta">
                        <span className="profile-doc-title" title={doc.title}>
                          {doc.title}
                        </span>
                        <div className="profile-doc-sub">
                          <span className="profile-doc-filename">{doc.file_name}</span>
                          <span className="profile-dot-sep">•</span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span className="profile-dot-sep">•</span>
                          <span>
                            {new Date(doc.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="profile-doc-actions">
                        <button
                          onClick={() => handleDownloadDoc(doc)}
                          className="profile-doc-action-btn"
                          title="Download document"
                        >
                          <Download size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteDocTarget(doc)}
                          className="profile-doc-action-btn text-danger"
                          title="Delete document"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Upload Document */}
      {docUploadModalOpen && (
        <div className="modal-backdrop">
          <div className="profile-modal-card">
            <div className="profile-modal-header">
              <div className="profile-modal-title-wrap">
                <Upload size={18} />
                <h3>Upload Employee Document</h3>
              </div>
              <button
                type="button"
                className="profile-modal-close"
                onClick={() => setDocUploadModalOpen(false)}
                disabled={docUploading}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadDocumentSubmit}>
              <div className="profile-modal-body">
                {docUploadError && (
                  <div className="profile-alert profile-alert-danger">
                    <AlertCircle size={16} />
                    <span>{docUploadError}</span>
                  </div>
                )}

                <div className="profile-form-group">
                  <label className="profile-label">Document Title (Optional)</label>
                  <input
                    type="text"
                    value={docForm.title}
                    onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                    placeholder="e.g. Employment Contract, ID Copy"
                    className="profile-input"
                    maxLength={100}
                    disabled={docUploading}
                  />
                  <span className="profile-input-hint">
                    Leave blank to use the original file name.
                  </span>
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">Select File *</label>
                  <div className="profile-file-dropzone">
                    <input
                      type="file"
                      id="doc-file-input"
                      onChange={handleDocumentFileSelect}
                      accept=".pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      disabled={docUploading}
                    />
                    <label htmlFor="doc-file-input" className="profile-dropzone-label">
                      <Upload size={24} className="profile-dropzone-icon" />
                      {docForm.file ? (
                        <div className="profile-dropzone-selected">
                          <strong>{docForm.file.name}</strong>
                          <span>({formatFileSize(docForm.file.size)})</span>
                        </div>
                      ) : (
                        <div>
                          <strong>Click to choose a file</strong>
                          <p>PDF, Word (DOC/DOCX), JPEG, PNG, or TXT (Max 5MB)</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div className="profile-modal-footer">
                <button
                  type="button"
                  onClick={() => setDocUploadModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={docUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={docUploading || !docForm.file}
                >
                  {docUploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Document */}
      {deleteDocTarget && (
        <div className="modal-backdrop">
          <div className="profile-modal-card profile-modal-sm">
            <div className="profile-modal-header">
              <div className="profile-modal-title-wrap text-danger">
                <Trash2 size={18} />
                <h3>Delete Document</h3>
              </div>
              <button
                type="button"
                className="profile-modal-close"
                onClick={() => setDeleteDocTarget(null)}
                disabled={deleteDocLoading}
              >
                <X size={18} />
              </button>
            </div>

            <div className="profile-modal-body">
              <p>
                Are you sure you want to permanently delete{' '}
                <strong>"{deleteDocTarget.title}"</strong>?
              </p>
              <p className="profile-input-hint text-danger">
                This action will delete the file from server storage and cannot be undone.
              </p>
            </div>

            <div className="profile-modal-footer">
              <button
                type="button"
                onClick={() => setDeleteDocTarget(null)}
                className="btn btn-secondary"
                disabled={deleteDocLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDoc}
                className="btn btn-danger"
                disabled={deleteDocLoading}
              >
                {deleteDocLoading ? 'Deleting...' : 'Delete Permanently'}
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
