import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Leaves from '../pages/Leaves';
import api from '../services/api';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../components/Sidebar', () => ({
  default: () => <nav data-testid="sidebar-mock">Sidebar</nav>,
}));

describe('Feature 17: Leave Request & Approval Workflow Component Tests', () => {
  const mockNotifySuccess = vi.fn();
  const mockNotifyError = vi.fn();

  const mockAdminUser = {
    id: 1,
    name: 'Admin User',
    email: 'admin@company.com',
    role: 'admin',
    department_id: null,
  };

  const mockEmployeeUser = {
    id: 2,
    name: 'Muhammad Humdan',
    email: 'muhammadhumdan43@gmail.com',
    role: 'employee',
    employee_id: 2,
    department_id: 1,
  };

  const mockDepartments = [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'Human Resources' },
  ];

  const mockBalances = {
    employeeId: 2,
    year: 2026,
    annual: { total: 15, used: 3, remaining: 12 },
    sick: { total: 10, used: 0, remaining: 10 },
    casual: { total: 5, used: 1, remaining: 4 },
    totalAllocated: 30,
    totalUsed: 4,
    totalRemaining: 26,
  };

  const mockRequests = [
    {
      id: 101,
      employee_id: 2,
      employee_name: 'Muhammad Humdan',
      employee_code: 'EMP-0002',
      department_name: 'Engineering',
      leave_type: 'Annual',
      start_date: '2026-11-02',
      end_date: '2026-11-04',
      days_count: 3,
      reason: 'Family holiday trip',
      status: 'PENDING',
      reviewer_name: null,
      rejection_reason: null,
      created_at: '2026-10-29T10:00:00Z',
    },
    {
      id: 102,
      employee_id: 2,
      employee_name: 'Muhammad Humdan',
      employee_code: 'EMP-0002',
      department_name: 'Engineering',
      leave_type: 'Sick',
      start_date: '2026-10-15',
      end_date: '2026-10-16',
      days_count: 2,
      reason: 'Flu symptoms',
      status: 'APPROVED',
      reviewer_name: 'Admin User',
      rejection_reason: null,
      created_at: '2026-10-14T08:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      success: mockNotifySuccess,
      error: mockNotifyError,
    });
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockEmployeeUser,
      isAdmin: false,
    });
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    api.get.mockImplementation((url) => {
      if (url === '/departments') return Promise.resolve({ data: mockDepartments });
      if (url === '/leaves/balances') return Promise.resolve({ data: mockBalances });
      if (url === '/leaves/requests') {
        return Promise.resolve({
          data: {
            requests: mockRequests,
            pagination: {
              total: 2,
              page: 1,
              limit: 10,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    api.post.mockResolvedValue({ data: { message: 'Leave request submitted successfully!' } });
    api.patch.mockResolvedValue({ data: { message: 'Updated successfully!' } });
    api.delete.mockResolvedValue({ data: { message: 'Leave request cancelled.' } });
  });

  it('renders Leave Management dashboard with balance cards and requests table', async () => {
    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Leave Management & Approvals/i })).toBeInTheDocument();

    // Balance cards
    await waitFor(() => {
      const annualElements = screen.getAllByText('Annual Leave');
      expect(annualElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Total Remaining Allowance')).toBeInTheDocument();
      expect(screen.getByText(/days available/i)).toBeInTheDocument();
    });

    // Requests table rows
    await waitFor(() => {
      expect(screen.getByText('Family holiday trip')).toBeInTheDocument();
      expect(screen.getByText('Flu symptoms')).toBeInTheDocument();
    });
  });

  it('opens Request Time Off modal and calculates dynamic duration as dates change', async () => {
    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for balances to load
    await screen.findByText('Total Remaining Allowance');

    const openBtn = screen.getByRole('button', { name: /Request Leave/i });
    fireEvent.click(openBtn);

    expect(screen.getByRole('heading', { level: 3, name: /Request Time Off/i })).toBeInTheDocument();
    expect(await screen.findByText(/12 day\(s\) available/i)).toBeInTheDocument();

    // Fill dates
    const startDateInput = screen.getByLabelText(/Start Date \*/i);
    const endDateInput = screen.getByLabelText(/End Date \*/i);

    fireEvent.change(startDateInput, { target: { value: '2026-11-10' } });
    fireEvent.change(endDateInput, { target: { value: '2026-11-12' } });

    // Live duration calculation banner should show 3 days
    await waitFor(() => {
      expect(screen.getByText(/Total Duration:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/3 days/i).length).toBeGreaterThanOrEqual(2);
    });

    // Fill reason
    const reasonInput = screen.getByPlaceholderText(/Provide a brief explanation/i);
    fireEvent.change(reasonInput, { target: { value: 'Annual family road trip' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/leaves/requests', expect.objectContaining({
        leave_type: 'Annual',
        start_date: '2026-11-10',
        end_date: '2026-11-12',
        reason: 'Annual family road trip',
      }));
      expect(mockNotifySuccess).toHaveBeenCalledWith('Leave request submitted successfully!');
    });
  });

  it('allows employee to cancel their own pending leave request', async () => {
    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Family holiday trip')).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/leaves/requests/101');
      expect(mockNotifySuccess).toHaveBeenCalledWith('Leave request cancelled.');
    });
  });

  it('admin sees Approve and Reject buttons for pending requests and can approve', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
    });

    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    const approveBtn = await screen.findByRole('button', { name: /^Approve$/i });
    expect(approveBtn).toBeInTheDocument();
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/leaves/requests/101/approve');
      expect(mockNotifySuccess).toHaveBeenCalledWith('Updated successfully!');
    });
  });

  it('admin can reject a pending request with a specified reason', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
    });

    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    const rejectBtn = await screen.findByRole('button', { name: /^Reject$/i });
    expect(rejectBtn).toBeInTheDocument();
    fireEvent.click(rejectBtn);

    // Reject Modal opens
    const modalHeading = await screen.findByRole('heading', { level: 3, name: /Reject Leave Request/i });
    expect(modalHeading).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/Critical release milestone/i);
    fireEvent.change(reasonInput, { target: { value: 'Understaffed during upcoming quarterly release' } });

    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/leaves/requests/101/reject', {
        rejection_reason: 'Understaffed during upcoming quarterly release',
      });
      expect(mockNotifySuccess).toHaveBeenCalledWith('Updated successfully!');
    });
  });

  it('updates request list when filtering by status pills', async () => {
    render(
      <MemoryRouter initialEntries={['/leaves']}>
        <Routes>
          <Route path="/leaves" element={<Leaves />} />
        </Routes>
      </MemoryRouter>
    );

    const pendingPill = screen.getByRole('button', { name: /^Pending$/i });
    fireEvent.click(pendingPill);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/leaves/requests', expect.objectContaining({
        params: expect.objectContaining({ status: 'PENDING' }),
      }));
    });
  });
});
