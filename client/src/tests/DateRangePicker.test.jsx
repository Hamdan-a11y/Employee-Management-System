import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateRangePicker from '../components/DateRangePicker';

describe('Premium DateRangePicker Component Tests', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with default placeholder when empty', () => {
    render(
      <DateRangePicker
        startDate=""
        endDate=""
        onChange={mockOnChange}
        label="Joined Date:"
      />
    );

    expect(screen.getByText('Joined Date:')).toBeInTheDocument();
    expect(screen.getByText('Select date range...')).toBeInTheDocument();
  });

  it('renders formatted date range when startDate and endDate are provided', () => {
    render(
      <DateRangePicker
        startDate="2026-11-01"
        endDate="2026-11-04"
        onChange={mockOnChange}
        label="Joined Date:"
      />
    );

    expect(screen.getByText('Joined Date:')).toBeInTheDocument();
    expect(screen.getByText(/Nov 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Nov 4, 2026/)).toBeInTheDocument();
    expect(screen.getByText('4 days')).toBeInTheDocument();
  });

  it('opens popover dialog when trigger button is clicked', () => {
    render(
      <DateRangePicker
        startDate="2026-11-01"
        endDate="2026-11-04"
        onChange={mockOnChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /pick date range/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Quick Filters')).toBeInTheDocument();
  });

  it('clicking a preset triggers onChange with ISO date strings', () => {
    render(
      <DateRangePicker
        startDate=""
        endDate=""
        onChange={mockOnChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /pick date range/i });
    fireEvent.click(trigger);

    const presetThisYear = screen.getByRole('button', { name: /this year/i });
    fireEvent.click(presetThisYear);

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = mockOnChange.mock.calls[0][0];
    const currentYear = new Date().getFullYear();
    expect(callArg.startDate).toBe(`${currentYear}-01-01`);
  });

  it('clicking clear icon in trigger button resets the range', () => {
    render(
      <DateRangePicker
        startDate="2026-11-01"
        endDate="2026-11-04"
        onChange={mockOnChange}
      />
    );

    const clearBtn = screen.getByLabelText(/clear date filter/i);
    fireEvent.click(clearBtn);

    expect(mockOnChange).toHaveBeenCalledWith({ startDate: '', endDate: '' });
  });

  it('navigates months when clicking next and previous buttons', () => {
    render(
      <DateRangePicker
        startDate="2026-11-01"
        endDate="2026-11-04"
        onChange={mockOnChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /pick date range/i });
    fireEvent.click(trigger);

    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByText('December 2026')).toBeInTheDocument();

    const prevMonthBtn = screen.getByLabelText('Previous month');
    fireEvent.click(prevMonthBtn);

    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getByText('November 2026')).toBeInTheDocument();
  });

  it('closes popover on Escape key press', () => {
    render(
      <DateRangePicker
        startDate="2026-11-01"
        endDate="2026-11-04"
        onChange={mockOnChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /pick date range/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

