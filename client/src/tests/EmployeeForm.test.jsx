import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EmployeeForm from '../pages/EmployeeForm';
import api from '../services/api';
import * as NotificationContext from '../context/NotificationContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Mock Sidebar to keep component isolated
vi.mock('../components/Sidebar', () => ({
  default: () => <nav data-testid="sidebar-mock">Sidebar</nav>,
}));

describe('EmployeeForm Component', () => {
  const mockNotifySuccess = vi.fn();
  const mockNotifyError = vi.fn();

  const mockDepartments = [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'Human Resources' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationContext, 'useNotification').mockReturnValue({
      success: mockNotifySuccess,
      error: mockNotifyError,
    });
    api.get.mockImplementation((url) => {
      if (url === '/departments') {
        return Promise.resolve({ data: mockDepartments });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders Add New Employee form inputs and loads departments', async () => {
    render(
      <MemoryRouter initialEntries={['/employees/new']}>
        <Routes>
          <Route path="/employees/new" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Add New Employee')).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/designation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/department/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Engineering' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Human Resources' })).toBeInTheDocument();
    });
  });

  it('shows validation error if required fields are missing on submit', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/employees/new']}>
        <Routes>
          <Route path="/employees/new" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/departments'));

    const form = container.querySelector('form');
    fireEvent.submit(form);

    expect(await screen.findByText('Please fill in all required fields.')).toBeInTheDocument();
    expect(mockNotifyError).toHaveBeenCalledWith('Please fill in all required fields.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits valid employee data to API and triggers success notification', async () => {
    api.post.mockResolvedValueOnce({
      data: { id: 10, name: 'Charlie Brown' },
    });

    render(
      <MemoryRouter initialEntries={['/employees/new']}>
        <Routes>
          <Route path="/employees/new" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/departments'));

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Charlie Brown' } });
    fireEvent.change(screen.getByLabelText(/designation/i), { target: { value: 'QA Engineer' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'charlie@company.com' } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '+1-555-010-9988' } });
    fireEvent.change(screen.getByLabelText(/department \*/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /save employee/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/employees', expect.objectContaining({
        name: 'Charlie Brown',
        email: 'charlie@company.com',
        phone: '+1-555-010-9988',
        designation: 'QA Engineer',
      }));
      expect(mockNotifySuccess).toHaveBeenCalledWith('Employee added successfully!');
    });
  });

  it('loads existing employee data in edit mode', async () => {
    const existingEmployee = {
      id: 5,
      name: 'Existing Worker',
      email: 'existing@company.com',
      phone: '1234567890',
      designation: 'Staff Analyst',
      department_id: 1,
      status: 'Active',
    };

    api.get.mockImplementation((url) => {
      if (url === '/departments') {
        return Promise.resolve({ data: mockDepartments });
      }
      if (url === '/employees/5') {
        return Promise.resolve({ data: existingEmployee });
      }
      return Promise.reject(new Error('not found'));
    });

    render(
      <MemoryRouter initialEntries={['/employees/edit/5']}>
        <Routes>
          <Route path="/employees/edit/:id" element={<EmployeeForm />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Edit Employee Details')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Existing Worker');
      expect(screen.getByLabelText(/email address/i)).toHaveValue('existing@company.com');
      expect(screen.getByLabelText(/designation/i)).toHaveValue('Staff Analyst');
    });
  });
});
