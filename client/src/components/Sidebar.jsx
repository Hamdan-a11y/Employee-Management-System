import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  LogOut, 
  Menu, 
  X,
  Briefcase,
  History,
  Archive,
  Clock,
  Calendar
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout, can, isAdmin: authIsAdmin, isEmployee: authIsEmployee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isAdmin = authIsAdmin !== undefined ? authIsAdmin : user?.role === 'admin';
  const isEmployee = authIsEmployee !== undefined ? authIsEmployee : user?.role === 'employee';
  const isHR = user?.role === 'hr_manager';
  const isDeptManager = user?.role === 'department_manager';

  const checkPerm = (perm) => {
    if (typeof can === 'function') return can(perm);
    if (user?.role === 'admin') return true;
    return Array.isArray(user?.permissions) && user.permissions.includes(perm);
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return { label: 'Admin', className: 'role-admin' };
      case 'hr_manager':
        return { label: 'HR Manager', className: 'role-hr' };
      case 'department_manager':
        return { label: 'Dept Manager', className: 'role-manager' };
      default:
        return { label: 'Employee', className: 'role-employee' };
    }
  };
  const roleBadge = getRoleBadge(user?.role);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Handle escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
  ];

  if (!isEmployee && (isAdmin || checkPerm('department.view'))) {
    navItems.push({
      to: '/departments',
      label: 'Departments',
      icon: Building2,
    });
  }

  if (!isEmployee && (isAdmin || isHR || isDeptManager || checkPerm('employee.view'))) {
    navItems.push({
      to: '/employees',
      label: 'Employees',
      icon: Users,
    });
  }

  if (isEmployee) {
    navItems.push({
      to: user?.employee_id ? `/employees/${user.employee_id}` : '/employees/me',
      label: 'My Profile',
      icon: Briefcase,
    });
  }

  navItems.push(
    {
      to: '/attendance',
      label: 'Attendance',
      icon: Clock,
    },
    {
      to: '/leaves',
      label: 'Leaves',
      icon: Calendar,
    }
  );

  if (isAdmin) {
    navItems.push({
      to: '/employees/deleted',
      label: 'Deleted Archive',
      icon: Archive,
    });
  }

  if (isAdmin || (isHR && checkPerm('audit.view'))) {
    navItems.push({
      to: '/audit-logs',
      label: 'Audit Log',
      icon: History,
    });
  }

  return (
    <>
      {/* Mobile Top Header */}
      <header className="sidebar-mobile-header">
        <NavLink to="/dashboard" className="sidebar-mobile-brand">
          <div className="sidebar-brand-icon-sm">
            <Briefcase size={16} />
          </div>
          <span className="sidebar-mobile-brand-title">Employee Management System</span>
        </NavLink>

        <div className="sidebar-mobile-right">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setIsMobileOpen((prev) => !prev)}
            className="sidebar-mobile-toggle"
            aria-label={isMobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileOpen}
          >
            {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Backdrop for Mobile Drawer */}
      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Navigation */}
      <aside 
        className={`sidebar-aside ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Sidebar navigation"
      >
        {/* Brand Header */}
        <div className="sidebar-brand-header">
          <NavLink to="/dashboard" className="sidebar-brand-link">
            <div className="sidebar-brand-icon">
              <Briefcase size={18} />
            </div>
            <div className="sidebar-brand-info">
              <span className="sidebar-brand-title">EMS</span>
              <span className="sidebar-brand-subtitle">Employee Management System</span>
            </div>
          </NavLink>

          <div className="sidebar-brand-actions">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="sidebar-drawer-close"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Modules */}
        <div className="sidebar-nav-container">
          <div className="sidebar-group-label">Main Menu</div>
          
          <nav className="sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? 'sidebar-nav-link active' : 'sidebar-nav-link'
                  }
                  onClick={() => setIsMobileOpen(false)}
                >
                  <Icon size={18} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-avatar">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="sidebar-user-details">
              <div className="sidebar-user-name-row">
                <span className="sidebar-user-name" title={user?.name || 'User'}>
                  {user?.name || 'User'}
                </span>
                <span className={`sidebar-role-badge ${roleBadge.className}`}>
                  {roleBadge.label}
                </span>
              </div>
              <span className="sidebar-user-email" title={user?.email || ''}>
                {user?.email || ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Sign out of your account"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
