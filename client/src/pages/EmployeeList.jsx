import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import ImportModal from '../components/ImportModal';
import { 
  Search, 
  UserPlus, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  X,
  Users,
  Download,
  Upload,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  User,
  Archive
} from 'lucide-react';
import './EmployeeList.css';
import { useNotification } from '../context/NotificationContext';

const EmployeeList = () => {
  const { success, error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDept = searchParams.get('department_id') || 'all';

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState(initialDept);
  const [status, setStatus] = useState('all');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Import and Export state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportDropdownRef = useRef(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments');
        setDepartments(res.data);
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (departmentId !== 'all') params.department_id = departmentId;
      if (status !== 'all') params.status = status;

      const res = await api.get('/employees', { params });
      setEmployees(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmployees();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, departmentId, status]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.delete(`/employees/${deleteTarget.id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      success(`Employee "${deleteTarget.name}" moved to deleted archive. You can restore them anytime.`);
      setDeleteTarget(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete employee.';
      setError(msg);
      notifyError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setDepartmentId('all');
    setStatus('all');
    setSearchParams({});
  };

  const handleExport = async (format) => {
    setIsExportOpen(false);
    try {
      setExporting(true);
      setError('');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (departmentId && departmentId !== 'all') params.append('department_id', departmentId);
      if (status && status !== 'all') params.append('status', status);

      const endpoint = `/employees/export/${format}?${params.toString()}`;
      const response = await api.get(endpoint, { responseType: 'blob' });

      const blob = new Blob([response.data], {
        type: format === 'csv'
          ? 'text/csv;charset=utf-8;'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `employees_${dateStr}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      success(`Employee records exported to ${format.toUpperCase()} successfully.`);
    } catch (err) {
      const msg = `Failed to export employee records to ${format.toUpperCase()}.`;
      setError(msg);
      notifyError(msg);
    } finally {
      setExporting(false);
    }
  };

  const handleImportSuccess = (message) => {
    success(message);
    fetchEmployees();
  };

  return (
    <div className="app-container">
      <Sidebar />

      <main className="employee-list-main">
        <div className="employee-list-header">
          <div>
            <h1 className="employee-list-title">
              Employee Directory
            </h1>
            <p className="employee-list-subtitle">
              Manage team members, update credentials, and filter by department.
            </p>
          </div>

          <div className="employee-header-actions">
            {/* Export Dropdown */}
            <div className="export-dropdown-wrapper" ref={exportDropdownRef}>
              <button
                type="button"
                className="btn btn-secondary employee-export-btn"
                onClick={() => setIsExportOpen((prev) => !prev)}
                disabled={exporting}
                title="Export employee records"
              >
                <Download size={15} />
                <span>{exporting ? 'Exporting...' : 'Export'}</span>
                <ChevronDown size={14} className={isExportOpen ? 'rotated' : ''} />
              </button>

              {isExportOpen && (
                <div className="export-menu-dropdown">
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    className="export-menu-item"
                  >
                    <FileText size={16} className="export-item-icon text-indigo" />
                    <div className="export-item-text">
                      <span className="export-item-title">Export to CSV</span>
                      <span className="export-item-desc">Comma-separated values</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    className="export-menu-item"
                  >
                    <FileSpreadsheet size={16} className="export-item-icon text-emerald" />
                    <div className="export-item-text">
                      <span className="export-item-title">Export to Excel</span>
                      <span className="export-item-desc">Microsoft Excel (.xlsx)</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Import CSV */}
            <button
              type="button"
              className="btn btn-secondary employee-import-btn"
              onClick={() => setIsImportModalOpen(true)}
              title="Import employees from CSV"
            >
              <Upload size={15} />
              <span>Import CSV</span>
            </button>

            {/* Deleted Archive */}
            <Link
              to="/employees/deleted"
              className="btn btn-secondary employee-archive-btn"
              title="View and restore soft-deleted employees"
            >
              <Archive size={15} />
              <span>Deleted Archive</span>
            </Link>

            {/* Add Employee */}
            <Link to="/employees/new" className="btn btn-primary">
              <UserPlus size={16} />
              <span>Add Employee</span>
            </Link>
          </div>
        </div>


        {error && (
          <div className="employee-list-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="card employee-filter-card">
          <div className="employee-filters-wrapper">
            <div className="employee-search-box">
              <Search size={16} color="var(--text-muted)" className="employee-search-icon" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input employee-search-input"
              />
            </div>

            <div className="employee-filter-select-dept">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="select"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="employee-filter-select-status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="select"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {(search || departmentId !== 'all' || status !== 'all') && (
              <button onClick={clearFilters} className="btn btn-secondary employee-filter-reset-btn">
                <X size={14} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className="card employee-table-card">
          <div className="employee-table-scroll">
            <table className="employee-table">
              <thead>
                <tr className="employee-table-head">
                  <th className="employee-th">Employee</th>
                  <th className="employee-th">Contact</th>
                  <th className="employee-th">Department</th>
                  <th className="employee-th">Designation</th>
                  <th className="employee-th">Status</th>
                  <th className="employee-th actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="employee-loading-cell">
                      Loading employee directory...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="employee-empty-cell">
                      <div className="employee-empty-wrapper">
                        <Users size={32} color="var(--text-muted)" />
                        <span className="employee-empty-title">No employees found</span>
                        <span className="employee-empty-desc">
                          Try adjusting your search criteria or add a new team member.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const avatarSrc = emp.avatar_url
                      ? (emp.avatar_url.startsWith('http') ? emp.avatar_url : `http://localhost:5000${emp.avatar_url}`)
                      : null;
                    const initials = emp.name
                      ? emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : 'EM';

                    return (
                      <tr key={emp.id} className="employee-tr">
                        <td className="employee-td">
                          <div className="employee-cell-profile">
                            <Link to={`/employees/${emp.id}`} className="employee-avatar-thumb-link" title="View Profile">
                              {avatarSrc ? (
                                <img src={avatarSrc} alt={emp.name} className="employee-avatar-thumb" />
                              ) : (
                                <div className="employee-avatar-thumb-fallback">{initials}</div>
                              )}
                            </Link>
                            <div className="employee-info-col">
                              <Link to={`/employees/${emp.id}`} className="employee-name-link" title="View Profile">
                                {emp.name}
                              </Link>
                              <div className="employee-id">ID #{emp.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="employee-td">
                          <div className="employee-email">{emp.email}</div>
                          <div className="employee-phone">{emp.phone}</div>
                        </td>
                        <td className="employee-td">
                          {emp.department_name || 'Unassigned'}
                        </td>
                        <td className="employee-td">
                          {emp.designation}
                        </td>
                        <td className="employee-td">
                          <span className={`badge ${emp.status === 'Active' ? 'badge-active' : 'badge-inactive'}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="employee-td actions">
                          <div className="employee-actions-group">
                            <Link
                              to={`/employees/${emp.id}`}
                              className="btn btn-secondary employee-action-btn"
                              title="View Employee Profile"
                            >
                              <User size={14} />
                              <span>Profile</span>
                            </Link>
                            <Link
                              to={`/employees/edit/${emp.id}`}
                              className="btn btn-secondary employee-action-btn"
                            >
                              <Edit2 size={14} />
                              <span>Edit</span>
                            </Link>
                            <button
                              onClick={() => setDeleteTarget(emp)}
                              className="btn btn-danger employee-action-btn"
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
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

        {deleteTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="modal-title">
                    Move Employee to Archive
                  </h3>
                  <p className="modal-subtitle">
                    Record can be restored by an administrator at any time.
                  </p>
                </div>
              </div>

              <p className="modal-body-text">
                Are you sure you want to remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) from the active directory? Their records, documents, and history will be safely preserved in the Deleted Archive.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="btn btn-danger"
                >
                  {deleting ? 'Deleting...' : 'Delete Employee'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CSV Import Modal */}
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportSuccess={handleImportSuccess}
        />
      </main>
    </div>
  );
};

export default EmployeeList;
