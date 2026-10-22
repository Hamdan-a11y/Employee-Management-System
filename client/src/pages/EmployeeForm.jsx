import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { ArrowLeft, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import './EmployeeForm.css';

const EmployeeForm = () => {
  const { success: notifySuccess, error: notifyError } = useNotification();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const [departments, setDepartments] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department_id: '',
    designation: '',
    status: 'Active',
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/departments');
        setDepartments(res.data);
        if (!isEditMode && res.data.length > 0) {
          setFormData((prev) => ({ ...prev, department_id: res.data[0].id }));
        }
      } catch (err) {
        setError('Failed to load departments list.');
      }
    };
    fetchDepartments();
  }, [isEditMode]);

  useEffect(() => {
    if (isEditMode) {
      const fetchEmployee = async () => {
        try {
          setFetching(true);
          const res = await api.get(`/employees/${id}`);
          setFormData({
            name: res.data.name || '',
            email: res.data.email || '',
            phone: res.data.phone || '',
            department_id: res.data.department_id || '',
            designation: res.data.designation || '',
            status: res.data.status || 'Active',
          });
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to load employee details.');
        } finally {
          setFetching(false);
        }
      };
      fetchEmployee();
    }
  }, [id, isEditMode]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.designation.trim()) {
      const msg = 'Please fill in all required fields.';
      setError(msg);
      notifyError(msg);
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email.trim())) {
      const msg = 'Please enter a valid email address (e.g. name@company.com).';
      setError(msg);
      notifyError(msg);
      return;
    }

    try {
      setLoading(true);
      if (isEditMode) {
        await api.put(`/employees/${id}`, formData);
        const msg = 'Employee updated successfully!';
        setSuccess(msg);
        notifySuccess(msg);
      } else {
        await api.post('/employees', formData);
        const msg = 'Employee added successfully!';
        setSuccess(msg);
        notifySuccess(msg);
      }

      setTimeout(() => {
        navigate('/employees');
      }, 700);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save employee. Please try again.';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar />

      <main className="employee-form-main">
        <div className="employee-form-back">
          <Link to="/employees" className="employee-form-link">
            <ArrowLeft size={16} />
            <span>Back to Employee Directory</span>
          </Link>
        </div>

        <div className="card">
          <div className="employee-form-header">
            <h1 className="employee-form-title">
              {isEditMode ? 'Edit Employee Details' : 'Add New Employee'}
            </h1>
            <p className="employee-form-subtitle">
              {isEditMode 
                ? 'Update personnel record, department assignment, or contact details.' 
                : 'Enter personnel information to register a new member to the directory.'}
            </p>
          </div>

          {error && (
            <div className="employee-form-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="employee-form-success">
              <CheckCircle size={18} />
              <span>{success}</span>
            </div>
          )}

          {fetching ? (
            <div className="employee-form-loading">
              Loading employee record...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="employee-form">
              <div className="employee-form-grid">
                <div>
                  <label htmlFor="name" className="employee-form-label">
                    Full Name *
                  </label>
                  <input
                    id="name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Alex Mercer"
                    required
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="designation" className="employee-form-label">
                    Designation / Title *
                  </label>
                  <input
                    id="designation"
                    type="text"
                    name="designation"
                    value={formData.designation}
                    onChange={handleChange}
                    placeholder="e.g. Lead Frontend Engineer"
                    required
                    className="input"
                  />
                </div>
              </div>

              <div className="employee-form-grid">
                <div>
                  <label htmlFor="email" className="employee-form-label">
                    Email Address *
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="alex.mercer@company.com"
                    required
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="employee-form-label">
                    Phone Number *
                  </label>
                  <input
                    id="phone"
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 019-2834"
                    required
                    className="input"
                  />
                </div>
              </div>

              <div className="employee-form-grid">
                <div>
                  <label htmlFor="department_id" className="employee-form-label">
                    Department *
                  </label>
                  <select
                    id="department_id"
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleChange}
                    required
                    className="select"
                  >
                    <option value="" disabled>Select a department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="status" className="employee-form-label">
                    Employment Status *
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="select"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="employee-form-actions">
                <button
                  type="button"
                  onClick={() => navigate('/employees')}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  <Save size={16} />
                  <span>{loading ? 'Saving...' : (isEditMode ? 'Update Employee' : 'Save Employee')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default EmployeeForm;
