import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ToastContainer from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import DepartmentList from './pages/DepartmentList';
import EmployeeList from './pages/EmployeeList';
import EmployeeForm from './pages/EmployeeForm';
import EmployeeProfile from './pages/EmployeeProfile';
import DeletedEmployees from './pages/DeletedEmployees';
import AuditLog from './pages/AuditLog';
import Attendance from './pages/Attendance';
import Leaves from './pages/Leaves';
import Headcount from './pages/Headcount';
import Payroll from './pages/Payroll';
import MyPayslips from './pages/MyPayslips';
import Shifts from './pages/Shifts';
import OfficeLocations from './pages/OfficeLocations';
import Holidays from './pages/Holidays';
import WorkingWeek from './pages/WorkingWeek';
import TeamCalendar from './pages/TeamCalendar';
import Overtime from './pages/Overtime';
import JobRuns from './pages/JobRuns';

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <ToastContainer />
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <DepartmentList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workforce"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <Headcount />
              </ProtectedRoute>
            }
          />
          <Route path="/headcount" element={<Navigate to="/workforce" replace />} />
          <Route path="/workforce/headcount" element={<Navigate to="/workforce" replace />} />
          <Route
            path="/employees"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <EmployeeList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/new"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/deleted"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DeletedEmployees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/edit/:id"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute>
                <EmployeeProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <Attendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/offices"
            element={
              <ProtectedRoute>
                <OfficeLocations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/map"
            element={
              <ProtectedRoute>
                <OfficeLocations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts"
            element={
              <ProtectedRoute>
                <Shifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts/assign"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <Shifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts/schedule"
            element={
              <ProtectedRoute>
                <Shifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaves"
            element={
              <ProtectedRoute>
                <Leaves />
              </ProtectedRoute>
            }
          />
          <Route
            path="/holidays"
            element={
              <ProtectedRoute>
                <Holidays />
              </ProtectedRoute>
            }
          />
          <Route
            path="/working-week"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
                <WorkingWeek />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team-calendar"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <TeamCalendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
                <Payroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overtime"
            element={
              <ProtectedRoute>
                <Overtime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overtime/approvals"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <Overtime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overtime/my"
            element={
              <ProtectedRoute>
                <Overtime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overtime/policies"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
                <Overtime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/overtime/report"
            element={
              <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'department_manager']}>
                <Overtime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-payslips"
            element={
              <ProtectedRoute>
                <MyPayslips />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <JobRuns />
              </ProtectedRoute>
            }
          />
          <Route path="/jobs" element={<Navigate to="/admin/jobs" replace />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
