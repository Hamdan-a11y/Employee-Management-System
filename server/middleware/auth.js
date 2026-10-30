const jwt = require('jsonwebtoken');
const pool = require('../db');
const { getAccessTokenFromReq } = require('../utils/cookies');
const { getPermissionsForRole } = require('../config/permissions');

const authenticateToken = async (req, res, next) => {
  // Read token from HttpOnly cookie first, then fallback to header
  const cookieToken = getAccessTokenFromReq(req);
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No authentication token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user details including role, linked employee_id, and department_id
    const [users] = await pool.query(
      'SELECT id, name, email, role, employee_id, department_id, token_version FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'User account no longer exists.' });
    }

    const user = users[0];

    if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
      return res.status(401).json({
        message: 'Session invalidated due to password change. Please sign in again.',
        code: 'SESSION_INVALIDATED',
      });
    }

    let linkedEmployeeId = user.employee_id;
    let linkedDeptId = user.department_id;

    if (!linkedEmployeeId) {
      const [matched] = await pool.query('SELECT id, department_id FROM employees WHERE LOWER(email) = LOWER(?)', [user.email]);
      if (matched.length > 0) {
        linkedEmployeeId = matched[0].id;
        if (!linkedDeptId) {
          linkedDeptId = matched[0].department_id;
        }
      }
    } else if (!linkedDeptId) {
      const [matched] = await pool.query('SELECT department_id FROM employees WHERE id = ?', [linkedEmployeeId]);
      if (matched.length > 0) {
        linkedDeptId = matched[0].department_id;
      }
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'employee',
      employee_id: linkedEmployeeId || null,
      department_id: linkedDeptId || null,
      permissions: getPermissionsForRole(user.role || 'employee'),
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access token expired.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(403).json({ message: 'Invalid or expired authentication token.' });
  }
};

/**
 * Middleware factory to enforce required roles.
 * @param  {...string} roles Allowed roles (e.g. 'admin', 'employee')
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires one of the following roles: ${roles.join(', ')}.`,
        userRole: req.user.role
      });
    }

    next();
  };
};

const requireAdmin = requireRole('admin');

module.exports = authenticateToken;
module.exports.authenticateToken = authenticateToken;
module.exports.requireRole = requireRole;
module.exports.requireAdmin = requireAdmin;
