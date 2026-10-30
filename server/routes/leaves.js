const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requirePermission, verifyDepartmentAccess } = require('../middleware/rbac');
const { logAudit } = require('../services/auditLogger');
const { notifyEmployeeUser, notifyAdmins } = require('../services/notificationService');

// All leave endpoints require authentication
router.use(authenticateToken);

/**
 * Validates and formats date to 'YYYY-MM-DD' avoiding timezone offset shifts.
 */
function formatLocalDate(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') return dateVal.split('T')[0];
  if (dateVal instanceof Date) {
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(dateVal);
}

/**
 * Calculates inclusive calendar days between two dates.
 */
function calculateDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  // Set both to midnight UTC for clean calendar difference
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  
  const diffMs = endUtc - startUtc;
  if (diffMs < 0) return 0;
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Resolves effective employee_id from authenticated user.
 */
async function resolveEmployeeId(user, reqEmployeeId = null) {
  if (user.role === 'admin' && reqEmployeeId) {
    return parseInt(reqEmployeeId, 10);
  }

  if (user.employee_id) {
    return user.employee_id;
  }

  if (user.email) {
    const [rows] = await pool.query('SELECT id FROM employees WHERE LOWER(email) = LOWER(?)', [user.email]);
    if (rows.length > 0) {
      return rows[0].id;
    }
  }

  return null;
}

/**
 * Gets or initializes a leave_balances record for an employee and year.
 */
async function getOrInitLeaveBalance(conn, employeeId, year) {
  const [rows] = await conn.query(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?',
    [employeeId, year]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  // Insert default record
  await conn.query(
    `INSERT IGNORE INTO leave_balances (
      employee_id, year, annual_total, annual_used, sick_total, sick_used, casual_total, casual_used,
      maternity_total, maternity_used, paternity_total, paternity_used
    ) VALUES (?, ?, 15, 0, 10, 0, 5, 0, 90, 0, 10, 0)`,
    [employeeId, year]
  );

  const [createdRows] = await conn.query(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND year = ?',
    [employeeId, year]
  );

  return createdRows[0];
}

// =========================================================================
// 1. GET /api/leaves/balances — Get leave balances for an employee
// =========================================================================
router.get('/balances', async (req, res) => {
  try {
    const requestedEmpId = req.query.employee_id ? parseInt(req.query.employee_id, 10) : null;

    // RBAC: Check access to employee's leave balance
    if (requestedEmpId) {
      const hasAccess = await verifyDepartmentAccess(req, requestedEmpId);
      if (!hasAccess) {
        if (req.user.role === 'department_manager') {
          return res.status(403).json({
            message: 'Access denied: Department managers can only access leave balances for employees in their own department.',
            userRole: req.user.role
          });
        }
        return res.status(403).json({
          message: 'Access denied: You can only view your own leave balance.',
          userRole: req.user.role
        });
      }
    }

    const employeeId = await resolveEmployeeId(req.user, requestedEmpId);

    if (!employeeId) {
      return res.status(404).json({ message: 'No linked employee profile found for user.' });
    }

    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
    const balance = await getOrInitLeaveBalance(pool, employeeId, year);

    if (!balance) {
      return res.status(404).json({ message: 'Leave balance not found.' });
    }

    const summary = {
      employeeId,
      year: balance.year,
      annual: {
        total: balance.annual_total,
        used: balance.annual_used,
        remaining: Math.max(0, balance.annual_total - balance.annual_used),
      },
      sick: {
        total: balance.sick_total,
        used: balance.sick_used,
        remaining: Math.max(0, balance.sick_total - balance.sick_used),
      },
      casual: {
        total: balance.casual_total,
        used: balance.casual_used,
        remaining: Math.max(0, balance.casual_total - balance.casual_used),
      },
      maternity: {
        total: balance.maternity_total,
        used: balance.maternity_used,
        remaining: Math.max(0, balance.maternity_total - balance.maternity_used),
      },
      paternity: {
        total: balance.paternity_total,
        used: balance.paternity_used,
        remaining: Math.max(0, balance.paternity_total - balance.paternity_used),
      },
      totalAllocated: balance.annual_total + balance.sick_total + balance.casual_total,
      totalUsed: balance.annual_used + balance.sick_used + balance.casual_used,
      totalRemaining: Math.max(
        0,
        balance.annual_total + balance.sick_total + balance.casual_total -
        (balance.annual_used + balance.sick_used + balance.casual_used)
      ),
    };

    return res.status(200).json(summary);
  } catch (err) {
    console.error('[Leaves API] Error fetching leave balances:', err);
    return res.status(500).json({ message: 'Failed to retrieve leave balances.' });
  }
});

// =========================================================================
// 2. GET /api/leaves/requests — List leave requests with filters & pagination
// =========================================================================
router.get('/requests', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { status, leave_type, department_id, year, search } = req.query;

    let whereClauses = [];
    let queryParams = [];

    // RBAC: Role-based scoping for leave requests
    if (req.user.role === 'employee') {
      const employeeId = await resolveEmployeeId(req.user);
      if (!employeeId) {
        return res.status(200).json({
          requests: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false }
        });
      }
      whereClauses.push('lr.employee_id = ?');
      queryParams.push(employeeId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        whereClauses.push('1=0');
      } else {
        whereClauses.push('e.department_id = ?');
        queryParams.push(req.user.department_id);
      }
      if (req.query.employee_id) {
        whereClauses.push('lr.employee_id = ?');
        queryParams.push(parseInt(req.query.employee_id, 10));
      }
    } else {
      // Admin / HR Manager
      if (req.query.employee_id) {
        whereClauses.push('lr.employee_id = ?');
        queryParams.push(parseInt(req.query.employee_id, 10));
      }
      if (department_id && department_id !== 'all') {
        whereClauses.push('e.department_id = ?');
        queryParams.push(parseInt(department_id, 10));
      }
    }

    if (status && status !== 'all') {
      whereClauses.push('lr.status = ?');
      queryParams.push(status.toUpperCase());
    }

    if (leave_type && leave_type !== 'all') {
      whereClauses.push('lr.leave_type = ?');
      queryParams.push(leave_type);
    }

    if (year) {
      whereClauses.push('YEAR(lr.start_date) = ?');
      queryParams.push(parseInt(year, 10));
    }

    if (search && search.trim()) {
      const rawSearch = search.trim();
      const term = `%${rawSearch}%`;
      const normalizedIdStr = rawSearch.replace(/^id[:=\s]*/i, '').replace(/^#\s*/, '').replace(/^emp-?\s*/i, '').trim();
      const parsedId = parseInt(normalizedIdStr, 10);
      const isExplicitId = !isNaN(parsedId) && parsedId > 0 && /^(#|emp-?|id[:=\s])/i.test(rawSearch);

      if (isExplicitId) {
        whereClauses.push('(lr.employee_id = ? OR CONCAT("#", lr.employee_id) = ?)');
        queryParams.push(parsedId, rawSearch);
      } else {
        whereClauses.push('(e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR lr.employee_id = ? OR CONCAT("#", lr.employee_id) LIKE ?)');
        queryParams.push(term, term, term, !isNaN(parsedId) ? parsedId : -1, term);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total matching records
    const countSql = `
      SELECT COUNT(*) AS total
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      ${whereSql}
    `;
    const [countRows] = await pool.query(countSql, queryParams);
    const total = countRows[0].total;

    // Fetch paginated requests
    const selectSql = `
      SELECT 
        lr.id,
        lr.employee_id,
        e.name AS employee_name,
        CONCAT('EMP-', LPAD(e.id, 4, '0')) AS employee_code,
        e.email AS employee_email,
        d.name AS department_name,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        lr.days_count,
        lr.reason,
        lr.status,
        lr.rejection_reason,
        lr.reviewed_by,
        u.name AS reviewer_name,
        lr.reviewed_at,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      ${whereSql}
      ORDER BY lr.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(selectSql, [...queryParams, limit, offset]);

    // Format dates cleanly
    const formattedRows = rows.map((r) => ({
      ...r,
      start_date: formatLocalDate(r.start_date),
      end_date: formatLocalDate(r.end_date),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      requests: formattedRows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error('[Leaves API] Error fetching leave requests:', err);
    return res.status(500).json({ message: 'Failed to retrieve leave requests.' });
  }
});

// =========================================================================
// 3. POST /api/leaves/requests — Submit a new leave request
// =========================================================================
router.post('/requests', async (req, res) => {
  try {
    const { leave_type, start_date, end_date, reason, employee_id: overrideEmpId } = req.body;

    const employeeId = await resolveEmployeeId(req.user, overrideEmpId);
    if (!employeeId) {
      return res.status(404).json({ message: 'No linked employee profile found to submit leave request.' });
    }

    // 1. Validate required fields
    if (!leave_type || !start_date || !end_date || !reason || !reason.trim()) {
      return res.status(400).json({ message: 'Leave type, start date, end date, and reason are required.' });
    }

    const validTypes = ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid'];
    if (!validTypes.includes(leave_type)) {
      return res.status(400).json({ message: `Invalid leave type. Must be one of: ${validTypes.join(', ')}` });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid start or end date format.' });
    }

    if (start.getTime() > end.getTime()) {
      return res.status(400).json({ message: 'Start date cannot be after end date.' });
    }

    const formattedStart = formatLocalDate(start);
    const formattedEnd = formatLocalDate(end);
    const daysCount = calculateDays(formattedStart, formattedEnd);

    if (daysCount <= 0) {
      return res.status(400).json({ message: 'Leave request must span at least 1 day.' });
    }

    // 2. Overlap Prevention: Check for overlapping active requests (PENDING or APPROVED)
    const [overlapRows] = await pool.query(`
      SELECT id, leave_type, start_date, end_date, status
      FROM leave_requests
      WHERE employee_id = ?
        AND status IN ('PENDING', 'APPROVED')
        AND (start_date <= ? AND end_date >= ?)
      LIMIT 1
    `, [employeeId, formattedEnd, formattedStart]);

    if (overlapRows.length > 0) {
      const existing = overlapRows[0];
      return res.status(400).json({
        message: `Overlapping leave request detected. You already have an active (${existing.status}) ${existing.leave_type} leave from ${formatLocalDate(existing.start_date)} to ${formatLocalDate(existing.end_date)}.`,
      });
    }

    // 3. Balance Check: Check available balance if leave is paid
    const startYear = start.getFullYear();
    const balance = await getOrInitLeaveBalance(pool, employeeId, startYear);

    const typePrefixMap = {
      Annual: 'annual',
      Sick: 'sick',
      Casual: 'casual',
      Maternity: 'maternity',
      Paternity: 'paternity',
    };

    const prefix = typePrefixMap[leave_type];
    if (prefix) {
      const total = balance[`${prefix}_total`] || 0;
      const used = balance[`${prefix}_used`] || 0;
      const available = Math.max(0, total - used);

      if (used + daysCount > total) {
        return res.status(400).json({
          message: `Insufficient leave balance for ${leave_type} leave. Requested: ${daysCount} day(s), Available: ${available} day(s).`,
        });
      }
    }

    // 4. Insert Leave Request
    const [result] = await pool.query(`
      INSERT INTO leave_requests (
        employee_id, leave_type, start_date, end_date, days_count, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `, [employeeId, leave_type, formattedStart, formattedEnd, daysCount, reason.trim()]);

    const newRequestId = result.insertId;

    // Fetch employee name for notification
    const [empRows] = await pool.query('SELECT name FROM employees WHERE id = ?', [employeeId]);
    const employeeName = empRows[0]?.name || 'Employee';

    // 5. Notify Administrators
    await notifyAdmins({
      type: 'system',
      title: 'New Leave Request Submitted',
      message: `${employeeName} requested ${daysCount} day(s) of ${leave_type} leave (${formattedStart} to ${formattedEnd}).`,
      link: '/leaves',
      excludeUserId: req.user.id,
    });

    // 6. Audit Trail
    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'LEAVE_REQUEST',
      entityId: newRequestId,
      employeeName,
      details: `Submitted ${daysCount} day(s) ${leave_type} leave request from ${formattedStart} to ${formattedEnd}`,
    });

    return res.status(201).json({
      message: 'Leave request submitted successfully and is awaiting review.',
      requestId: newRequestId,
      days_count: daysCount,
    });
  } catch (err) {
    console.error('[Leaves API] Error submitting leave request:', err);
    return res.status(500).json({ message: 'Failed to submit leave request.' });
  }
});

// =========================================================================
// 4. PATCH /api/leaves/requests/:id/approve — Manager / Admin approval
// =========================================================================
router.patch('/requests/:id/approve', requirePermission('leave.manage'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      return res.status(400).json({ message: 'Invalid leave request ID.' });
    }

    await conn.beginTransaction();

    const [requests] = await conn.query(
      `SELECT lr.*, e.name AS employee_name, e.department_id
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.id = ? FOR UPDATE`,
      [requestId]
    );

    if (requests.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Leave request not found.' });
    }

    const leaveReq = requests[0];

    // RBAC: Department manager can only approve leave requests for employees in their own department
    if (req.user.role === 'department_manager' && leaveReq.department_id !== req.user.department_id) {
      await conn.rollback();
      return res.status(403).json({
        message: 'Access denied: Department managers can only manage leave requests for employees in their own department.',
        userRole: req.user.role
      });
    }

    if (leaveReq.status !== 'PENDING') {
      await conn.rollback();
      return res.status(400).json({ message: `Leave request has already been ${leaveReq.status.toLowerCase()}.` });
    }

    // Deduct from leave balance if not Unpaid
    const leaveYear = new Date(leaveReq.start_date).getFullYear();
    const balance = await getOrInitLeaveBalance(conn, leaveReq.employee_id, leaveYear);

    const typePrefixMap = {
      Annual: 'annual',
      Sick: 'sick',
      Casual: 'casual',
      Maternity: 'maternity',
      Paternity: 'paternity',
    };

    const prefix = typePrefixMap[leaveReq.leave_type];
    if (prefix) {
      const total = balance[`${prefix}_total`] || 0;
      const used = balance[`${prefix}_used`] || 0;

      if (used + leaveReq.days_count > total) {
        await conn.rollback();
        return res.status(400).json({
          message: `Cannot approve: Employee has insufficient ${leaveReq.leave_type} balance. Available: ${Math.max(0, total - used)} days, Required: ${leaveReq.days_count} days.`,
        });
      }

      await conn.query(
        `UPDATE leave_balances SET ${prefix}_used = ${prefix}_used + ? WHERE id = ?`,
        [leaveReq.days_count, balance.id]
      );
    }

    // Update request status
    await conn.query(`
      UPDATE leave_requests
      SET status = 'APPROVED',
          reviewed_by = ?,
          reviewed_at = NOW(),
          rejection_reason = NULL
      WHERE id = ?
    `, [req.user.id, requestId]);

    await conn.commit();

    const formattedStart = formatLocalDate(leaveReq.start_date);
    const formattedEnd = formatLocalDate(leaveReq.end_date);

    // In-app & email notification to employee
    await notifyEmployeeUser({
      employeeId: leaveReq.employee_id,
      type: 'system',
      title: 'Leave Request Approved',
      message: `Your ${leaveReq.days_count} day(s) ${leaveReq.leave_type} leave request (${formattedStart} to ${formattedEnd}) has been approved by ${req.user.name}.`,
      link: '/leaves',
      sendEmail: true,
      emailDetails: `Great news! Your ${leaveReq.leave_type} leave from ${formattedStart} to ${formattedEnd} (${leaveReq.days_count} days) has been officially approved.`,
    });

    // Audit Trail
    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'LEAVE_REQUEST',
      entityId: requestId,
      employeeName: leaveReq.employee_name,
      details: `Approved ${leaveReq.days_count} day(s) ${leaveReq.leave_type} leave (${formattedStart} to ${formattedEnd})`,
    });

    return res.status(200).json({
      message: 'Leave request approved successfully.',
      requestId,
      status: 'APPROVED',
    });
  } catch (err) {
    await conn.rollback();
    console.error('[Leaves API] Error approving leave request:', err);
    return res.status(500).json({ message: 'Failed to approve leave request.' });
  } finally {
    conn.release();
  }
});

// =========================================================================
// 5. PATCH /api/leaves/requests/:id/reject — Manager / Admin rejection
// =========================================================================
router.patch('/requests/:id/reject', requirePermission('leave.manage'), async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      return res.status(400).json({ message: 'Invalid leave request ID.' });
    }

    const { rejection_reason } = req.body;

    const [requests] = await pool.query(
      `SELECT lr.*, e.name AS employee_name, e.department_id
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.id = ?`,
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Leave request not found.' });
    }

    const leaveReq = requests[0];

    // RBAC: Department manager can only reject leave requests for employees in their own department
    if (req.user.role === 'department_manager' && leaveReq.department_id !== req.user.department_id) {
      return res.status(403).json({
        message: 'Access denied: Department managers can only manage leave requests for employees in their own department.',
        userRole: req.user.role
      });
    }

    if (leaveReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Leave request has already been ${leaveReq.status.toLowerCase()}.` });
    }

    const finalReason = rejection_reason && rejection_reason.trim()
      ? rejection_reason.trim()
      : 'Operational staffing constraints during requested dates.';

    await pool.query(`
      UPDATE leave_requests
      SET status = 'REJECTED',
          rejection_reason = ?,
          reviewed_by = ?,
          reviewed_at = NOW()
      WHERE id = ?
    `, [finalReason, req.user.id, requestId]);

    const formattedStart = formatLocalDate(leaveReq.start_date);
    const formattedEnd = formatLocalDate(leaveReq.end_date);

    // In-app & email notification to employee
    await notifyEmployeeUser({
      employeeId: leaveReq.employee_id,
      type: 'system',
      title: 'Leave Request Rejected',
      message: `Your ${leaveReq.leave_type} leave request (${formattedStart} to ${formattedEnd}) was rejected: "${finalReason}"`,
      link: '/leaves',
      sendEmail: true,
      emailDetails: `Your request for ${leaveReq.leave_type} leave from ${formattedStart} to ${formattedEnd} was not approved.\nReason: ${finalReason}`,
    });

    // Audit Trail
    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'LEAVE_REQUEST',
      entityId: requestId,
      employeeName: leaveReq.employee_name,
      details: `Rejected ${leaveReq.leave_type} leave request: ${finalReason}`,
    });

    return res.status(200).json({
      message: 'Leave request rejected successfully.',
      requestId,
      status: 'REJECTED',
    });
  } catch (err) {
    console.error('[Leaves API] Error rejecting leave request:', err);
    return res.status(500).json({ message: 'Failed to reject leave request.' });
  }
});

// =========================================================================
// 6. DELETE /api/leaves/requests/:id — Cancel a pending leave request
// =========================================================================
router.delete('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      return res.status(400).json({ message: 'Invalid leave request ID.' });
    }

    const [requests] = await pool.query(
      `SELECT lr.*, e.name AS employee_name
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.id = ?`,
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Leave request not found.' });
    }

    const leaveReq = requests[0];

    // Regular employee can only cancel their own request
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      const userEmpId = await resolveEmployeeId(req.user);
      if (leaveReq.employee_id !== userEmpId) {
        return res.status(403).json({ message: 'You can only cancel your own leave requests.' });
      }
    }

    if (leaveReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot cancel a leave request that is already ${leaveReq.status.toLowerCase()}.` });
    }

    await pool.query('DELETE FROM leave_requests WHERE id = ?', [requestId]);

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'LEAVE_REQUEST',
      entityId: requestId,
      employeeName: leaveReq.employee_name,
      details: `Cancelled pending ${leaveReq.leave_type} leave request`,
    });

    return res.status(200).json({ message: 'Leave request cancelled successfully.' });
  } catch (err) {
    console.error('[Leaves API] Error cancelling leave request:', err);
    return res.status(500).json({ message: 'Failed to cancel leave request.' });
  }
});

module.exports = router;

