import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Shifts from '../pages/Shifts';
import api from '../services/api';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../components/Sidebar', () => ({
  default: () => <nav data-testid="sidebar-mock">Sidebar</nav>,
}));

describe('Feature: Advanced Shift Management UI Component Tests', () => {
  const mockNotifySuccess = vi.fn();
  const mockNotifyError = vi.fn();

  const mockAdminUser = {
    id: 1,
    name: 'Admin User',
    role: 'admin',
    department_id: null,
  };

  const mockEmployeeUser = {
    id: 2,
    name: 'Standard Employee',
    role: 'employee',
    department_id: 1,
  };

  const mockShifts = [
    {
      id: 1,
      name: 'General Morning Shift',
      type: 'morning',
      start_time: '09:00:00',
      end_time: '17:00:00',
      grace_minutes: 15,
      break_minutes: 60,
      min_working_minutes: 480,
      is_active: 1,
      is_default: 1,
      crosses_midnight: false,
      can_delete: false,
    },
    {
      id: 2,
      name: 'Overnight Night Shift',
      type: 'night',
      start_time: '22:00:00',
      end_time: '06:00:00',
      grace_minutes: 15,
      break_minutes: 30,
      min_working_minutes: 480,
      is_active: 1,
      is_default: 0,
      crosses_midnight: true,
      can_delete: false,
    },
    {
      id: 3,
      name: 'Flexible Core Hours',
      type: 'flexible',
      start_time: null,
      end_time: null,
      grace_minutes: 0,
      break_minutes: 60,
      min_working_minutes: 480,
      is_active: 1,
      is_default: 0,
      crosses_midnight: false,
      can_delete: true,
    },
  ];

  const mockRotations = [
    {
      id: 1,
      name: 'Standard 3-Week Cycle',
      description: 'Week 1 Morning, Week 2 Evening, Week 3 Night',
      steps: [
        { id: 1, week_number: 1, shift_id: 1, shift_name: 'General Morning Shift', shift_type: 'morning' },
        { id: 2, week_number: 2, shift_id: 2, shift_name: 'Overnight Night Shift', shift_type: 'night' },
      ],
    },
  ];

  const mockDepartments = [
    { id: 1, name: 'Engineering', employee_count: 5 },
    { id: 2, name: 'Operations', employee_count: 8 },
  ];

  const mockEmployees = [
    { id: 10, name: 'Alice Walker', designation: 'DevOps Lead', department_name: 'Engineering' },
    { id: 11, name: 'Bob Smith', designation: 'Frontend Dev', department_name: 'Engineering' },
  ];

  const mockSchedule = {
    start_date: '2026-11-16',
    end_date: '2026-11-22',
    days: [
      { date: '2026-11-16', day_of_week: 'Mon', day_number: 16, is_today: false },
      { date: '2026-11-17', day_of_week: 'Tue', day_number: 17, is_today: false },
      { date: '2026-11-18', day_of_week: 'Wed', day_number: 18, is_today: false },
      { date: '2026-11-19', day_of_week: 'Thu', day_number: 19, is_today: false },
      { date: '2026-11-20', day_of_week: 'Fri', day_number: 20, is_today: true },
      { date: '2026-11-21', day_of_week: 'Sat', day_number: 21, is_today: false },
      { date: '2026-11-22', day_of_week: 'Sun', day_number: 22, is_today: false },
    ],
    employees: [
      {
        employee_id: 10,
        employee_name: 'Alice Walker',
        designation: 'DevOps Lead',
        department_name: 'Engineering',
        schedule: {
          '2026-11-20': {
            id: 2,
            name: 'Overnight Night Shift',
            type: 'night',
            start_time: '22:00:00',
            end_time: '06:00:00',
            crosses_midnight: true,
            source: 'assignment',
          },
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      success: mockNotifySuccess,
      error: mockNotifyError,
    });
  });

  it('renders Shifts page with table, type badges, and actions for Admin', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      isHR: false,
      isDeptManager: false,
      isEmployee: false,
    });

    api.get.mockImplementation((url) => {
      if (url === '/shifts') return Promise.resolve({ data: mockShifts });
      if (url === '/shifts/rotations/all') return Promise.resolve({ data: mockRotations });
      if (url === '/departments') return Promise.resolve({ data: mockDepartments });
      if (url.startsWith('/employees')) return Promise.resolve({ data: { employees: mockEmployees } });
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    render(
      <MemoryRouter initialEntries={['/shifts']}>
        <Shifts />
      </MemoryRouter>
    );

    // Verify Title and Admin Control badge
    expect(screen.getByText('Advanced Shift Management')).toBeInTheDocument();
    expect(screen.getByText('Admin / HR Control')).toBeInTheDocument();

    // Verify Action Buttons are visible for Admin
    expect(screen.getByRole('button', { name: /Create Shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Rotation/i })).toBeInTheDocument();

    // Verify Shifts rendered in table
    await waitFor(() => {
      expect(screen.getAllByText('General Morning Shift').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Overnight Night Shift').length).toBeGreaterThan(0);
      expect(screen.getByText('Flexible Core Hours')).toBeInTheDocument();
    });

    // Verify Crosses Midnight marker is rendered for night shift
    expect(screen.getByText(/Crosses Midnight \(\+1d\)/i)).toBeInTheDocument();

    // Verify Default Shift indicator
    expect(screen.getByText('Default System Shift')).toBeInTheDocument();
  });

  it('renders Weekly Schedule view with 7 days and night shift blocks', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      isHR: false,
      isDeptManager: false,
      isEmployee: false,
    });

    api.get.mockImplementation((url) => {
      if (url === '/shifts') return Promise.resolve({ data: mockShifts });
      if (url === '/shifts/rotations/all') return Promise.resolve({ data: mockRotations });
      if (url === '/departments') return Promise.resolve({ data: mockDepartments });
      if (url.startsWith('/employees')) return Promise.resolve({ data: { employees: mockEmployees } });
      if (url.startsWith('/shifts/schedule')) return Promise.resolve({ data: mockSchedule });
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    render(
      <MemoryRouter initialEntries={['/shifts?tab=schedule']}>
        <Shifts />
      </MemoryRouter>
    );

    // Verify Employee in grid
    await waitFor(() => {
      expect(screen.getByText('Alice Walker')).toBeInTheDocument();
      expect(screen.getByText(/DevOps Lead/)).toBeInTheDocument();
    });

    // Verify 7 day columns exist (Fri / 20)
    expect(screen.getByText(/Fri/i)).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('hides administrative create and assign buttons for standard Employee role', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: mockEmployeeUser,
      isAdmin: false,
      isHR: false,
      isDeptManager: false,
      isEmployee: true,
    });

    api.get.mockImplementation((url) => {
      if (url === '/shifts') return Promise.resolve({ data: mockShifts });
      if (url === '/shifts/rotations/all') return Promise.resolve({ data: mockRotations });
      if (url === '/departments') return Promise.resolve({ data: mockDepartments });
      if (url.startsWith('/employees')) return Promise.resolve({ data: { employees: mockEmployees } });
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    render(
      <MemoryRouter initialEntries={['/shifts']}>
        <Shifts />
      </MemoryRouter>
    );

    expect(screen.getByText('Employee Schedule')).toBeInTheDocument();

    // Admin buttons should not be in the document
    expect(screen.queryByRole('button', { name: /Create Shift/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Rotation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assign Shifts/i })).not.toBeInTheDocument();
  });
});
