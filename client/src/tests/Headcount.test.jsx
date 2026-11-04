import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Headcount from '../pages/Headcount';
import { calculateHeadcountStatus, calculateAttrition, calculateOvertime, calculateLeavePressure } from '../utils/headcount';
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

  const mockAttritionData = [
    {
      id: 1,
      name: 'Engineering',
      leavers: 1,
      current: 7,
      attritionRate: 14.3,
      status: 'Medium',
    },
    {
      id: 2,
      name: 'Sales',
      leavers: 0,
      current: 5,
      attritionRate: 0,
      status: 'Low',
    },
    {
      id: 3,
      name: 'Marketing',
      leavers: 2,
      current: 5,
      attritionRate: 40,
      status: 'High',
    },
    {
      id: 4,
      name: 'Unassigned Research',
      leavers: 0,
      current: 0,
      attritionRate: 0,
      status: 'Low',
    },
  ];

  const mockOvertimeData = [
    {
      id: 1,
      name: 'Engineering',
      attendanceDays: 20,
      avgDailyHours: 8.6,
      overtimePercent: 7.5,
      status: 'High',
    },
    {
      id: 2,
      name: 'Sales',
      attendanceDays: 15,
      avgDailyHours: 9.4,
      overtimePercent: 17.5,
      status: 'Very High',
    },
    {
      id: 3,
      name: 'Marketing',
      attendanceDays: 12,
      avgDailyHours: 8.2,
      overtimePercent: 2.5,
      status: 'Normal',
    },
    {
      id: 4,
      name: 'Unassigned Research',
      attendanceDays: 0,
      avgDailyHours: 0,
      overtimePercent: 0,
      status: 'No Data',
    },
  ];

  const mockLeaveData = [
    {
      id: 1,
      name: 'Engineering',
      activeHeadcount: 7,
      totalLeaveDays: 7,
      avgOnLeave: 0.3,
      leavePressure: 4.3,
      status: 'Low',
    },
    {
      id: 2,
      name: 'Sales',
      activeHeadcount: 5,
      totalLeaveDays: 10,
      avgOnLeave: 0.4,
      leavePressure: 8.0,
      status: 'Medium',
    },
    {
      id: 3,
      name: 'Marketing',
      activeHeadcount: 5,
      totalLeaveDays: 20,
      avgOnLeave: 0.8,
      leavePressure: 16.0,
      status: 'High',
    },
    {
      id: 4,
      name: 'Unassigned Research',
      activeHeadcount: 0,
      totalLeaveDays: 0,
      avgOnLeave: 0,
      leavePressure: 0,
      status: 'Low',
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

  describe('6. Attrition Rate & Status Logic and Period Selector', () => {
    describe('Unit Tests for calculateAttrition', () => {
      it('returns rate 0 and status "Low" when current headcount is 0 (even if leavers > 0)', () => {
        expect(calculateAttrition(0, 0)).toEqual({ attritionRate: 0, status: 'Low' });
        expect(calculateAttrition(3, 0)).toEqual({ attritionRate: 0, status: 'Low' });
      });

      it('returns rate 0 and status "Low" when leavers = 0', () => {
        expect(calculateAttrition(0, 15)).toEqual({ attritionRate: 0, status: 'Low' });
      });

      it('returns status "Low" when attrition rate is under 10%', () => {
        const result = calculateAttrition(1, 20); // 5%
        expect(result.attritionRate).toBe(5);
        expect(result.status).toBe('Low');
      });

      it('returns status "Medium" when attrition rate is between 10% and 20% inclusive', () => {
        const result10 = calculateAttrition(1, 10); // 10%
        expect(result10.attritionRate).toBe(10);
        expect(result10.status).toBe('Medium');

        const result20 = calculateAttrition(2, 10); // 20%
        expect(result20.attritionRate).toBe(20);
        expect(result20.status).toBe('Medium');

        const result14 = calculateAttrition(1, 7); // ~14.3%
        expect(result14.attritionRate).toBe(14.3);
        expect(result14.status).toBe('Medium');
      });

      it('returns status "High" when attrition rate is over 20%', () => {
        const result = calculateAttrition(3, 10); // 30%
        expect(result.attritionRate).toBe(30);
        expect(result.status).toBe('High');
      });

      it('recalculates attrition rate dynamically when approved target is increased', () => {
        // 1 leaver, 5 current staff:
        // With approved = 5 (or not set): 1 / 5 * 100 = 20% (Medium)
        const res5 = calculateAttrition(1, 5, 5);
        expect(res5.attritionRate).toBe(20);
        expect(res5.status).toBe('Medium');

        // When target is increased to 20: 1 / 20 * 100 = 5% (Low)
        const res20 = calculateAttrition(1, 5, 20);
        expect(res20.attritionRate).toBe(5);
        expect(res20.status).toBe('Low');
      });
    });

    describe('UI Table Columns & Period Dropdown Selector', () => {
      beforeEach(() => {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: { id: 1, name: 'Admin User', role: 'admin' },
          isAdmin: true,
          isHR: false,
          isDeptManager: false,
          isEmployee: false,
        });

        api.get.mockImplementation((url) => {
          if (url.includes('/attrition')) {
            return Promise.resolve({ data: mockAttritionData });
          }
          return Promise.resolve({ data: mockDepartmentData });
        });
      });

      it('renders Attrition Rate and Attrition Status headers and period dropdown', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('th-attrition-rate')).toBeInTheDocument();
          expect(screen.getByTestId('th-attrition-status')).toBeInTheDocument();
          expect(screen.getByTestId('attrition-period-select')).toBeInTheDocument();
        });

        expect(screen.getByTestId('th-attrition-rate')).toHaveTextContent('Attrition Rate');
        expect(screen.getByTestId('th-attrition-status')).toHaveTextContent('Attrition Status');

        const select = screen.getByTestId('attrition-period-select');
        expect(select.value).toBe('12');
      });

      it('displays formatted attrition rate, status, and leavers count per department', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          // Engineering: approved 10, current 7, 1 leaver => (1 / 10) * 100 = 10%, Medium
          expect(screen.getByTestId('attrition-rate-1')).toHaveTextContent('10%');
          expect(screen.getByTestId('attrition-leavers-1')).toHaveTextContent('1 leaver');

          // Sales: approved 5, current 5, 0 leavers => 0%, Low
          expect(screen.getByTestId('attrition-rate-2')).toHaveTextContent('0%');
          expect(screen.getByTestId('attrition-leavers-2')).toHaveTextContent('0 leavers');

          // Marketing: approved 3, current 5, 2 leavers => (2 / 3) * 100 = 66.7%, High
          expect(screen.getByTestId('attrition-rate-3')).toHaveTextContent('66.7%');
          expect(screen.getByTestId('attrition-leavers-3')).toHaveTextContent('2 leavers');
        });
      });

      it('dynamically changes attrition rate in UI when target is increased via inline edit', async () => {
        api.put.mockResolvedValue({
          data: {
            message: 'Approved headcount updated successfully!',
            department: { id: 1, name: 'Engineering', approved_headcount: 20 },
          },
        });

        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          // Initially approved is 10 with 1 leaver => 10%
          expect(screen.getByTestId('attrition-rate-1')).toHaveTextContent('10%');
        });

        // Click edit on department 1 (Engineering)
        fireEvent.click(screen.getByTestId('inline-edit-btn-1'));

        const input = screen.getByTestId('inline-input-1');
        // Increase target from 10 to 20
        fireEvent.change(input, { target: { value: '20' } });

        // Save
        fireEvent.click(screen.getByTestId('inline-save-1'));

        await waitFor(() => {
          // Now approved target is 20 with 1 leaver => (1 / 20) * 100 = 5%
          expect(screen.getByTestId('attrition-rate-1')).toHaveTextContent('5%');
          expect(screen.getByTestId('attrition-status-cell-1')).toHaveTextContent('Low');
        });
      });

      it('fetches new attrition data when user switches period dropdown (e.g. to 3 or 6 months)', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('attrition-period-select')).toBeInTheDocument();
        });

        const select = screen.getByTestId('attrition-period-select');

        // Change to 6 months
        fireEvent.change(select, { target: { value: '6' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/attrition?months=6');
        });

        // Change to 3 months
        fireEvent.change(select, { target: { value: '3' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/attrition?months=3');
        });
      });
    });
  });

  describe('7. Overtime Calculation Logic & UI Controls', () => {
    describe('Unit Tests for calculateOvertime', () => {
      it('returns avgDailyHours 0, overtimePercent 0, and status "No Data" when attendanceDays = 0 or hours <= 0', () => {
        expect(calculateOvertime(0, 0)).toEqual({ avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });
        expect(calculateOvertime(8.5, 0)).toEqual({ avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });
        expect(calculateOvertime(0, 10)).toEqual({ avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });
      });

      it('returns 0% overtime and status "Normal" when working hours <= 8.0 (0 if negative)', () => {
        const exact = calculateOvertime(8.0, 5);
        expect(exact.avgDailyHours).toBe(8.0);
        expect(exact.overtimePercent).toBe(0);
        expect(exact.status).toBe('Normal');

        const under = calculateOvertime(7.4, 5);
        expect(under.avgDailyHours).toBe(7.4);
        expect(under.overtimePercent).toBe(0);
        expect(under.status).toBe('Normal');
      });

      it('returns status "Normal" when overtime is under 5%', () => {
        // (8.3 - 8) / 8 * 100 = 3.8%
        const result = calculateOvertime(8.3, 10);
        expect(result.avgDailyHours).toBe(8.3);
        expect(result.overtimePercent).toBe(3.8);
        expect(result.status).toBe('Normal');
      });

      it('returns status "High" when overtime is between 5% and 15% inclusive', () => {
        // (8.4 - 8) / 8 * 100 = 5.0%
        const res5 = calculateOvertime(8.4, 10);
        expect(res5.avgDailyHours).toBe(8.4);
        expect(res5.overtimePercent).toBe(5.0);
        expect(res5.status).toBe('High');

        // (8.6 - 8) / 8 * 100 = 7.5%
        const res7 = calculateOvertime(8.6, 10);
        expect(res7.avgDailyHours).toBe(8.6);
        expect(res7.overtimePercent).toBe(7.5);
        expect(res7.status).toBe('High');

        // (9.2 - 8) / 8 * 100 = 15.0%
        const res15 = calculateOvertime(9.2, 10);
        expect(res15.avgDailyHours).toBe(9.2);
        expect(res15.overtimePercent).toBe(15.0);
        expect(res15.status).toBe('High');
      });

      it('returns status "Very High" when overtime is over 15%', () => {
        // (9.4 - 8) / 8 * 100 = 17.5%
        const res = calculateOvertime(9.4, 10);
        expect(res.avgDailyHours).toBe(9.4);
        expect(res.overtimePercent).toBe(17.5);
        expect(res.status).toBe('Very High');
      });
    });

    describe('UI Table Columns & Period Dropdown Selector for Overtime', () => {
      beforeEach(() => {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: { id: 1, name: 'Admin User', role: 'admin' },
          isAdmin: true,
          isHR: false,
          isDeptManager: false,
          isEmployee: false,
        });

        api.get.mockImplementation((url) => {
          if (url.includes('/overtime')) {
            return Promise.resolve({ data: mockOvertimeData });
          }
          if (url.includes('/attrition')) {
            return Promise.resolve({ data: mockAttritionData });
          }
          return Promise.resolve({ data: mockDepartmentData });
        });
      });

      it('renders Avg Daily Hours, Overtime %, and Overtime Status headers and period dropdown', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('th-overtime-hours')).toBeInTheDocument();
          expect(screen.getByTestId('th-overtime-percent')).toBeInTheDocument();
          expect(screen.getByTestId('th-overtime-status')).toBeInTheDocument();
          expect(screen.getByTestId('overtime-period-select')).toBeInTheDocument();
        });

        expect(screen.getByTestId('th-overtime-hours')).toHaveTextContent('Avg Daily Hours');
        expect(screen.getByTestId('th-overtime-percent')).toHaveTextContent('Overtime %');
        expect(screen.getByTestId('th-overtime-status')).toHaveTextContent('Overtime Status');

        const select = screen.getByTestId('overtime-period-select');
        expect(select.value).toBe('3');
      });

      it('displays formatted avg daily hours, overtime percent, and status per department', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          // Engineering: 8.6h, 7.5%, High
          expect(screen.getByTestId('overtime-hours-1')).toHaveTextContent('8.6h');
          expect(screen.getByTestId('overtime-percent-1')).toHaveTextContent('7.5%');
          expect(screen.getByTestId('overtime-status-cell-1')).toHaveTextContent('High');

          // Sales: 9.4h, 17.5%, Very High
          expect(screen.getByTestId('overtime-hours-2')).toHaveTextContent('9.4h');
          expect(screen.getByTestId('overtime-percent-2')).toHaveTextContent('17.5%');
          expect(screen.getByTestId('overtime-status-cell-2')).toHaveTextContent('Very High');

          // Marketing: 8.2h, 2.5%, Normal
          expect(screen.getByTestId('overtime-hours-3')).toHaveTextContent('8.2h');
          expect(screen.getByTestId('overtime-percent-3')).toHaveTextContent('2.5%');
          expect(screen.getByTestId('overtime-status-cell-3')).toHaveTextContent('Normal');

          // Unassigned Research: —, —, No Data
          expect(screen.getByTestId('overtime-hours-4')).toHaveTextContent('—');
          expect(screen.getByTestId('overtime-percent-4')).toHaveTextContent('—');
          expect(screen.getByTestId('overtime-status-cell-4')).toHaveTextContent('No Data');
        });
      });

      it('fetches new overtime data when user switches period dropdown (e.g. to 1 or 6 months)', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('overtime-period-select')).toBeInTheDocument();
        });

        const select = screen.getByTestId('overtime-period-select');

        // Change to 1 month
        fireEvent.change(select, { target: { value: '1' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/overtime?months=1');
        });

        // Change to 6 months
        fireEvent.change(select, { target: { value: '6' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/overtime?months=6');
        });
      });
    });
  });

  describe('8. Leave Pressure Calculation Logic & UI Controls', () => {
    describe('Unit Tests for calculateLeavePressure', () => {
      it('returns avgOnLeave: 0, leavePressure: 0, status: "Low" when headcount <= 0 or avgOnLeave <= 0', () => {
        expect(calculateLeavePressure(0, 10)).toEqual({ avgOnLeave: 0, leavePressure: 0, status: 'Low' });
        expect(calculateLeavePressure(1.5, 0)).toEqual({ avgOnLeave: 1.5, leavePressure: 0, status: 'Low' });
        expect(calculateLeavePressure(0, 0)).toEqual({ avgOnLeave: 0, leavePressure: 0, status: 'Low' });
      });

      it('calculates avgOnLeave correctly when totalWorkDays is supplied', () => {
        // 10 leave days / 20 work days = 0.5 avgOnLeave
        // 0.5 / 10 headcount * 100 = 5% Medium
        const res = calculateLeavePressure(10, 10, 20);
        expect(res.avgOnLeave).toBe(0.5);
        expect(res.leavePressure).toBe(5);
        expect(res.status).toBe('Medium');
      });

      it('returns status "Low" when leave pressure is under 5%', () => {
        // 0.3 / 7 headcount * 100 = 4.3%
        const res = calculateLeavePressure(0.3, 7);
        expect(res.avgOnLeave).toBe(0.3);
        expect(res.leavePressure).toBe(4.3);
        expect(res.status).toBe('Low');
      });

      it('returns status "Medium" when leave pressure is between 5% and 10% inclusive', () => {
        // 0.4 / 5 headcount * 100 = 8.0%
        const res1 = calculateLeavePressure(0.4, 5);
        expect(res1.avgOnLeave).toBe(0.4);
        expect(res1.leavePressure).toBe(8.0);
        expect(res1.status).toBe('Medium');

        // Exactly 5%
        const res2 = calculateLeavePressure(0.5, 10);
        expect(res2.leavePressure).toBe(5.0);
        expect(res2.status).toBe('Medium');

        // Exactly 10%
        const res3 = calculateLeavePressure(1.0, 10);
        expect(res3.leavePressure).toBe(10.0);
        expect(res3.status).toBe('Medium');
      });

      it('returns status "High" when leave pressure exceeds 10%', () => {
        // 0.8 / 5 headcount * 100 = 16.0%
        const res = calculateLeavePressure(0.8, 5);
        expect(res.avgOnLeave).toBe(0.8);
        expect(res.leavePressure).toBe(16.0);
        expect(res.status).toBe('High');
      });
    });

    describe('UI Table Columns & Period Dropdown Selector for Leave Pressure', () => {
      beforeEach(() => {
        vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
          user: { id: 1, name: 'Admin User', role: 'admin' },
          isAdmin: true,
          isHR: false,
          isDeptManager: false,
          isEmployee: false,
        });

        api.get.mockImplementation((url) => {
          if (url.includes('/leave-pressure')) {
            return Promise.resolve({ data: mockLeaveData });
          }
          if (url.includes('/overtime')) {
            return Promise.resolve({ data: mockOvertimeData });
          }
          if (url.includes('/attrition')) {
            return Promise.resolve({ data: mockAttritionData });
          }
          return Promise.resolve({ data: mockDepartmentData });
        });
      });

      it('renders Avg On Leave, Leave Pressure %, and Leave Status headers and period dropdown', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('th-leave-avg')).toBeInTheDocument();
          expect(screen.getByTestId('th-leave-pressure')).toBeInTheDocument();
          expect(screen.getByTestId('th-leave-status')).toBeInTheDocument();
          expect(screen.getByTestId('leave-period-select')).toBeInTheDocument();
        });

        expect(screen.getByTestId('th-leave-avg')).toHaveTextContent('Avg On Leave');
        expect(screen.getByTestId('th-leave-pressure')).toHaveTextContent('Leave Pressure %');
        expect(screen.getByTestId('th-leave-status')).toHaveTextContent('Leave Status');

        const select = screen.getByTestId('leave-period-select');
        expect(select.value).toBe('3');
      });

      it('displays formatted avg on leave, leave pressure percent, and status per department', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          // Engineering: 0.3, 4.3%, Low
          expect(screen.getByTestId('leave-avg-1')).toHaveTextContent('0.3');
          expect(screen.getByTestId('leave-pressure-1')).toHaveTextContent('4.3%');
          expect(screen.getByTestId('leave-status-cell-1')).toHaveTextContent('Low');

          // Sales: 0.4, 8.0%, Medium
          expect(screen.getByTestId('leave-avg-2')).toHaveTextContent('0.4');
          expect(screen.getByTestId('leave-pressure-2')).toHaveTextContent('8%');
          expect(screen.getByTestId('leave-status-cell-2')).toHaveTextContent('Medium');

          // Marketing: 0.8, 16.0%, High
          expect(screen.getByTestId('leave-avg-3')).toHaveTextContent('0.8');
          expect(screen.getByTestId('leave-pressure-3')).toHaveTextContent('16%');
          expect(screen.getByTestId('leave-status-cell-3')).toHaveTextContent('High');

          // Unassigned Research: 0, 0%, Low
          expect(screen.getByTestId('leave-avg-4')).toHaveTextContent('0');
          expect(screen.getByTestId('leave-pressure-4')).toHaveTextContent('0%');
          expect(screen.getByTestId('leave-status-cell-4')).toHaveTextContent('Low');
        });
      });

      it('fetches new leave pressure data when user switches period dropdown (e.g. to 1 or 6 months)', async () => {
        render(
          <MemoryRouter>
            <Headcount />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('leave-period-select')).toBeInTheDocument();
        });

        const select = screen.getByTestId('leave-period-select');

        // Change to 1 month
        fireEvent.change(select, { target: { value: '1' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/leave-pressure?months=1');
        });

        // Change to 6 months
        fireEvent.change(select, { target: { value: '6' } });

        await waitFor(() => {
          expect(api.get).toHaveBeenCalledWith('/workforce/leave-pressure?months=6');
        });
      });
    });
  });
});

