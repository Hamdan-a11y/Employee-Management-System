import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './ProtectedRoute.css';

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }) => {
  const { user, isAuthenticated, loading, can } = useAuth();

  if (loading) {
    return (
      <div className="protected-loading">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user?.role || 'employee';
    if (!allowedRoles.includes(userRole)) {
      if (userRole === 'employee') {
        const fallback = user?.employee_id ? `/employees/${user.employee_id}` : '/dashboard';
        return <Navigate to={fallback} replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
