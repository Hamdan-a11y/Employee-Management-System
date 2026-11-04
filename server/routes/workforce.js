const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { formatHeadcountRow, formatAttritionRow } = require('../utils/headcount');

// All workforce routes require authentication
router.use(authenticateToken);

/**
 * GET /api/workforce/headcount
 *
 * Access:
 * - Admin and HR Manager: view all departments
 * - Department Manager: view own department only
 * - Employee: no access (403 Forbidden)
 *
 * Returns per department:
 * - id
 * - name
 * - approved (approved_headcount)
 * - current (active employees only)
 * - gap (approved - current)
 * - status ("Needs Hiring" | "Balanced" | "Overstaffed - Review" | "Not Set")
 *
 * Uses a single query so departments with no employees still show.
 */
router.get('/headcount', async (req, res) => {
  try {
    const user = req.user;

    // Enforce role access
    if (user.role === 'employee') {
      return res.status(403).json({
        message: 'Access denied. Employees do not have permission to access workforce headcount planning.',
        userRole: user.role,
      });
    }

    if (user.role !== 'admin' && user.role !== 'hr_manager' && user.role !== 'department_manager') {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions for workforce headcount.',
        userRole: user.role,
      });
    }

    // Single query using LEFT JOIN to ensure departments with no employees still show
    let sql = `
      SELECT 
        d.id,
        d.name,
        d.approved_headcount AS approved,
        COUNT(e.id) AS current
      FROM departments d
      LEFT JOIN employees e 
        ON d.id = e.department_id 
        AND e.deleted_at IS NULL 
        AND e.status = 'Active'
    `;
    const params = [];

    // Department manager is restricted to their own department only
    if (user.role === 'department_manager') {
      if (!user.department_id) {
        return res.json([]);
      }
      sql += ' WHERE d.id = ?';
      params.push(user.department_id);
    }

    sql += ' GROUP BY d.id, d.name, d.approved_headcount ORDER BY d.name ASC';

    const [rows] = await pool.query(sql, params);
    const result = rows.map(formatHeadcountRow);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch workforce headcount data.',
      error: error.message,
    });
  }
});

/**
 * GET /api/workforce/attrition?months=12
 *
 * Query params:
 * - months: 3, 6, or 12 only (default 12)
 *
 * Access:
 * - Admin and HR Manager: view all departments
 * - Department Manager: view own department only
 * - Employee: no access (403 Forbidden)
 *
 * Returns per department:
 * - id
 * - name
 * - leavers (termination_date within last X months)
 * - current (active headcount)
 * - attritionRate (leavers ÷ current × 100, 0 if current = 0)
 * - status: under 10% = "Low", 10 to 20% = "Medium", over 20% = "High"
 *
 * Uses a single query so departments with no leavers still show.
 */
router.get('/attrition', async (req, res) => {
  try {
    const user = req.user;

    // Enforce role access
    if (user.role === 'employee') {
      return res.status(403).json({
        message: 'Access denied. Employees do not have permission to access workforce attrition data.',
        userRole: user.role,
      });
    }

    if (user.role !== 'admin' && user.role !== 'hr_manager' && user.role !== 'department_manager') {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions for workforce attrition.',
        userRole: user.role,
      });
    }

    // Validate months parameter (default 12, allowed: 3, 6, 12 only)
    const rawMonths = req.query.months !== undefined ? req.query.months : '12';
    const months = parseInt(rawMonths, 10);

    if (![3, 6, 12].includes(months)) {
      return res.status(400).json({
        message: 'Invalid months parameter. Allowed values are 3, 6, or 12 only.',
      });
    }

    // Single query using LEFT JOIN to ensure departments with no leavers still show
    let sql = `
      SELECT 
        d.id,
        d.name,
        SUM(CASE 
          WHEN e.deleted_at IS NULL AND e.status = 'Active' 
          THEN 1 ELSE 0 
        END) AS current,
        SUM(CASE 
          WHEN e.termination_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH) 
          THEN 1 ELSE 0 
        END) AS leavers
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
    `;
    const params = [months];

    // Department manager is restricted to their own department only
    if (user.role === 'department_manager') {
      if (!user.department_id) {
        return res.json([]);
      }
      sql += ' WHERE d.id = ?';
      params.push(user.department_id);
    }

    sql += ' GROUP BY d.id, d.name ORDER BY d.name ASC';

    const [rows] = await pool.query(sql, params);
    const result = rows.map(formatAttritionRow);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch workforce attrition data.',
      error: error.message,
    });
  }
});

module.exports = router;

