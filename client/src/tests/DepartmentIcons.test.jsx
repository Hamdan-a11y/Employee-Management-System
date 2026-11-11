import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { getDepartmentConfig, DepartmentIcon, ICON_REGISTRY } from '../utils/departmentIcons';
import { Brain, Headphones, Server, Layout, Palette } from 'lucide-react';

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

  it('correctly maps Artificial Intelligence to Brain icon and NOT to Palette (art substring fix)', () => {
    const aiConfig = getDepartmentConfig('Artificial Intelligence');
    expect(aiConfig.id).toBe('ai');
    expect(aiConfig.icon).toBe(Brain);
    expect(aiConfig.icon).not.toBe(Palette);
    expect(aiConfig.label).toBe('Artificial Intelligence');
    expect(aiConfig.color).toBe('#9333ea');

    // Also test variations
    expect(getDepartmentConfig('AI & Machine Learning').id).toBe('ai');
    expect(getDepartmentConfig('Deep Learning & Neural Networks').id).toBe('ai');
    expect(getDepartmentConfig('Generative AI Systems').id).toBe('ai');
  });

  it('correctly maps Customer Operations to Headphones icon and NOT generic Workflow', () => {
    const custConfig = getDepartmentConfig('Customer Operations');
    expect(custConfig.id).toBe('customer-ops');
    expect(custConfig.icon).toBe(Headphones);
    expect(custConfig.label).toBe('Customer Operations');

    // Also test variations
    expect(getDepartmentConfig('Customer Support').id).toBe('customer-ops');
    expect(getDepartmentConfig('Customer Success').id).toBe('customer-ops');
    expect(getDepartmentConfig('Client Services').id).toBe('customer-ops');
    expect(getDepartmentConfig('Customer Care').id).toBe('customer-ops');
  });

  it('distinguishes Backend and Frontend Engineering from generic Engineering', () => {
    const backendConfig = getDepartmentConfig('Backend Engineering');
    expect(backendConfig.id).toBe('backend');
    expect(backendConfig.icon).toBe(Server);

    const frontendConfig = getDepartmentConfig('Frontend Engineering');
    expect(frontendConfig.id).toBe('frontend');
    expect(frontendConfig.icon).toBe(Layout);

    const genericConfig = getDepartmentConfig('Engineering');
    expect(genericConfig.id).toBe('engineering');
  });

  it('accurately maps dynamically added new departments by domain semantics', () => {
    expect(getDepartmentConfig('Mobile Development').id).toBe('mobile');
    expect(getDepartmentConfig('iOS & Android Apps').id).toBe('mobile');
    expect(getDepartmentConfig('Cloud & Platform DevOps').id).toBe('cloud');
    expect(getDepartmentConfig('Legal & Corporate Affairs').id).toBe('legal');
    expect(getDepartmentConfig('Supply Chain & Freight').id).toBe('logistics');
    expect(getDepartmentConfig('Warehouse & Fulfillment').id).toBe('facilities');
    expect(getDepartmentConfig('Procurement & Sourcing').id).toBe('procurement');
    expect(getDepartmentConfig('Health & Occupational Safety').id).toBe('healthcare');
    expect(getDepartmentConfig('Corporate Learning & Academy').id).toBe('education');
    expect(getDepartmentConfig('Video & Media Production').id).toBe('media');
    expect(getDepartmentConfig('Technical Documentation').id).toBe('content');
    expect(getDepartmentConfig('Hardware & Robotics').id).toBe('hardware');
    expect(getDepartmentConfig('Executive Leadership').id).toBe('leadership');
    expect(getDepartmentConfig('Strategic Planning').id).toBe('strategy');
    expect(getDepartmentConfig('Public Relations').id).toBe('pr');
    expect(getDepartmentConfig('Maintenance & Repairs').id).toBe('maintenance');
  });

  it('tokenizes multi-word compound department names and matches domain keywords', () => {
    expect(getDepartmentConfig('Global AI Innovations Lab').id).toBe('ai');
    expect(getDepartmentConfig('North America Customer Support Unit').id).toBe('customer-ops');
    expect(getDepartmentConfig('Enterprise Cloud Infrastructure Team').id).toBe('cloud');
  });

  it('supports explicit icon override from ICON_REGISTRY', () => {
    const explicitAi = getDepartmentConfig('General Team', 'brain');
    expect(explicitAi.icon).toBe(Brain);

    const explicitHeadphones = getDepartmentConfig('General Team', 'headphones');
    expect(explicitHeadphones.icon).toBe(Headphones);
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
