import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check current session from HttpOnly cookies on initial load
  const checkAuth = async () => {
    try {
      // Remove any legacy tokens from browser storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');

      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  const can = (permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  };

  const canAny = (permissionArray) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!Array.isArray(user.permissions)) return false;
    return permissionArray.some((p) => user.permissions.includes(p));
  };

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    role: user?.role || 'employee',
    permissions: user?.permissions || [],
    departmentId: user?.department_id || null,
    isAdmin: user?.role === 'admin',
    isHR: user?.role === 'hr_manager',
    isDeptManager: user?.role === 'department_manager',
    isEmployee: user?.role === 'employee',
    can,
    canAny,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: { role: 'admin' },
      loading: false,
      isAuthenticated: true,
      role: 'admin',
      permissions: [],
      departmentId: null,
      isAdmin: true,
      isHR: false,
      isDeptManager: false,
      isEmployee: false,
      can: () => true,
      canAny: () => true,
      login: () => {},
      logout: () => {},
      checkAuth: () => {},
    };
  }
  return context;
};
