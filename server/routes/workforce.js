const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const {
  formatHeadcountRow,
  formatAttritionRow,
  formatOvertimeRow,
  formatLeavePressureRow,
} = require('../utils/headcount');

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
        d.approved_headcount AS approved,
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

    sql += ' GROUP BY d.id, d.name, d.approved_headcount ORDER BY d.name ASC';

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

/**
 * GET /api/workforce/overtime?months=3
 *
 * Query params:
 * - months: 1, 3, or 6 only (default 3)
 *
 * Access:
 * - Admin and HR Manager: view all departments
 * - Department Manager: view own department only
 * - Employee: no access (403 Forbidden)
 *
 * Returns per department:
 * - id
 * - name
 * - avgDailyHours (average working hours per attendance day within last X months, 0 if no data)
 * - overtimePercent ((avgDailyHours - 8) ÷ 8 × 100, 0 if negative or no data)
 * - status (under 5% = "Normal", 5 to 15% = "High", over 15% = "Very High", or "No Data")
 *
 * Uses a single query so departments with no attendance data still show (as 0 / "No Data").
 */
router.get('/overtime', async (req, res) => {
  try {
    const user = req.user;

    // Enforce role access
    if (user.role === 'employee') {
      return res.status(403).json({
        message: 'Access denied. Employees do not have permission to access workforce overtime data.',
        userRole: user.role,
      });
    }

    if (user.role !== 'admin' && user.role !== 'hr_manager' && user.role !== 'department_manager') {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions for workforce overtime.',
        userRole: user.role,
      });
    }

    // Validate months parameter (default 3, allowed: 1, 3, 6 only)
    const rawMonths = req.query.months !== undefined ? req.query.months : '3';
    const months = parseInt(rawMonths, 10);

    if (![1, 3, 6].includes(months)) {
      return res.status(400).json({
        message: 'Invalid months parameter. Allowed values are 1, 3, or 6 only.',
      });
    }

    // Single query using LEFT JOIN to ensure departments with no attendance still show
    let sql = `
      SELECT 
        d.id,
        d.name,
        COUNT(CASE WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL THEN 1 ELSE NULL END) AS attendance_days,
        AVG(CASE 
          WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL 
          THEN (CASE WHEN a.total_hours > 0 THEN a.total_hours ELSE GREATEST(0, TIMESTAMPDIFF(SECOND, a.check_in, a.check_out) / 3600.0) END)
          ELSE NULL 
        END) AS avg_daily_hours
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND a.date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        AND a.check_in IS NOT NULL 
        AND a.check_out IS NOT NULL
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
    const result = rows.map(formatOvertimeRow);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch workforce overtime data.',
      error: error.message,
    });
  }
});

/**
 * GET /api/workforce/leave-pressure?months=3
 *
 * Query params:
 * - months: 1, 3, or 6 only (default 3)
 *
 * Access:
 * - Admin and HR Manager: view all departments
 * - Department Manager: view own department only
 * - Employee: no access (403 Forbidden)
 *
 * Returns per department:
 * - id
 * - name
 * - avgOnLeave (average employees on approved leave per working day within last X months, 0 if no leave)
 * - leavePressure (avgOnLeave ÷ active headcount × 100, 0 if headcount is 0)
 * - status (under 5% = "Low", 5 to 10% = "Medium", over 10% = "High")
 *
 * Uses a single query so departments with no leave still show (as 0 / "Low").
 */
router.get('/leave-pressure', async (req, res) => {
  try {
    const user = req.user;

    // Enforce role access
    if (user.role === 'employee') {
      return res.status(403).json({
        message: 'Access denied. Employees do not have permission to access workforce leave pressure data.',
        userRole: user.role,
      });
    }

    if (user.role !== 'admin' && user.role !== 'hr_manager' && user.role !== 'department_manager') {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions for workforce leave pressure.',
        userRole: user.role,
      });
    }

    // Validate months parameter (default 3, allowed: 1, 3, 6 only)
    const rawMonths = req.query.months !== undefined ? req.query.months : '3';
    const months = parseInt(rawMonths, 10);

    if (![1, 3, 6].includes(months)) {
      return res.status(400).json({
        message: 'Invalid months parameter. Allowed values are 1, 3, or 6 only.',
      });
    }

    // Single query counting working days and employee-leave days using recursive CTE
    let deptWhere = '';
    const params = [months];

    if (user.role === 'department_manager') {
      if (!user.department_id) {
        return res.json([]);
      }
      deptWhere = ' WHERE d.id = ?';
      params.push(user.department_id);
    }

    const sql = `
      WITH RECURSIVE calendar AS (
        SELECT DATE_SUB(CURDATE(), INTERVAL ? MONTH) AS dt
        UNION ALL
        SELECT DATE_ADD(dt, INTERVAL 1 DAY)
        FROM calendar
        WHERE dt < CURDATE()
      ),
      working_days AS (
        SELECT dt
        FROM calendar
        WHERE DAYOFWEEK(dt) NOT IN (1, 7)
          AND DATE_FORMAT(dt, '%m-%d') NOT IN ('01-01', '07-04', '12-25')
      )
      SELECT 
        d.id,
        d.name,
        COUNT(DISTINCT CASE WHEN e.deleted_at IS NULL AND e.status = 'Active' THEN e.id ELSE NULL END) AS active_headcount,
        (SELECT COUNT(*) FROM working_days) AS total_work_days,
        COUNT(DISTINCT CASE 
          WHEN lr.id IS NOT NULL 
          THEN CONCAT(wd.dt, '-', lr.employee_id) 
          ELSE NULL 
        END) AS total_leave_days
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL AND e.status = 'Active'
      LEFT JOIN leave_requests lr ON e.id = lr.employee_id AND lr.status = 'APPROVED'
      LEFT JOIN working_days wd ON wd.dt >= lr.start_date AND wd.dt <= lr.end_date
      ${deptWhere}
      GROUP BY d.id, d.name
      ORDER BY d.name ASC;
    `;

    const [rows] = await pool.query(sql, params);
    const result = rows.map(formatLeavePressureRow);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch workforce leave pressure data.',
      error: error.message,
    });
  }
});

module.exports = router;

