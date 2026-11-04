import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { getDepartmentConfig, DepartmentIcon } from '../utils/departmentIcons';

describe('Department Icons Utility', () => {
  it('correctly maps all primary departments from user list', () => {
    const expectations = [
      { dept: 'Engineering', id: 'engineering' },
      { dept: 'Sales', id: 'sales' },
      { dept: 'Marketing', id: 'marketing' },
      { dept: 'Human Resources', id: 'human-resources' },
      { dept: 'Full Stack', id: 'fullstack' },
      { dept: 'Cybersecurity', id: 'cybersecurity' },
      { dept: 'Database', id: 'database' },
    ];

    expectations.forEach(({ dept, id }) => {
      const config = getDepartmentConfig(dept);
      expect(config.id).toBe(id);
      expect(config.icon).toBeDefined();
      expect(config.color).toBeTruthy();
      expect(config.bgColor).toBeTruthy();
      expect(config.borderColor).toBeTruthy();
      expect(config.barColor).toBeTruthy();
    });
  });

  it('maps variations like HR, SecOps, DBA, Full-Stack, and Software Developer', () => {
    expect(getDepartmentConfig('HR').id).toBe('human-resources');
    expect(getDepartmentConfig('SecOps').id).toBe('cybersecurity');
    expect(getDepartmentConfig('DBA').id).toBe('database');
    expect(getDepartmentConfig('Full-Stack Web').id).toBe('fullstack');
    expect(getDepartmentConfig('Software Engineering').id).toBe('engineering');
    expect(getDepartmentConfig('UI/UX Design').id).toBe('design');
    expect(getDepartmentConfig('Finance & Accounts').id).toBe('finance');
  });

  it('falls back gracefully to general building icon for empty or unknown departments', () => {
    const unknown = getDepartmentConfig('Some Unknown Space Division');
    expect(unknown.id).toBe('general');

    const empty = getDepartmentConfig('');
    expect(empty.id).toBe('general');

    const nil = getDepartmentConfig(null);
    expect(nil.id).toBe('general');
  });

  it('renders badge variant with accessible aria-label and title', () => {
    const { container } = render(<DepartmentIcon name="Cybersecurity" size={16} badgeSize={32} />);
    const badge = container.querySelector('.dept-icon-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'Cybersecurity');
    expect(badge).toHaveAttribute('aria-label', 'Cybersecurity icon');
    expect(badge.querySelector('svg')).toBeInTheDocument();
  });

  it('renders plain variant without outer badge wrapper', () => {
    const { container } = render(<DepartmentIcon name="Engineering" variant="plain" size={16} />);
    const plainIcon = container.querySelector('.dept-plain-icon');
    expect(plainIcon).toBeInTheDocument();
    expect(container.querySelector('.dept-icon-badge')).not.toBeInTheDocument();
  });
});

