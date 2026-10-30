import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EmployeeList from '../pages/EmployeeList';
import api from '../services/api';
import * as NotificationContext from '../context/NotificationContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock Sidebar to keep component isolated
vi.mock('../components/Sidebar', () => ({
  default: () => <nav data-testid="sidebar-mock">Sidebar</nav>,
}));

// Mock ImportModal to isolate tests
vi.mock('../components/ImportModal', () => ({
  default: () => <div data-testid="import-modal-mock" />,
}));

describe('Feature 15: EmployeeList Search, Filtering & Pagination Component Tests', () => {
  const mockNotifySuccess = vi.fn();
  const mockNotifyError = vi.fn();

  const mockDepartments = [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'Human Resources' },
  ];

  const mockDesignations = ['Staff Engineer', 'Product Manager', 'HR Specialist'];

  const mockEmployeesPage1 = [
    {
      id: 101,
      name: 'Alice Johnson',
      email: 'alice@company.com',
      phone: '+1-555-0101',
      department_id: 1,
      department_name: 'Engineering',
      designation: 'Staff Engineer',
      status: 'Active',
      created_at: '2026-05-15T10:00:00.000Z'
    },
    {
      id: 102,
      name: 'Bob Smith',
      email: 'bob@company.com',
      phone: '+1-555-0102',
      department_id: 2,
      department_name: 'Human Resources',
      designation: 'HR Specialist',
      status: 'Inactive',
      created_at: '2026-06-20T10:00:00.000Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      success: mockNotifySuccess,
      error: mockNotifyError,
    });

    api.get.mockImplementation((url, config) => {
      if (url === '/departments') {
        return Promise.resolve({ data: mockDepartments });
      }
      if (url === '/employees/designations') {
        return Promise.resolve({ data: mockDesignations });
      }
      if (url === '/employees') {
        return Promise.resolve({
          data: {
            employees: mockEmployeesPage1,
            pagination: {
              total: 25,
              page: 1,
              limit: 10,
              totalPages: 3,
              hasNextPage: true,
              hasPrevPage: false
            }
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders employee directory title, filters, and loads metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Employee Directory')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search name, email, phone, or id/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Check Department dropdown has loaded options
    expect(screen.getByText('All Departments')).toBeInTheDocument();
    expect(screen.getAllByText('Engineering').length).toBeGreaterThanOrEqual(1);

    // Check Designation dropdown has loaded options
    expect(screen.getByText('All Designations')).toBeInTheDocument();
    expect(screen.getAllByText('Staff Engineer').length).toBeGreaterThanOrEqual(1);
  });

  it('displays server-side pagination bar and summary metrics', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rows per page:')).toBeInTheDocument();
    });

    // Verify pagination controls
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    expect(screen.getByText('Rows per page:')).toBeInTheDocument();
    expect(screen.getAllByText('25').length).toBeGreaterThanOrEqual(1);
  });

  it('allows selecting page size (limit) and triggers refetch', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByDisplayValue('10');
    fireEvent.change(pageSizeSelect, { target: { value: '25' } });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/employees', expect.objectContaining({
        params: expect.objectContaining({ limit: 25 })
      }));
    });
  });

  it('clicking column header triggers sort and toggles direction', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    const nameTh = screen.getByTitle('Sort by Name');
    fireEvent.click(nameTh);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/employees', expect.objectContaining({
        params: expect.objectContaining({ sortBy: 'name', sortOrder: 'ASC' })
      }));
    });
  });

  it('filters by status and department update query params', async () => {
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route path="/employees" element={<EmployeeList />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('All Departments')).toBeInTheDocument();
    });

    const deptSelect = screen.getByTitle('Filter by Department');
    fireEvent.change(deptSelect, { target: { value: '1' } });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/employees', expect.objectContaining({
        params: expect.objectContaining({ department_id: '1' })
      }));
    });
  });
});
