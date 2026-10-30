const pool = require('../db');
const { getPermissionsForRole } = require('../config/permissions');

/**
 * Middleware factory to enforce one or more required permissions.
 * Admins automatically bypass permission checks.
 */
function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const userPermissions = req.user.permissions || getPermissionsForRole(req.user.role);
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      return res.status(403).json({
        message: `Access denied. Requires permission(s): ${requiredPermissions.join(', ')}.`,
        userRole: req.user.role,
      });
    }

    next();
  };
}

/**
 * Middleware or utility to verify an employee belongs to a manager's department.
 * - Admin and HR Manager have company-wide access.
 * - Department Manager is strictly restricted to employees with matching department_id.
 * - Employee is strictly restricted to their own employee_id.
 */
async function verifyDepartmentAccess(req, targetEmployeeId) {
  if (!req.user) return false;
  if (req.user.role === 'admin' || req.user.role === 'hr_manager') return true;

  const empId = parseInt(targetEmployeeId, 10);
  if (isNaN(empId)) return false;

  // Regular employee can only access self
  if (req.user.role === 'employee') {
    return req.user.employee_id === empId;
  }

  // Department Manager check
  if (req.user.role === 'department_manager') {
    if (!req.user.department_id) return false;
    const [rows] = await pool.query('SELECT department_id FROM employees WHERE id = ?', [empId]);
    if (rows.length === 0) return false;
    return rows[0].department_id === req.user.department_id;
  }

  return false;
}

module.exports = {
  requirePermission,
  verifyDepartmentAccess,
};

