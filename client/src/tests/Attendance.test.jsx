import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Attendance from '../pages/Attendance';
import api from '../services/api';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../components/Sidebar', () => ({
  default: () => <nav data-testid="sidebar-mock">Sidebar</nav>,
}));

describe('Feature 16: Employee Attendance Management Component Tests', () => {
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
    department_id: 1,
  };

  const mockDepartments = [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'Human Resources' },
  ];

  const mockTodayStatusNotCheckedIn = {
    hasCheckedIn: false,
    hasCheckedOut: false,
    record: null,
    employeeId: 2,
  };

  const mockTodayStatusCheckedIn = {
    hasCheckedIn: true,
    hasCheckedOut: false,
    record: {
      id: 50,
      employee_id: 2,
      date: '2026-10-29',
      check_in: '2026-10-29 09:05:00',
      check_out: null,
      status: 'Present',
      is_late: false,
      worked_hours: 3.5,
    },
    employeeId: 2,
  };

  const mockLogsResponse = {
    records: [
      {
        id: 10,
        employee_id: 2,
        employee_name: 'Muhammad Humdan',
        employee_code: 'EMP-0002',
        department_name: 'Engineering',
        date: '2026-10-29',
        check_in: '2026-10-29 09:00:00',
        check_out: '2026-10-29 17:00:00',
        status: 'Present',
        is_late: false,
        total_hours: 8.0,
        is_corrected: false,
      },
    ],
    pagination: {
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };

  const mockCorrectionsResponse = {
    corrections: [
      {
        id: 77,
        attendance_id: 10,
        employee_id: 2,
        employee_name: 'Muhammad Humdan',
        department_name: 'Engineering',
        date: '2026-10-28',
        original_check_in: '2026-10-28 09:45:00',
        original_check_out: '2026-10-28 17:00:00',
        requested_check_in: '2026-10-28 09:00:00',
        requested_check_out: '2026-10-28 17:00:00',
        reason: 'Office biometrics machine failed to scan at entrance',
        status: 'PENDING',
        created_at: '2026-10-28 18:00:00',
      },
    ],
  };

  const mockMonthlyReportResponse = {
    report: [
      {
        employee_id: 2,
        employee_name: 'Muhammad Humdan',
        employee_code: 'EMP-0002',
        department_name: 'Engineering',
        designation: 'Software Engineer',
        days_present: 22,
        days_late: 1,
        days_half_day: 0,
        total_hours_worked: 176.5,
        avg_hours_per_day: 8.02,
      },
    ],
    summary: {
      totalEmployees: 1,
      totalPresentDays: 22,
      totalLateDays: 1,
      totalHalfDays: 0,
      totalHours: 176.5,
    },
  };

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

    api.get.mockImplementation((url, config) => {
      if (url === '/departments') {
        return Promise.resolve({ data: mockDepartments });
      }
      if (url === '/attendance/today') {
        return Promise.resolve({ data: mockTodayStatusNotCheckedIn });
      }
      if (url === '/attendance/history') {
        return Promise.resolve({ data: mockLogsResponse });
      }
      if (url === '/attendance/corrections') {
        return Promise.resolve({ data: mockCorrectionsResponse });
      }
      if (url === '/attendance/report/monthly') {
        return Promise.resolve({ data: mockMonthlyReportResponse });
      }
      return Promise.resolve({ data: {} });
    });

    api.post.mockResolvedValue({ data: { message: 'Action completed successfully' } });
    api.patch.mockResolvedValue({ data: { message: 'Updated successfully' } });
  });

  it('renders Attendance dashboard with live punch card and logs tab', async () => {
    render(
      <MemoryRouter initialEntries={['/attendance']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Employee Attendance Management/i })).toBeInTheDocument();
    expect(screen.getByText(/Today's Punch Status/i)).toBeInTheDocument();

    // Check In button should be present when employee has not checked in
    const checkInBtn = screen.getByRole('button', { name: /^Check In$/i });
    expect(checkInBtn).toBeInTheDocument();
    expect(checkInBtn).not.toBeDisabled();

    // Attendance logs should be rendered in the table
    await waitFor(() => {
      expect(screen.getByText('Muhammad Humdan')).toBeInTheDocument();
    });
  });

  it('handles Check-In action and displays notification', async () => {
    render(
      <MemoryRouter initialEntries={['/attendance']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    const checkInBtn = screen.getByRole('button', { name: /^Check In$/i });
    fireEvent.click(checkInBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/attendance/check-in', {});
      expect(mockNotifySuccess).toHaveBeenCalledWith('Action completed successfully');
    });
  });

  it('renders Check-Out button enabled when checked in, and handles checkout click', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/departments') return Promise.resolve({ data: mockDepartments });
      if (url === '/attendance/today') return Promise.resolve({ data: mockTodayStatusCheckedIn });
      if (url === '/attendance/history') return Promise.resolve({ data: mockLogsResponse });
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter initialEntries={['/attendance']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const checkOutBtn = screen.getByRole('button', { name: /^Check Out$/i });
      expect(checkOutBtn).toBeInTheDocument();
      expect(checkOutBtn).not.toBeDisabled();

      fireEvent.click(checkOutBtn);
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/attendance/check-out', {});
      expect(mockNotifySuccess).toHaveBeenCalledWith('Action completed successfully');
    });
  });

  it('switches to Corrections tab and allows opening correction modal', async () => {
    render(
      <MemoryRouter initialEntries={['/attendance?tab=corrections']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Correction Requests/i })).toBeInTheDocument();
      expect(screen.getByText(/Office biometrics machine failed to scan at entrance/i)).toBeInTheDocument();
    });

    // Employee sees "Submit Correction Request" button
    const requestBtn = screen.getByRole('button', { name: /Submit Correction Request/i });
    expect(requestBtn).toBeInTheDocument();
    fireEvent.click(requestBtn);

    // Modal opens
    expect(screen.getByRole('heading', { level: 3, name: /Request Attendance Correction/i })).toBeInTheDocument();
    expect(screen.getByText(/Target Date \*/i)).toBeInTheDocument();
  });

  it('switches to Monthly Report tab and renders summary metrics and employee breakdown', async () => {
    render(
      <MemoryRouter initialEntries={['/attendance?tab=report']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Total Days Present')).toBeInTheDocument();
      expect(screen.getByText('176.5h')).toBeInTheDocument();
      expect(screen.getByText('Muhammad Humdan')).toBeInTheDocument();
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });
  });

  it('admin sees Approve and Reject buttons on correction requests and can approve or reject', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
    });

    render(
      <MemoryRouter initialEntries={['/attendance?tab=corrections']}>
        <Routes>
          <Route path="/attendance" element={<Attendance />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Approve$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Reject$/i })).toBeInTheDocument();
    });

    // Test approve click
    const approveBtn = screen.getByRole('button', { name: /^Approve$/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/attendance/corrections/77/approve');
      expect(mockNotifySuccess).toHaveBeenCalledWith('Updated successfully');
    });

    // Test reject modal
    const rejectBtn = screen.getByRole('button', { name: /^Reject$/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByRole('heading', { level: 3, name: /Reject Attendance Correction/i })).toBeInTheDocument();
    const reasonInput = screen.getByPlaceholderText(/e\.g\. Timestamps could not be verified/i);
    fireEvent.change(reasonInput, { target: { value: 'Badge swipe logs do not match' } });

    const confirmRejectBtn = screen.getByRole('button', { name: /^Reject Correction$/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/attendance/corrections/77/reject', {
        rejection_reason: 'Badge swipe logs do not match',
      });
      expect(mockNotifySuccess).toHaveBeenCalledWith('Updated successfully');
    });
  });
});
