const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const {
  getDepartmentAttendance,
  getPunctualityRanking,
  getMonthlyAbsenteeismTrend,
  getAverageWorkingHours,
  getOvertimeTrend,
  getFrequentLateArrivals,
  getEmployeeAttendanceCalendar,
  getAnalyticsComparison,
  getAnalyticsSummary,
} = require('../services/analyticsService');

// All analytics routes require authentication
router.use(authenticateToken);

/**
 * RBAC Middleware: Enforces department scoping and blocks employees from team/company rankings.
 */
function enforceDepartmentScope(req, res, next) {
  const { role, department_id } = req.user;

  if (role === 'employee') {
    return res.status(403).json({
      message: 'Access denied: Employees can only view their own attendance calendar.',
      role,
    });
  }

  if (role === 'department_manager') {
    const requestedDeptId = req.query.department_id ? parseInt(req.query.department_id, 10) : null;
    if (requestedDeptId && requestedDeptId !== department_id) {
      return res.status(403).json({
        message: 'Access denied: Department managers can only view analytics for their own department.',
        role,
      });
    }
    // Pin to department manager's department
    req.effectiveDepartmentId = department_id;
  } else {
    // Admin & HR Manager have access to all departments or requested department
    req.effectiveDepartmentId = req.query.department_id && req.query.department_id !== 'all'
      ? parseInt(req.query.department_id, 10)
      : null;
  }

  next();
}

/**
 * GET /api/analytics/summary
 * Summary metrics: overall attendance %, average hours, total late, total absences.
 */
router.get('/summary', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const summary = await getAnalyticsSummary({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch analytics summary.', error: err.message });
  }
});

/**
 * GET /api/analytics/department-attendance
 * Department attendance %: present days / expected working days.
 */
router.get('/department-attendance', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const data = await getDepartmentAttendance({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json({ departments: data });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch department attendance.', error: err.message });
  }
});

/**
 * GET /api/analytics/punctuality-ranking
 * Punctuality ranking: on-time days / days present. Top and bottom 10.
 */
router.get('/punctuality-ranking', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const ranking = await getPunctualityRanking({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json(ranking);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch punctuality ranking.', error: err.message });
  }
});

/**
 * GET /api/analytics/absenteeism-trend
 * Monthly absenteeism trend with LAG() change.
 */
router.get('/absenteeism-trend', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const trend = await getMonthlyAbsenteeismTrend({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json({ trend });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch absenteeism trend.', error: err.message });
  }
});

/**
 * GET /api/analytics/working-hours
 * Average working hours per department and per month.
 */
router.get('/working-hours', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const hours = await getAverageWorkingHours({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json({ working_hours: hours });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch average working hours.', error: err.message });
  }
});

/**
 * GET /api/analytics/overtime-trend
 * Approved overtime hours per month by type.
 */
router.get('/overtime-trend', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month } = req.query;
    const trend = await getOvertimeTrend({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
    });
    res.json({ overtime_trend: trend });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch overtime trend.', error: err.message });
  }
});

/**
 * GET /api/analytics/frequent-lates
 * Employees with the most late days and total late minutes (paginated).
 */
router.get('/frequent-lates', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month, page, limit } = req.query;
    const result = await getFrequentLateArrivals({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch frequent late arrivals.', error: err.message });
  }
});

/**
 * GET /api/analytics/comparison
 * Departments side by side, and month vs month.
 */
router.get('/comparison', enforceDepartmentScope, async (req, res) => {
  try {
    const { start_month, end_month, mode } = req.query;
    const comparison = await getAnalyticsComparison({
      startMonth: start_month,
      endMonth: end_month,
      departmentId: req.effectiveDepartmentId,
      mode: mode || 'department',
    });
    res.json({ comparison });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch comparison analytics.', error: err.message });
  }
});

/**
 * GET /api/analytics/employee-calendar
 * For one employee and month, each day with its type and check-in/out times.
 * Accessible by:
 * - Admin and HR Manager (all employees)
 * - Department Manager (employees in own department only)
 * - Employee (own calendar only)
 */
router.get('/employee-calendar', async (req, res) => {
  try {
    const { role } = req.user;
    let targetEmployeeId = req.query.employee_id ? parseInt(req.query.employee_id, 10) : null;

    if (role === 'employee') {
      let ownEmployeeId = req.user.employee_id;
      if (!ownEmployeeId) {
        const [empRows] = await pool.query(
          'SELECT id FROM employees WHERE user_id = ? OR LOWER(email) = LOWER(?)',
          [req.user.id, req.user.email]
        );
        ownEmployeeId = empRows[0]?.id;
      }

      if (!ownEmployeeId) {
        return res.status(404).json({ message: 'No linked employee profile found for user.' });
      }

      if (targetEmployeeId && targetEmployeeId !== ownEmployeeId) {
        return res.status(403).json({
          message: 'Access denied: Employees can only view their own attendance calendar.',
        });
      }
      targetEmployeeId = ownEmployeeId;
    } else if (role === 'department_manager') {
      if (!targetEmployeeId) {
        return res.status(400).json({ message: 'employee_id query parameter is required.' });
      }
      // Check that employee belongs to manager's department
      const [empRows] = await pool.query(
        'SELECT department_id FROM employees WHERE id = ?',
        [targetEmployeeId]
      );
      if (empRows.length === 0 || empRows[0].department_id !== req.user.department_id) {
        return res.status(403).json({
          message: 'Access denied: Department managers can only view calendars of employees in their own department.',
        });
      }
    } else {
      // Admin / HR Manager
      if (!targetEmployeeId) {
        // Fallback: pick first active employee or user's linked employee
        const [firstEmp] = await pool.query('SELECT id FROM employees WHERE deleted_at IS NULL LIMIT 1');
        targetEmployeeId = firstEmp[0]?.id;
      }
    }

    if (!targetEmployeeId) {
      return res.status(400).json({ message: 'Valid employee_id is required.' });
    }

    const calendar = await getEmployeeAttendanceCalendar({
      employeeId: targetEmployeeId,
      month: req.query.month,
    });

    if (!calendar) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    res.json(calendar);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load employee attendance calendar.', error: err.message });
  }
});

module.exports = router;
