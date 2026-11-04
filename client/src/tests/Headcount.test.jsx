import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Headcount from '../pages/Headcount';
import { calculateHeadcountStatus } from '../utils/headcount';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';
import api from '../services/api';

vi.mock('../services/api');

describe('Workforce Headcount vs. Approved Headcount Frontend Tests', () => {
  const mockSuccess = vi.fn();
  const mockError = vi.fn();

  const mockDepartmentData = [
    {
      id: 1,
      name: 'Engineering',
      approved: 10,
      current: 7,
      gap: 3,
      status: 'Needs Hiring',
    },
    {
      id: 2,
      name: 'Sales',
      approved: 5,
      current: 5,
      gap: 0,
      status: 'Balanced',
    },
    {
      id: 3,
      name: 'Marketing',
      approved: 3,
      current: 5,
      gap: -2,
      status: 'Overstaffed - Review',
    },
    {
      id: 4,
      name: 'Unassigned Research',
      approved: 0,
      current: 0,
      gap: 0,
      status: 'Not Set',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      success: mockSuccess,
      error: mockError,
      notifications: [],
      unreadCount: 0,
    });
  });

  describe('1. Status Logic Unit Tests', () => {
    it('returns "Not Set" when approved = 0 (current = 0)', () => {
      expect(calculateHeadcountStatus(0, 0)).toBe('Not Set');
    });

    it('returns "Not Set" when approved = 0 even if current > 0', () => {
      expect(calculateHeadcountStatus(0, 4)).toBe('Not Set');
    });

    it('returns "Needs Hiring" when gap > 0 (approved > current)', () => {
      expect(calculateHeadcountStatus(12, 8)).toBe('Needs Hiring');
    });

    it('returns "Balanced" when gap = 0 (approved === current)', () => {
      expect(calculateHeadcountStatus(6, 6)).toBe('Balanced');
    });

    it('returns "Overstaffed - Review" when gap < 0 (approved < current)', () => {
      expect(calculateHeadcountStatus(4, 6)).toBe('Overstaffed - Review');
    });
  });

  describe('2. Table Rendering & Colored Status Badges', () => {
    beforeEach(() => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: { id: 1, name: 'Admin User', role: 'admin' },
        isAdmin: true,
        isHR: false,
        isDeptManager: false,
        isEmployee: false,
      });

      api.get.mockResolvedValue({ data: mockDepartmentData });
    });

    it('renders page header, metric cards, and table headers', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      expect(screen.getByText('Headcount vs. Approved Headcount')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Approved Target')).toBeInTheDocument();
        expect(screen.getByText('Active Staff')).toBeInTheDocument();
      });

      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
      expect(screen.getByText('Unassigned Research')).toBeInTheDocument();
    });

    it('renders colored status badges for all distinct statuses', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status-badge-needs-hiring')).toBeInTheDocument();
        expect(screen.getByTestId('status-badge-balanced')).toBeInTheDocument();
        expect(screen.getByTestId('status-badge-overstaffed')).toBeInTheDocument();
        expect(screen.getByTestId('status-badge-not-set')).toBeInTheDocument();
      });

      expect(screen.getByTestId('status-badge-needs-hiring')).toHaveTextContent('Needs Hiring');
      expect(screen.getByTestId('status-badge-balanced')).toHaveTextContent('Balanced');
      expect(screen.getByTestId('status-badge-overstaffed')).toHaveTextContent('Overstaffed - Review');
      expect(screen.getByTestId('status-badge-not-set')).toHaveTextContent('Not Set');
    });

    it('renders current employee count with link and gap values', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-val-1')).toHaveTextContent('7');
        expect(screen.getByTestId('gap-val-1')).toHaveTextContent('+3');
        expect(screen.getByTestId('gap-val-2')).toHaveTextContent('0');
        expect(screen.getByTestId('gap-val-3')).toHaveTextContent('-2');
      });
    });
  });

  describe('3. Inline Edit Flow for Admin / HR Manager', () => {
    beforeEach(() => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: { id: 1, name: 'Admin User', role: 'admin' },
        isAdmin: true,
        isHR: false,
        isDeptManager: false,
        isEmployee: false,
      });

      api.get.mockResolvedValue({ data: mockDepartmentData });
    });

    it('allows Admin to click edit, change approved headcount, and submit via PUT', async () => {
      api.put.mockResolvedValue({
        data: {
          message: 'Approved headcount updated successfully!',
          department: { id: 1, name: 'Engineering', approved_headcount: 15 },
        },
      });

      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('inline-edit-btn-1')).toBeInTheDocument();
      });

      // Click inline edit
      fireEvent.click(screen.getByTestId('inline-edit-btn-1'));

      const input = screen.getByTestId('inline-input-1');
      expect(input).toBeInTheDocument();
      expect(input.value).toBe('10');

      // Change value to 15
      fireEvent.change(input, { target: { value: '15' } });

      // Click save
      fireEvent.click(screen.getByTestId('inline-save-1'));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/departments/1/approved-headcount', {
          approved_headcount: 15,
        });
        expect(mockSuccess).toHaveBeenCalledWith('Approved headcount updated successfully!');
      });

      // After save, UI updates approved count to 15 and gap to 15 - 7 = 8
      await waitFor(() => {
        expect(screen.getByTestId('approved-val-1')).toHaveTextContent('15');
        expect(screen.getByTestId('gap-val-1')).toHaveTextContent('+8');
      });
    });

    it('validates against negative numbers on inline edit', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('inline-edit-btn-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inline-edit-btn-1'));
      const input = screen.getByTestId('inline-input-1');

      fireEvent.change(input, { target: { value: '-4' } });
      fireEvent.click(screen.getByTestId('inline-save-1'));

      expect(screen.getByText(/Must be an integer ≥ 0/i)).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('cancels inline edit and restores previous view when cancel button clicked', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('inline-edit-btn-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inline-edit-btn-1'));
      expect(screen.getByTestId('inline-input-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('inline-cancel-1'));
      expect(screen.queryByTestId('inline-input-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('approved-val-1')).toHaveTextContent('10');
    });
  });

  describe('4. Role-Based Access Controls', () => {
    it('Department Manager sees own department only and has NO edit buttons', async () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: { id: 29, name: 'Eng Manager', role: 'department_manager', department_id: 1 },
        isAdmin: false,
        isHR: false,
        isDeptManager: true,
        isEmployee: false,
      });

      api.get.mockResolvedValue({
        data: [
          {
            id: 1,
            name: 'Engineering',
            approved: 10,
            current: 7,
            gap: 3,
            status: 'Needs Hiring',
          },
        ],
      });

      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Engineering')).toBeInTheDocument();
        expect(screen.queryByText('Sales')).not.toBeInTheDocument();
      });

      // No inline edit buttons should be rendered for Department Manager
      expect(screen.queryByTestId('inline-edit-btn-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-edit-btn-1')).not.toBeInTheDocument();
      expect(screen.getByText(/Department Manager \(View Only\)/i)).toBeInTheDocument();
    });

    it('Regular Employee has no access and sees access denied banner', () => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: { id: 2, name: 'Normal Employee', role: 'employee' },
        isAdmin: false,
        isHR: false,
        isDeptManager: false,
        isEmployee: true,
      });

      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      expect(screen.getByTestId('headcount-access-denied')).toBeInTheDocument();
      expect(screen.getByText(/regular employees do not have permission/i)).toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe('5. Status and Search Filtering', () => {
    beforeEach(() => {
      vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: { id: 1, name: 'Admin User', role: 'admin' },
        isAdmin: true,
        isHR: false,
        isDeptManager: false,
        isEmployee: false,
      });

      api.get.mockResolvedValue({ data: mockDepartmentData });
    });

    it('filters departments by search input', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Engineering')).toBeInTheDocument();
        expect(screen.getByText('Sales')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search departments...');
      fireEvent.change(searchInput, { target: { value: 'Market' } });

      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
      expect(screen.queryByText('Sales')).not.toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });

    it('filters departments by status pill', async () => {
      render(
        <MemoryRouter>
          <Headcount />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Engineering')).toBeInTheDocument();
      });

      // Click "Needs Hiring" status pill
      const needsHiringPill = screen.getByRole('button', { name: 'Needs Hiring' });
      fireEvent.click(needsHiringPill);

      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.queryByText('Sales')).not.toBeInTheDocument();
      expect(screen.queryByText('Marketing')).not.toBeInTheDocument();
    });
  });
});

