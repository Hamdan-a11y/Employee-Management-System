const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const {
  getOvertimePolicy,
  calculateOvertime,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  getOvertimeMonthlyReport,
  formatLocalDate,
  isMonthClosed
} = require('../services/overtimeService');
const { logAudit } = require('../services/auditLogger');
const { generateCSV } = require('../utils/csvHelper');

// Protect all overtime endpoints with token authentication
router.use(authenticateToken);

// ==========================================
// 1. POLICIES CRUD
// ==========================================

/**
 * GET /api/overtime/policies
 * List versioned policies.
 */
router.get('/policies', async (req, res) => {
  try {
    const { department_id } = req.query;
    let sql = `
      SELECT p.*, d.name AS department_name
      FROM overtime_policies p
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (department_id) {
      if (department_id === 'company') {
        sql += ' AND p.department_id IS NULL';
      } else {
        sql += ' AND p.department_id = ?';
        params.push(parseInt(department_id, 10));
      }
    }

    sql += ' ORDER BY p.effective_date DESC, p.id DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ policies: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch overtime policies.', error: err.message });
  }
});

/**
 * GET /api/overtime/policies/current
 * Get currently effective policy for department or company.
 */
router.get('/policies/current', async (req, res) => {
  try {
    const { department_id, date = new Date() } = req.query;
    const policy = await getOvertimePolicy(department_id ? parseInt(department_id, 10) : null, date);
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch effective policy.', error: err.message });
  }
});

/**
 * POST /api/overtime/policies
 * Create a new versioned policy row. Old rows are NEVER edited.
 */
router.post('/policies', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      return res.status(403).json({ message: 'Access denied: Only Admin and HR can configure overtime policies.' });
    }

    const {
      department_id = null,
      threshold_minutes = 15,
      rounding_minutes = 15,
      regular_multiplier = 1.50,
      weekend_multiplier = 2.00,
      holiday_multiplier = 2.50,
      daily_cap_hours = 4.00,
      monthly_cap_hours = 40.00,
      approval_required = true,
      effective_date
    } = req.body;

    if (!effective_date) {
      return res.status(400).json({ message: 'effective_date is required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO overtime_policies (
        department_id,
        threshold_minutes,
        rounding_minutes,
        regular_multiplier,
        weekend_multiplier,
        holiday_multiplier,
        daily_cap_hours,
        monthly_cap_hours,
        approval_required,
        effective_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        department_id ? parseInt(department_id, 10) : null,
        parseInt(threshold_minutes, 10) || 15,
        parseInt(rounding_minutes, 10) || 15,
        parseFloat(regular_multiplier) || 1.50,
        parseFloat(weekend_multiplier) || 2.00,
        parseFloat(holiday_multiplier) || 2.50,
        parseFloat(daily_cap_hours) || 4.00,
        parseFloat(monthly_cap_hours) || 40.00,
        Boolean(approval_required),
        formatLocalDate(effective_date)
      ]
    );

    const [createdRows] = await pool.query('SELECT * FROM overtime_policies WHERE id = ?', [result.insertId]);

    logAudit({
      req,
      action: 'CREATE',
      entityType: 'OVERTIME_POLICY',
      entityId: result.insertId,
      details: `Created overtime policy effective from ${effective_date} for ${department_id ? 'Dept #' + department_id : 'Company Default'}`
    }).catch(() => {});

    res.status(201).json({
      message: 'Overtime policy created successfully.',
      policy: createdRows[0]
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create overtime policy.', error: err.message });
  }
});

// ==========================================
// 2. OVERTIME REQUESTS LIST & DETAILS
// ==========================================

/**
 * GET /api/overtime/requests
 * List overtime requests.
 * RBAC:
 * - Admin and HR: view all
 * - Dept Manager: view own department only
 * - Employee: view own only
 */
router.get('/requests', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      department_id,
      employee_id,
      month,
      start_date,
      end_date,
      over_cap
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT 
        r.*,
        e.name AS employee_name,
        e.department_id,
        d.name AS department_name,
        u.name AS reviewer_name
      FROM overtime_requests r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON r.reviewer_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // RBAC scoping
    if (req.user.role === 'employee') {
      const empId = req.user.employee_id;
      if (!empId) {
        return res.json({ requests: [], total: 0, page: pageNum, totalPages: 0 });
      }
      sql += ' AND r.employee_id = ?';
      params.push(empId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        return res.json({ requests: [], total: 0, page: pageNum, totalPages: 0 });
      }
      sql += ' AND e.department_id = ?';
      params.push(req.user.department_id);
    } else {
      // Admin / HR
      if (department_id && department_id !== 'all') {
        sql += ' AND e.department_id = ?';
        params.push(parseInt(department_id, 10));
      }
      if (employee_id) {
        sql += ' AND r.employee_id = ?';
        params.push(parseInt(employee_id, 10));
      }
    }

    if (status && status !== 'all') {
      sql += ' AND r.status = ?';
      params.push(status.toLowerCase());
    }

    if (over_cap !== undefined && over_cap !== 'all') {
      sql += ' AND r.over_cap = ?';
      params.push(over_cap === 'true' || over_cap === '1' ? 1 : 0);
    }

    if (month) {
      sql += ' AND r.work_date LIKE ?';
      params.push(`${month}%`);
    }

    if (start_date) {
      sql += ' AND r.work_date >= ?';
      params.push(formatLocalDate(start_date));
    }
    if (end_date) {
      sql += ' AND r.work_date <= ?';
      params.push(formatLocalDate(end_date));
    }

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS counted`;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY r.work_date DESC, r.id DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(sql, params);

    res.json({
      requests: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve overtime requests.', error: err.message });
  }
});

/**
 * GET /api/overtime/requests/:id
 */
router.get('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT r.*, e.name AS employee_name, e.department_id, d.name AS department_name, u.name AS reviewer_name
       FROM overtime_requests r
       JOIN employees e ON r.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users u ON r.reviewer_id = u.id
       WHERE r.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Overtime request not found.' });
    }
    const request = rows[0];

    // RBAC
    if (req.user.role === 'employee' && Number(req.user.employee_id) !== Number(request.employee_id)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (req.user.role === 'department_manager' && Number(req.user.department_id) !== Number(request.department_id)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json({ request });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch overtime request.', error: err.message });
  }
});

// ==========================================
// 3. APPROVE & REJECT ACTIONS
// ==========================================

/**
 * PATCH /api/overtime/requests/:id/approve
 * Approves request. Supports optional fewer minutes + reason.
 */
router.patch('/requests/:id/approve', async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Employees cannot approve overtime.' });
    }

    const { id } = req.params;
    const { approved_minutes, reason } = req.body;

    const updatedRequest = await approveOvertimeRequest({
      requestId: id,
      reviewerUser: req.user,
      approvedMinutes: approved_minutes,
      reason,
      req
    });

    res.json({
      message: 'Overtime request approved successfully.',
      request: updatedRequest
    });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

/**
 * PATCH /api/overtime/requests/:id/reject
 * Rejects request with a mandatory comment.
 */
router.patch('/requests/:id/reject', async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Employees cannot reject overtime.' });
    }

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'A rejection comment is required.' });
    }

    const updatedRequest = await rejectOvertimeRequest({
      requestId: id,
      reviewerUser: req.user,
      comment,
      req
    });

    res.json({
      message: 'Overtime request rejected.',
      request: updatedRequest
    });
  } catch (err) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ message: err.message });
  }
});

// ==========================================
// 4. MONTHLY REPORT & CSV EXPORT
// ==========================================

/**
 * GET /api/overtime/report/monthly
 * Returns monthly summary with breakdown by type, pending, rejected, and weighted hours.
 */
router.get('/report/monthly', async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let departmentId = req.query.department_id || null;

    if (req.user.role === 'department_manager') {
      departmentId = req.user.department_id;
    }

    const report = await getOvertimeMonthlyReport({ month, departmentId });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate monthly overtime report.', error: err.message });
  }
});

/**
 * GET /api/overtime/report/export/csv
 * Exports monthly overtime report as CSV.
 */
router.get('/report/export/csv', async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let departmentId = req.query.department_id || null;

    if (req.user.role === 'department_manager') {
      departmentId = req.user.department_id;
    }

    const report = await getOvertimeMonthlyReport({ month, departmentId });

    const csvFields = [
      { label: 'Work Date', value: 'work_date' },
      { label: 'Employee Name', value: 'employee_name' },
      { label: 'Department', value: 'department_name' },
      { label: 'Minutes', value: 'minutes' },
      { label: 'Hours', value: (row) => (row.minutes / 60.0).toFixed(2) },
      { label: 'Day Type', value: 'day_type' },
      { label: 'Multiplier', value: 'multiplier' },
      { label: 'Weighted Hours', value: (row) => ((row.minutes / 60.0) * row.multiplier).toFixed(2) },
      { label: 'Status', value: 'status' },
      { label: 'Over Cap', value: (row) => (row.over_cap ? 'Yes' : 'No') },
      { label: 'Comments', value: 'comment' }
    ];

    const csvData = generateCSV(report.requests, csvFields);
    res.header('Content-Type', 'text/csv');
    res.attachment(`overtime_report_${month}.csv`);
    return res.send(csvData);
  } catch (err) {
    res.status(500).json({ message: 'Failed to export overtime report.', error: err.message });
  }
});

module.exports = router;
