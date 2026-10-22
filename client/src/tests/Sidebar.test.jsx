import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import * as AuthContext from '../context/AuthContext';
import * as NotificationContext from '../context/NotificationContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Sidebar Component', () => {
  const mockLogout = vi.fn().mockResolvedValue();

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
    });
  });

  it('renders all admin navigation items when user role is admin', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'Admin Master', email: 'admin@ems.local', role: 'admin' },
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Departments')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Employees')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Deleted Archive')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Audit Log')[0]).toBeInTheDocument();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });

  it('renders restricted employee navigation items when user role is employee', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 2, name: 'Jane Doe', email: 'jane@ems.local', role: 'employee', employee_id: 15 },
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('My Profile')[0]).toBeInTheDocument();

    // Admin-only items must NOT be present
    expect(screen.queryByText('Departments')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted Archive')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
  });

  it('triggers logout and redirects to /login when Sign Out is clicked', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'Admin Master', email: 'admin@ems.local', role: 'admin' },
      logout: mockLogout,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const signoutButtons = screen.getAllByRole('button', { name: /sign out/i });
    fireEvent.click(signoutButtons[0]);

    expect(mockLogout).toHaveBeenCalled();
  });
});
