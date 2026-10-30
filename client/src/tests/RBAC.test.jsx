import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ProtectedRoute from '../components/ProtectedRoute';
import EmployeeList from '../pages/EmployeeList';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../components/ImportModal', () => ({
  default: () => <div data-testid="import-modal-mock" />,
}));

describe('Feature 18: Client-Side RBAC Permission & UI Visibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loadingNotifications: false,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotification: vi.fn(),
      clearRead: vi.fn(),
      fetchNotifications: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    });

    api.get.mockImplementation((url) => {
      if (url === '/departments') {
        return Promise.resolve({ data: [{ id: 1, name: 'Engineering' }, { id: 2, name: 'Marketing' }] });
      }
      if (url === '/employees/designations') {
        return Promise.resolve({ data: ['Senior Dev', 'Manager'] });
      }
      if (url === '/employees') {
        return Promise.resolve({
          data: {
            employees: [
              {
                id: 10,
                name: 'Dept 1 Engineer',
                email: 'eng@company.com',
                phone: '+1-555',
                department_id: 1,
                department_name: 'Engineering',
                designation: 'Senior Dev',
                status: 'Active',
                created_at: '2026-01-01'
              }
            ],
            pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  // ==========================================
  // 1. Sidebar Navigation Tests by Role
  // ==========================================
  it('Sidebar: Admin sees all management links and Admin badge', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'Admin User', email: 'admin@company.com', role: 'admin' },
      isAdmin: true,
      isHR: false,
      isDeptManager: false,
      isEmployee: false,
      can: () => true,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Departments')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Employees')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Attendance')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Leaves')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Deleted Archive')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Audit Log')[0]).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('Sidebar: HR Manager sees Employees, Departments, Audit Log, but NOT Deleted Archive', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 2, name: 'Helen Ross', email: 'hr@company.com', role: 'hr_manager', permissions: ['employee.view', 'department.view', 'audit.view'] },
      isAdmin: false,
      isHR: true,
      isDeptManager: false,
      isEmployee: false,
      can: (perm) => ['employee.view', 'department.view', 'audit.view', 'attendance.view', 'leave.view'].includes(perm),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Departments')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Employees')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Audit Log')[0]).toBeInTheDocument();
    expect(screen.queryByText('Deleted Archive')).not.toBeInTheDocument();
    expect(screen.getByText('HR Manager')).toBeInTheDocument();
  });

  it('Sidebar: Department Manager sees Employees and Departments, but NOT Audit Log or Deleted Archive', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 3, name: 'David Miller', email: 'dm@company.com', role: 'department_manager', department_id: 1, permissions: ['employee.view', 'department.view'] },
      isAdmin: false,
      isHR: false,
      isDeptManager: true,
      isEmployee: false,
      can: (perm) => ['employee.view', 'department.view', 'attendance.view', 'leave.view'].includes(perm),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Departments')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Employees')[0]).toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted Archive')).not.toBeInTheDocument();
    expect(screen.getByText('Dept Manager')).toBeInTheDocument();
  });

  it('Sidebar: Regular Employee sees My Profile and Attendance/Leaves only', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 4, name: 'John Doe', email: 'john@company.com', role: 'employee', employee_id: 10, permissions: [] },
      isAdmin: false,
      isHR: false,
      isDeptManager: false,
      isEmployee: true,
      can: () => false,
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('My Profile')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Attendance')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Leaves')[0]).toBeInTheDocument();
    expect(screen.queryByText('Departments')).not.toBeInTheDocument();
    expect(screen.queryByText('Employees')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted Archive')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  // ==========================================
  // 2. EmployeeList Action Visibility by Permissions
  // ==========================================
  it('EmployeeList: Department Manager does NOT see Add Employee, Import, Export, Deleted Archive, or Delete buttons', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 3, name: 'Dept Manager', email: 'dm@company.com', role: 'department_manager', department_id: 1, permissions: ['employee.view', 'employee.update'] },
      isAdmin: false,
      isHR: false,
      isDeptManager: true,
      isEmployee: false,
      can: (perm) => ['employee.view', 'employee.update'].includes(perm),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    // Header action restrictions
    expect(screen.queryByText(/add employee/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import csv/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deleted archive/i)).not.toBeInTheDocument();

    // Department filter select is disabled / locked
    const deptSelect = screen.getByTitle(/department locked to your assigned department/i);
    expect(deptSelect).toBeDisabled();

    // Table action restrictions: Edit is allowed, but Delete is hidden
    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  // ==========================================
  // 3. ProtectedRoute Authorization Guards
  // ==========================================
  it('ProtectedRoute: redirects unauthorized role to fallback', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 4, name: 'Regular Employee', email: 'emp@test.com', role: 'employee', employee_id: 10 },
      isAuthenticated: true,
      loading: false,
      can: () => false,
    });

    render(
      <MemoryRouter initialEntries={['/admin-only']}>
        <Routes>
          <Route
            path="/admin-only"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div>Admin Secret Panel</div>
              </ProtectedRoute>
            }
          />
          <Route path="/employees/10" element={<div>Employee Profile Fallback</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Secret Panel')).not.toBeInTheDocument();
    expect(screen.getByText('Employee Profile Fallback')).toBeInTheDocument();
  });
});
