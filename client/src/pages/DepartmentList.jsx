import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Users,
  AlertCircle,
  CheckCircle,
  X,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import './DepartmentList.css';

const DepartmentList = () => {
  const { success, error: notifyError } = useNotification();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [editing, setEditing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/departments');
      setDepartments(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load departments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);


  // Handle Create Department
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addName.trim()) {
      setAddError('Please enter a department name.');
      return;
    }

    try {
      setAdding(true);
      setAddError('');
      const res = await api.post('/departments', { name: addName.trim() });
      
      // Update local state or re-fetch
      await fetchDepartments();
      success(res.data.message || 'Department created successfully!');
      setIsAddOpen(false);
      setAddName('');
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to create department.');
    } finally {
      setAdding(false);
    }
  };

  // Handle Open Edit
  const openEditModal = (dept) => {
    setEditTarget(dept);
    setEditName(dept.name);
    setEditError('');
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Please enter a department name.');
      return;
    }

    try {
      setEditing(true);
      setEditError('');
      const res = await api.put(`/departments/${editTarget.id}`, { name: editName.trim() });
      
      await fetchDepartments();
      success(res.data.message || 'Department updated successfully!');
      setEditTarget(null);
      setEditName('');
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update department.');
      notifyError(err.response?.data?.message || 'Failed to update department.');
    } finally {
      setEditing(false);
    }
  };

  // Handle Delete Submit
  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      const res = await api.delete(`/departments/${deleteTarget.id}`);
      
      await fetchDepartments();
      success(res.data.message || 'Department deleted successfully!');
      setDeleteTarget(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete department.');
      notifyError(err.response?.data?.message || 'Failed to delete department.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // Filtered list
  const filteredDepartments = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  // Compute metrics
  const totalEmployeesInDepartments = departments.reduce(
    (sum, d) => sum + (Number(d.employee_count) || 0),
    0
  );

  return (
    <div className="app-container">
      <Sidebar />

      <main className="dept-main">
        {/* Page Header */}
        <div className="dept-header">
          <div>
            <h1 className="dept-title">Department Management</h1>
            <p className="dept-subtitle">
              Create, view, edit, and organize company departments and staff allocations.
            </p>
          </div>

          <button
            onClick={() => {
              setIsAddOpen(true);
              setAddName('');
              setAddError('');
            }}
            className="btn btn-primary"
          >
            <Plus size={16} />
            <span>Add Department</span>
          </button>
        </div>


        {/* Global Error Banner */}
        {error && (
          <div className="dept-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Metric Summary Cards */}
        <div className="dept-stats-grid">
          <div className="card dept-stat-card">
            <div className="dept-stat-icon primary">
              <Building2 size={22} />
            </div>
            <div>
              <div className="dept-stat-label">Total Departments</div>
              <div className="dept-stat-value">{departments.length}</div>
            </div>
          </div>

          <div className="card dept-stat-card">
            <div className="dept-stat-icon success">
              <Users size={22} />
            </div>
            <div>
              <div className="dept-stat-label">Allocated Employees</div>
              <div className="dept-stat-value">{totalEmployeesInDepartments}</div>
            </div>
          </div>
        </div>

        {/* Search Filter Card */}
        <div className="card dept-filter-card">
          <div className="dept-filters-wrapper">
            <div className="dept-search-box">
              <Search size={16} color="var(--text-muted)" className="dept-search-icon" />
              <input
                type="text"
                placeholder="Search departments by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input dept-search-input"
              />
            </div>

            {search && (
              <button
                onClick={() => setSearch('')}
                className="btn btn-secondary dept-filter-reset-btn"
              >
                <X size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Department Table */}
        <div className="card dept-table-card">
          <div className="dept-table-scroll">
            <table className="dept-table">
              <thead>
                <tr className="dept-table-head">
                  <th className="dept-th">Department</th>
                  <th className="dept-th">Assigned Staff</th>
                  <th className="dept-th">Created Date</th>
                  <th className="dept-th actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="dept-loading-cell">
                      Loading departments...
                    </td>
                  </tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="dept-empty-cell">
                      <div className="dept-empty-wrapper">
                        <Building2 size={32} color="var(--text-muted)" />
                        <span className="dept-empty-title">No departments found</span>
                        <span className="dept-empty-desc">
                          {search
                            ? 'No departments match your search query.'
                            : 'Click "Add Department" to create your first department.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((dept) => {
                    const empCount = Number(dept.employee_count) || 0;
                    const createdFormatted = dept.created_at
                      ? new Date(dept.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : '—';

                    return (
                      <tr key={dept.id} className="dept-tr">
                        <td className="dept-td">
                          <div className="dept-name-cell">
                            <div className="dept-icon-wrapper">
                              <Building2 size={18} />
                            </div>
                            <div>
                              <div className="dept-name-title">{dept.name}</div>
                              <div className="dept-name-id">ID #{dept.id}</div>
                            </div>
                          </div>
                        </td>

                        <td className="dept-td">
                          <Link
                            to={`/employees?department_id=${dept.id}`}
                            className={`dept-employee-badge-link ${
                              empCount > 0 ? 'has-employees' : ''
                            }`}
                            title={`View employees assigned to ${dept.name}`}
                          >
                            <Users size={13} />
                            <span>
                              {empCount} {empCount === 1 ? 'employee' : 'employees'}
                            </span>
                            <ArrowRight size={12} />
                          </Link>
                        </td>

                        <td className="dept-td">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {createdFormatted}
                          </span>
                        </td>

                        <td className="dept-td actions">
                          <div className="dept-actions-group">
                            <button
                              onClick={() => openEditModal(dept)}
                              className="btn btn-secondary dept-action-btn"
                              title="Edit department"
                            >
                              <Edit2 size={14} />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setDeleteTarget(dept)}
                              className="btn btn-danger dept-action-btn"
                              title="Delete department"
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

        {/* Modal: Add Department */}
        {isAddOpen && (
          <div className="modal-backdrop">
            <div className="card modal-card dept-modal-card">
              <div className="modal-header">
                <div className="modal-icon dept-modal-icon-primary">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Add Department</h3>
                  <p className="modal-subtitle">
                    Enter the name for the new department.
                  </p>
                </div>
              </div>

              {addError && (
                <div className="dept-error" style={{ marginBottom: 'var(--space-3)' }}>
                  <AlertCircle size={16} />
                  <span>{addError}</span>
                </div>
              )}

              <form onSubmit={handleAddSubmit} className="dept-modal-form">
                <div>
                  <label htmlFor="dept-add-name" className="dept-form-label">
                    Department Name *
                  </label>
                  <input
                    id="dept-add-name"
                    type="text"
                    value={addName}
                    onChange={(e) => {
                      setAddName(e.target.value);
                      if (addError) setAddError('');
                    }}
                    placeholder="e.g. Research & Development"
                    autoFocus
                    required
                    maxLength={100}
                    className="input"
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => setIsAddOpen(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding || !addName.trim()}
                    className="btn btn-primary"
                  >
                    {adding ? 'Creating...' : 'Create Department'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Department */}
        {editTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card dept-modal-card">
              <div className="modal-header">
                <div className="modal-icon dept-modal-icon-primary">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Edit Department</h3>
                  <p className="modal-subtitle">
                    Update department title. Existing staff links are preserved.
                  </p>
                </div>
              </div>

              {editError && (
                <div className="dept-error" style={{ marginBottom: 'var(--space-3)' }}>
                  <AlertCircle size={16} />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="dept-modal-form">
                <div>
                  <label htmlFor="dept-edit-name" className="dept-form-label">
                    Department Name *
                  </label>
                  <input
                    id="dept-edit-name"
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (editError) setEditError('');
                    }}
                    autoFocus
                    required
                    maxLength={100}
                    className="input"
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    disabled={editing}
                    onClick={() => setEditTarget(null)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editing || !editName.trim()}
                    className="btn btn-primary"
                  >
                    {editing ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Confirm Deletion */}
        {deleteTarget && (
          <div className="modal-backdrop">
            <div className="card modal-card">
              <div className="modal-header">
                <div className="modal-icon">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Confirm Department Deletion</h3>
                  <p className="modal-subtitle">This action cannot be undone.</p>
                </div>
              </div>

              <p className="modal-body-text">
                Are you sure you want to delete department{' '}
                <strong>{deleteTarget.name}</strong>?
              </p>

              {Number(deleteTarget.employee_count) > 0 ? (
                <div className="dept-modal-warning-box">
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>{deleteTarget.employee_count} employee(s)</strong> are
                    currently linked to this department. Deleting it will keep their
                    employee records and set their department to{' '}
                    <em>Unassigned</em> (via foreign key <code>ON DELETE SET NULL</code>).
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '0.825rem',
                    color: 'var(--text-muted)',
                    marginBottom: 'var(--space-4)'
                  }}
                >
                  This department has 0 assigned employees.
                </div>
              )}

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
                  {deleting ? 'Deleting...' : 'Delete Department'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DepartmentList;
