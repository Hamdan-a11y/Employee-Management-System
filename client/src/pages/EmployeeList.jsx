import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  X,
  Users,
  Download,
  Upload,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  User,
  Archive,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Filter,
  RotateCcw
} from 'lucide-react';
import './EmployeeList.css';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const EmployeeList = () => {
  const { user, isAdmin, can } = useAuth();
  const { success, error: notifyError } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  // Extract filter and pagination state from URL search params
  const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const urlLimit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const urlSearch = searchParams.get('search') || '';
  const urlDept = searchParams.get('department_id') || 'all';
  const urlDesignation = searchParams.get('designation') || 'all';
  const urlStatus = searchParams.get('status') || 'all';
  const urlStartDate = searchParams.get('startDate') || '';
  const urlEndDate = searchParams.get('endDate') || '';
  const urlSortBy = searchParams.get('sortBy') || 'id';
  const urlSortOrder = (searchParams.get('sortOrder') || 'DESC').toUpperCase();

  // Local state
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Local search input for debouncing
  const [searchInput, setSearchInput] = useState(urlSearch);

  // Pagination state
  const [pagination, setPagination] = useState({
    total: 0,
    page: urlPage,
    limit: urlLimit,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Modal & action state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportDropdownRef = useRef(null);

  // Sync local searchInput if urlSearch changed externally
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

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

  // Fetch departments and distinct designations for filter dropdowns
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [deptRes, desigRes] = await Promise.all([
          api.get('/departments'),
          api.get('/employees/designations').catch(() => ({ data: [] }))
        ]);
        setDepartments(deptRes.data || []);
        setDesignations(desigRes.data || []);
      } catch (err) {
        console.error('Error fetching departments or designations:', err);
      }
    };
    fetchMetadata();
  }, []);

  // Helper to update URL search params and preserve existing filters
  const updateParams = useCallback((newParams, resetPage = true) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(newParams).forEach(([key, val]) => {
      if (val === undefined || val === null || val === '' || val === 'all') {
        next.delete(key);
      } else {
        next.set(key, String(val));
      }
    });

    if (resetPage) {
      next.delete('page'); // Page 1 is default
    }

    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Debounced search input handler
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== urlSearch) {
        updateParams({ search: searchInput }, true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, updateParams]);

  // Fetch employees matching the current query params
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page: urlPage,
        limit: urlLimit,
        sortBy: urlSortBy,
        sortOrder: urlSortOrder
      };

      if (urlSearch.trim()) params.search = urlSearch.trim();
      if (urlDept !== 'all') params.department_id = urlDept;
      if (urlDesignation !== 'all') params.designation = urlDesignation;
      if (urlStatus !== 'all') params.status = urlStatus;
      if (urlStartDate) params.startDate = urlStartDate;
      if (urlEndDate) params.endDate = urlEndDate;

      const res = await api.get('/employees', { params });

      const data = Array.isArray(res.data) ? res.data : (res.data.employees || []);
      const paginationData = res.data.pagination || {
        total: data.length,
        page: urlPage,
        limit: urlLimit,
        totalPages: Math.max(1, Math.ceil(data.length / urlLimit)),
        hasNextPage: false,
        hasPrevPage: false
      };

      setEmployees(data);
      setPagination(paginationData);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }, [
    urlPage,
    urlLimit,
    urlSearch,
    urlDept,
    urlDesignation,
    urlStatus,
    urlStartDate,
    urlEndDate,
    urlSortBy,
    urlSortOrder
  ]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Column sorting toggle
  const handleSort = (column) => {
    let nextOrder = 'ASC';
    if (urlSortBy === column) {
      nextOrder = urlSortOrder === 'ASC' ? 'DESC' : 'ASC';
    } else if (column === 'id' || column === 'created_at') {
      nextOrder = 'DESC';
    }
    updateParams({ sortBy: column, sortOrder: nextOrder }, false);
  };

  // Pagination navigation handlers
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === urlPage) return;
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(newPage));
    }
    setSearchParams(next, { replace: true });
  };

  const handleLimitChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    const next = new URLSearchParams(searchParams);
    if (newLimit === 10) {
      next.delete('limit');
    } else {
      next.set('limit', String(newLimit));
    }
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  // Reset all filters
  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  const hasActiveFilters = Boolean(
    urlSearch || 
    urlDept !== 'all' || 
    urlDesignation !== 'all' || 
    urlStatus !== 'all' || 
    urlStartDate || 
    urlEndDate ||
    urlSortBy !== 'id' ||
    urlSortOrder !== 'DESC'
  );

  // Soft delete confirmation
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.delete(`/employees/${deleteTarget.id}`);
      success(`Employee "${deleteTarget.name}" moved to deleted archive.`);
      setDeleteTarget(null);
      fetchEmployees();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete employee.';
      setError(msg);
      notifyError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Export handlers with current filters
  const handleExport = async (format) => {
    setIsExportOpen(false);
    try {
      setExporting(true);
      setError('');
      const params = new URLSearchParams();
      if (urlSearch) params.append('search', urlSearch);
      if (urlDept && urlDept !== 'all') params.append('department_id', urlDept);
      if (urlDesignation && urlDesignation !== 'all') params.append('designation', urlDesignation);
      if (urlStatus && urlStatus !== 'all') params.append('status', urlStatus);
      if (urlStartDate) params.append('startDate', urlStartDate);
      if (urlEndDate) params.append('endDate', urlEndDate);
      if (urlSortBy) params.append('sortBy', urlSortBy);
      if (urlSortOrder) params.append('sortOrder', urlSortOrder);

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

  // Generate numbered pagination items with smart windowing
  const renderPaginationItems = () => {
    const totalPages = pagination.totalPages;
    const current = urlPage;
    if (totalPages <= 1) return null;

    const items = [];
    const maxButtons = 5;

    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    if (start > 1) {
      items.push(
        <button
          key="page-1"
          type="button"
          onClick={() => handlePageChange(1)}
          className={`employee-page-num ${current === 1 ? 'active' : ''}`}
        >
          1
        </button>
      );
      if (start > 2) {
        items.push(<span key="ellipsis-start" className="employee-page-ellipsis">…</span>);
      }
    }

    for (let p = start; p <= end; p++) {
      items.push(
        <button
          key={`page-${p}`}
          type="button"
          onClick={() => handlePageChange(p)}
          className={`employee-page-num ${current === p ? 'active' : ''}`}
        >
          {p}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        items.push(<span key="ellipsis-end" className="employee-page-ellipsis">…</span>);
      }
      items.push(
        <button
          key={`page-${totalPages}`}
          type="button"
          onClick={() => handlePageChange(totalPages)}
          className={`employee-page-num ${current === totalPages ? 'active' : ''}`}
        >
          {totalPages}
        </button>
      );
    }

    return items;
  };

  // Render sort icon helper
  const renderSortIcon = (column) => {
    if (urlSortBy !== column) {
      return <ArrowUpDown size={13} className="employee-sort-icon inactive" />;
    }
    return urlSortOrder === 'ASC' 
      ? <ArrowUp size={13} className="employee-sort-icon active" />
      : <ArrowDown size={13} className="employee-sort-icon active" />;
  };

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content employee-list-main">
        {/* Top Header */}
        <div className="employee-list-header">
          <div>
            <h1 className="employee-list-title">Employee Directory</h1>
            <p className="employee-list-subtitle">
              Manage team members, search, filter, and inspect detailed profiles.
            </p>
          </div>

          <div className="employee-header-actions">
            {/* Export Dropdown */}
            {(isAdmin || can('employee.export')) && (
              <div className="export-dropdown-wrapper" ref={exportDropdownRef}>
                <button
                  type="button"
                  className="btn btn-secondary employee-export-btn"
                  onClick={() => setIsExportOpen((prev) => !prev)}
                  disabled={exporting}
                  title="Export filtered records"
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
                        <span className="export-item-desc">Respects active filters</span>
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
            )}

            {/* Import CSV */}
            {(isAdmin || can('employee.create')) && (
              <button
                type="button"
                className="btn btn-secondary employee-import-btn"
                onClick={() => setIsImportModalOpen(true)}
                title="Import employees from CSV"
              >
                <Upload size={15} />
                <span>Import CSV</span>
              </button>
            )}

            {/* Deleted Archive */}
            {isAdmin && (
              <Link
                to="/employees/deleted"
                className="btn btn-secondary employee-archive-btn"
                title="View and restore soft-deleted employees"
              >
                <Archive size={15} />
                <span>Deleted Archive</span>
              </Link>
            )}

            {/* Add Employee */}
            {(isAdmin || can('employee.create')) && (
              <Link to="/employees/new" className="btn btn-primary">
                <UserPlus size={16} />
                <span>Add Employee</span>
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="employee-list-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Advanced Search & Filtering Card */}
        <div className="card employee-filter-card">
          <div className="employee-filters-primary-row">
            {/* Search across name, email, phone, and employee ID */}
            <div className="employee-search-box">
              <Search size={16} className="employee-search-icon" />
              <input
                type="text"
                placeholder="Search name, email, phone, or ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateParams({ search: searchInput }, true);
                  }
                }}
                className="input employee-search-input"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    updateParams({ search: '' }, true);
                  }}
                  className="employee-search-clear-btn"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Department Filter */}
            <div className="employee-filter-select-dept">
              <select
                value={user?.role === 'department_manager' ? (user?.department_id || urlDept) : urlDept}
                onChange={(e) => updateParams({ department_id: e.target.value }, true)}
                className="select"
                title={user?.role === 'department_manager' ? 'Department locked to your assigned department' : 'Filter by Department'}
                disabled={user?.role === 'department_manager'}
              >
                {user?.role !== 'department_manager' && <option value="all">All Departments</option>}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Designation Filter */}
            <div className="employee-filter-select-desig">
              <select
                value={urlDesignation}
                onChange={(e) => updateParams({ designation: e.target.value }, true)}
                className="select"
                title="Filter by Designation"
              >
                <option value="all">All Designations</option>
                {designations.map((desig) => (
                  <option key={desig} value={desig}>{desig}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="employee-filter-select-status">
              <select
                value={urlStatus}
                onChange={(e) => updateParams({ status: e.target.value }, true)}
                className="select"
                title="Filter by Status"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Secondary Filter Row: Joining Date Range & Reset Button */}
          <div className="employee-filters-secondary-row">
            <div className="employee-filter-date-group">
              <div className="employee-date-label">
                <Calendar size={14} />
                <span>Joined Date:</span>
              </div>
              <input
                type="date"
                value={urlStartDate}
                onChange={(e) => updateParams({ startDate: e.target.value }, true)}
                className="input employee-date-input"
                title="From Date"
              />
              <span className="employee-date-separator">to</span>
              <input
                type="date"
                value={urlEndDate}
                onChange={(e) => updateParams({ endDate: e.target.value }, true)}
                className="input employee-date-input"
                title="To Date"
              />
            </div>

            {hasActiveFilters && (
              <button 
                type="button" 
                onClick={clearFilters} 
                className="btn btn-secondary employee-filter-reset-btn"
                title="Reset all filters to default"
              >
                <RotateCcw size={13} />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Employees Table Card */}
        <div className="card employee-table-card">
          <div className="employee-table-scroll">
            <table className="employee-table">
              <thead>
                <tr className="employee-table-head">
                  {/* Employee Name (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('name')}
                    title="Sort by Name"
                  >
                    <div className="th-sort-wrapper">
                      <span>Employee</span>
                      {renderSortIcon('name')}
                    </div>
                  </th>

                  {/* ID (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('id')}
                    title="Sort by Employee ID"
                  >
                    <div className="th-sort-wrapper">
                      <span>ID</span>
                      {renderSortIcon('id')}
                    </div>
                  </th>

                  {/* Contact Info (Not sortable directly) */}
                  <th className="employee-th">Contact</th>

                  {/* Department (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('department')}
                    title="Sort by Department"
                  >
                    <div className="th-sort-wrapper">
                      <span>Department</span>
                      {renderSortIcon('department')}
                    </div>
                  </th>

                  {/* Designation (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('designation')}
                    title="Sort by Designation"
                  >
                    <div className="th-sort-wrapper">
                      <span>Designation</span>
                      {renderSortIcon('designation')}
                    </div>
                  </th>

                  {/* Status (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('status')}
                    title="Sort by Status"
                  >
                    <div className="th-sort-wrapper">
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>

                  {/* Joined Date (Sortable) */}
                  <th 
                    className="employee-th sortable" 
                    onClick={() => handleSort('created_at')}
                    title="Sort by Joined Date"
                  >
                    <div className="th-sort-wrapper">
                      <span>Joined</span>
                      {renderSortIcon('created_at')}
                    </div>
                  </th>

                  {/* Actions */}
                  <th className="employee-th actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="employee-loading-cell">
                      <div className="employee-table-loader-wrap">
                        <div className="employee-table-spinner" />
                        <span>Loading employee directory...</span>
                      </div>
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="employee-empty-cell">
                      <div className="employee-empty-wrapper">
                        <Users size={34} color="var(--text-muted)" />
                        <span className="employee-empty-title">No employees found</span>
                        <span className="employee-empty-desc">
                          {hasActiveFilters 
                            ? 'No employees match the applied filter criteria. Try resetting or adjusting your search.'
                            : 'No employee records exist yet. Add a new team member to get started.'}
                        </span>
                        {hasActiveFilters && (
                          <button 
                            type="button" 
                            onClick={clearFilters} 
                            className="btn btn-secondary btn-sm mt-2"
                          >
                            <RotateCcw size={13} />
                            <span>Reset Filters</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const avatarSrc = emp.avatar_url
                      ? (emp.avatar_url.startsWith('http') ? emp.avatar_url : `http://localhost:5000${emp.avatar_url}`)
                      : null;
                    const initials = emp.name
                      ? emp.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                      : 'EM';
                    const joinedFormatted = emp.created_at
                      ? new Date(emp.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : '—';

                    return (
                      <tr key={emp.id} className="employee-tr">
                        {/* Profile Name & Avatar */}
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
                            </div>
                          </div>
                        </td>

                        {/* ID */}
                        <td className="employee-td">
                          <span className="employee-id-badge">#{emp.id}</span>
                        </td>

                        {/* Contact */}
                        <td className="employee-td">
                          <div className="employee-email">{emp.email}</div>
                          <div className="employee-phone">{emp.phone}</div>
                        </td>

                        {/* Department */}
                        <td className="employee-td">
                          <span className="employee-dept-badge">
                            {emp.department_name || 'Unassigned'}
                          </span>
                        </td>

                        {/* Designation */}
                        <td className="employee-td">
                          <span className="employee-designation-text">{emp.designation}</span>
                        </td>

                        {/* Status */}
                        <td className="employee-td">
                          <span className={`badge ${emp.status === 'Active' ? 'badge-active' : 'badge-inactive'}`}>
                            {emp.status}
                          </span>
                        </td>

                        {/* Joined Date */}
                        <td className="employee-td">
                          <span className="employee-joined-date">{joinedFormatted}</span>
                        </td>

                        {/* Actions */}
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
                            {(isAdmin || can('employee.update')) && (
                              <Link
                                to={`/employees/edit/${emp.id}`}
                                className="btn btn-secondary employee-action-btn"
                                title="Edit Employee"
                              >
                                <Edit2 size={14} />
                                <span>Edit</span>
                              </Link>
                            )}
                            {(isAdmin || can('employee.delete')) && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(emp)}
                                className="btn btn-danger employee-action-btn"
                                title="Move to Deleted Archive"
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Bar */}
          {!loading && pagination.total > 0 && (
            <div className="employee-pagination-bar">
              {/* Left: Summary Info */}
              <div className="employee-pagination-info">
                Showing <strong>{(urlPage - 1) * pagination.limit + 1}</strong> to{' '}
                <strong>{Math.min(urlPage * pagination.limit, pagination.total)}</strong> of{' '}
                <strong>{pagination.total}</strong> employees
              </div>

              {/* Center: Page Size Selector */}
              <div className="employee-page-size-wrap">
                <span className="employee-page-size-label">Rows per page:</span>
                <select
                  value={urlLimit}
                  onChange={handleLimitChange}
                  className="select employee-page-size-select"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Right: Page Buttons & Nav */}
              <div className="employee-pagination-actions">
                <button
                  type="button"
                  onClick={() => handlePageChange(urlPage - 1)}
                  disabled={!pagination.hasPrevPage}
                  className="btn btn-secondary btn-sm employee-page-nav-btn"
                  title="Previous Page"
                >
                  <ChevronLeft size={15} />
                  <span>Prev</span>
                </button>

                <div className="employee-page-numbers">
                  {renderPaginationItems()}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(urlPage + 1)}
                  disabled={!pagination.hasNextPage}
                  className="btn btn-secondary btn-sm employee-page-nav-btn"
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Move Employee to Archive</h3>
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
