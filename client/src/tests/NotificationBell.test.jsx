import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../components/NotificationBell';
import * as NotificationContext from '../context/NotificationContext';

describe('NotificationBell Component', () => {
  const mockMarkAsRead = vi.fn().mockResolvedValue();
  const mockMarkAllAsRead = vi.fn().mockResolvedValue();
  const mockDeleteNotification = vi.fn().mockResolvedValue();
  const mockClearRead = vi.fn().mockResolvedValue();
  const mockFetchNotifications = vi.fn().mockResolvedValue();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleNotifications = [
    {
      id: 101,
      type: 'DEPARTMENT',
      title: 'Department Created',
      message: 'Finance department was added',
      is_read: 0,
      created_at: new Date().toISOString(),
      link: '/departments',
    },
    {
      id: 102,
      type: 'EMPLOYEE',
      title: 'Employee Updated',
      message: 'Profile details updated',
      is_read: 1,
      created_at: new Date().toISOString(),
      link: '/employees/1',
    },
  ];

  it('renders notification bell and displays unread badge count', () => {
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      notifications: sampleNotifications,
      unreadCount: 1,
      loadingNotifications: false,
      markAsRead: mockMarkAsRead,
      markAllAsRead: mockMarkAllAsRead,
      deleteNotification: mockDeleteNotification,
      clearRead: mockClearRead,
      fetchNotifications: mockFetchNotifications,
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    expect(bellBtn).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens popover and shows notification list on bell click', () => {
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      notifications: sampleNotifications,
      unreadCount: 1,
      loadingNotifications: false,
      markAsRead: mockMarkAsRead,
      markAllAsRead: mockMarkAllAsRead,
      deleteNotification: mockDeleteNotification,
      clearRead: mockClearRead,
      fetchNotifications: mockFetchNotifications,
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellBtn);

    expect(mockFetchNotifications).toHaveBeenCalled();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Finance department was added')).toBeInTheDocument();
    expect(screen.getByText('Profile details updated')).toBeInTheDocument();
  });

  it('allows marking all notifications as read', () => {
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      notifications: sampleNotifications,
      unreadCount: 1,
      loadingNotifications: false,
      markAsRead: mockMarkAsRead,
      markAllAsRead: mockMarkAllAsRead,
      deleteNotification: mockDeleteNotification,
      clearRead: mockClearRead,
      fetchNotifications: mockFetchNotifications,
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    const markAllBtn = screen.getByRole('button', { name: /read all/i });
    fireEvent.click(markAllBtn);

    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it('displays empty state when there are no notifications', () => {
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      notifications: [],
      unreadCount: 0,
      loadingNotifications: false,
      markAsRead: mockMarkAsRead,
      markAllAsRead: mockMarkAllAsRead,
      deleteNotification: mockDeleteNotification,
      clearRead: mockClearRead,
      fetchNotifications: mockFetchNotifications,
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });
});
