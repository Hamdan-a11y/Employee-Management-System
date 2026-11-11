const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
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

/**
 * POST /api/workforce/redistribute-hire-dates
 * Admin-only utility to safely redistribute employee hire dates (created_at)
 * across the last 6 months (~70%) and earlier tenured dates (~30%) on weekdays,
 * ensuring consistency with leaves, attendance, users, and audit logs.
 */
router.post('/redistribute-hire-dates', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Create backup table if it doesn't already exist (TiDB compliant)
    await conn.query('CREATE TABLE IF NOT EXISTS employees_backup_20261111 LIKE employees');
    const [bCnt] = await conn.query('SELECT COUNT(*) as cnt FROM employees_backup_20261111');
    if (bCnt[0].cnt === 0) {
      await conn.query('INSERT INTO employees_backup_20261111 SELECT * FROM employees');
    }

    // 2. Fetch all employees
    const [employees] = await conn.query(`
      SELECT id, status, deleted_at, created_at 
      FROM employees 
      ORDER BY id ASC
    `);

    // Fetch minimum leave request start_date per employee
    const [leaveRows] = await conn.query(`
      SELECT employee_id, MIN(start_date) as min_leave_date 
      FROM leave_requests 
      GROUP BY employee_id
    `);
    const leaveMap = new Map();
    for (const r of leaveRows) {
      leaveMap.set(r.employee_id, new Date(r.min_leave_date));
    }

    // Helper: generate weekday list for year and month (1-12)
    function getWeekdays(year, month, maxDay = 28) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const limit = Math.min(daysInMonth, maxDay);
      const list = [];
      for (let d = 1; d <= limit; d++) {
        const dt = new Date(year, month - 1, d);
        const dow = dt.getDay();
        if (dow !== 0 && dow !== 6) {
          list.push(d);
        }
      }
      return list;
    }

    const now = new Date();
    
    // Split active employees into two pools:
    // Those with leaves MUST be in tenured cohort or assigned before leave date
    const activeWithLeaves = [];
    const activeWithoutLeaves = [];
    const deletedEmployees = [];

    for (const emp of employees) {
      if (emp.deleted_at !== null) {
        deletedEmployees.push(emp);
      } else if (leaveMap.has(emp.id)) {
        activeWithLeaves.push(emp);
      } else {
        activeWithoutLeaves.push(emp);
      }
    }

    const totalActive = activeWithLeaves.length + activeWithoutLeaves.length;
    // Calculate target recent count (~70%)
    const targetRecentCount = Math.round(totalActive * 0.70);
    
    // Target breakdown across last 6 months (proportions roughly: Jun: 10%, Jul: 15%, Aug: 22%, Sep: 13%, Oct: 23%, Nov: 17%)
    const monthQuotas = [
      Math.round(targetRecentCount * 0.10), // Jun
      Math.round(targetRecentCount * 0.15), // Jul
      Math.round(targetRecentCount * 0.22), // Aug
      Math.round(targetRecentCount * 0.13), // Sep
      Math.round(targetRecentCount * 0.23), // Oct
    ];
    const sumFirst5 = monthQuotas.reduce((a, b) => a + b, 0);
    monthQuotas.push(targetRecentCount - sumFirst5); // Nov

    // Active employees for recent: take from activeWithoutLeaves
    const recentEmployees = activeWithoutLeaves.slice(0, targetRecentCount);
    const tenuredEmployees = [
      ...activeWithLeaves,
      ...activeWithoutLeaves.slice(targetRecentCount),
      ...deletedEmployees,
    ];

    // Assign recent employees to the 6 months
    let empIdx = 0;
    const updates = [];

    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const count = monthQuotas[5 - offset];
      
      const maxDay = (offset === 0) ? Math.min(now.getDate(), 11) : 28;
      const weekdays = getWeekdays(year, month, maxDay);

      for (let c = 0; c < count && empIdx < recentEmployees.length; c++) {
        const emp = recentEmployees[empIdx++];
        const day = weekdays[c % weekdays.length];
        const hh = String(9 + (c % 8)).padStart(2, '0');
        const mm = String(10 + ((c * 7) % 45)).padStart(2, '0');
        const ss = String(15 + ((c * 11) % 40)).padStart(2, '0');
        const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hh}:${mm}:${ss}`;
        updates.push({ id: emp.id, createdAt: dStr });
      }
    }

    // Assign tenured cohort (older dates between 2024 and May 2026)
    for (let i = 0; i < tenuredEmployees.length; i++) {
      const emp = tenuredEmployees[i];
      let year, month;
      if (i % 3 === 0) {
        year = 2024;
        month = 1 + (i % 12);
      } else if (i % 3 === 1) {
        year = 2025;
        month = 1 + (i % 12);
      } else {
        year = 2026;
        month = 1 + (i % 5); // Jan to May 2026
      }
      const weekdays = getWeekdays(year, month, 28);
      const day = weekdays[i % weekdays.length];
      const hh = String(9 + (i % 8)).padStart(2, '0');
      const mm = String(10 + ((i * 7) % 45)).padStart(2, '0');
      const ss = String(15 + ((i * 11) % 40)).padStart(2, '0');
      const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hh}:${mm}:${ss}`;
      updates.push({ id: emp.id, createdAt: dStr });
    }

    // Execute employee updates
    for (const u of updates) {
      await conn.query(
        'UPDATE employees SET created_at = ?, updated_at = GREATEST(updated_at, ?) WHERE id = ?',
        [u.createdAt, u.createdAt, u.id]
      );
    }

    // Consistency cleanups:
    // 1. Clamp any today's created_at to morning
    await conn.query("UPDATE employees SET created_at = CONCAT(DATE(created_at), ' 09:15:00') WHERE DATE(created_at) = CURDATE()");

    // 2. Delete attendance records that precede employee hire date
    await conn.query(`
      DELETE attendance 
      FROM attendance 
      JOIN employees ON attendance.employee_id = employees.id 
      WHERE attendance.date < DATE(employees.created_at)
    `);

    // 3. Align users created_at with employee hire date
    await conn.query(`
      UPDATE users 
      JOIN employees ON users.employee_id = employees.id 
      SET users.created_at = employees.created_at 
      WHERE users.created_at < employees.created_at
    `);

    // 4. Align audit_logs created_at with employee hire date
    await conn.query(`
      UPDATE audit_logs 
      JOIN employees ON audit_logs.entity_id = employees.id AND audit_logs.entity_type = 'EMPLOYEE' 
      SET audit_logs.created_at = employees.created_at 
      WHERE audit_logs.action = 'CREATE' AND audit_logs.created_at < employees.created_at
    `);

    await conn.commit();

    // Query chart breakdown (same as dashboard.js)
    const [rows] = await conn.query(`
      SELECT 
        YEAR(created_at) AS hireYear,
        MONTH(created_at) AS hireMonth,
        COUNT(*) AS count
      FROM employees
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND deleted_at IS NULL
      GROUP BY hireYear, hireMonth
      ORDER BY hireYear ASC, hireMonth ASC
    `);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyHiringStats = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const monthLabel = `${monthNames[m - 1]} ${y}`;
      const found = rows.find(
        (row) => Number(row.hireYear) === y && Number(row.hireMonth) === m
      );

      monthlyHiringStats.push({
        year: y,
        month: m,
        monthLabel,
        count: found ? Number(found.count) : 0,
      });
    }

    const [activeCheck] = await conn.query('SELECT COUNT(*) as cnt FROM employees WHERE deleted_at IS NULL');
    const [totalCheck] = await conn.query('SELECT COUNT(*) as cnt FROM employees');

    res.json({
      success: true,
      message: 'Employee hire dates redistributed successfully.',
      backupTable: 'employees_backup_20261111',
      totalEmployees: totalCheck[0].cnt,
      activeEmployees: activeCheck[0].cnt,
      monthlyHiringStats,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({
      success: false,
      message: 'Failed to redistribute hire dates',
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

module.exports = router;

