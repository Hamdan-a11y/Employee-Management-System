const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requirePermission, verifyDepartmentAccess } = require('../middleware/rbac');
const { logAudit } = require('../services/auditLogger');
const { notifyEmployeeUser, notifyAdmins } = require('../services/notificationService');
const { generateCSV } = require('../utils/csvHelper');

// Protect all attendance routes with token authentication
router.use(authenticateToken);

/**
 * Calculates whether a check-in is late based on standard 09:00 AM shift and 15-minute grace period (09:15 AM).
 */
function calculateLateDetails(checkInDateObj) {
  const checkIn = new Date(checkInDateObj);

  // Shift start: 09:00:00 on the day of check-in
  const shiftStart = new Date(checkIn);
  shiftStart.setHours(9, 0, 0, 0);

  // Grace cutoff: 09:15:00
  const graceCutoff = new Date(checkIn);
  graceCutoff.setHours(9, 15, 0, 0);

  if (checkIn.getTime() > graceCutoff.getTime()) {
    const diffMs = checkIn.getTime() - shiftStart.getTime();
    const lateMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return { isLate: true, lateMinutes, status: 'Late' };
  }

  return { isLate: false, lateMinutes: 0, status: 'Present' };
}

/**
 * Calculates work hours between check-in and check-out.
 */
function calculateWorkHours(checkInDateObj, checkOutDateObj) {
  const checkIn = new Date(checkInDateObj);
  const checkOut = new Date(checkOutDateObj);
  const diffMs = checkOut.getTime() - checkIn.getTime();
  if (diffMs <= 0) return 0;
  const hours = diffMs / (1000 * 60 * 60);
  return parseFloat(hours.toFixed(2));
}

/**
 * Safely formats a Date object or string into a calendar date string 'YYYY-MM-DD' without UTC timezone offset shift.
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
 * Formats JS Date or timestamp string into MySQL standard 'YYYY-MM-DD HH:MM:SS' format.
 */
function toMySqlDateTime(dateInput) {
  const d = new Date(dateInput);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Helper to resolve target employee_id for check-in / check-out actions.
 */
async function resolveEmployeeId(req) {
  if (req.user.employee_id) {
    return req.user.employee_id;
  }
  // If user has admin role and explicitly provides employee_id in request
  if (req.user.role === 'admin' && req.body && req.body.employee_id) {
    return parseInt(req.body.employee_id, 10);
  }
  // Try matching user email in employees table
  const [matched] = await pool.query(
    'SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL',
    [req.user.email]
  );
  if (matched.length > 0) {
    return matched[0].id;
  }
  return null;
}

// ==========================================
// 1. TODAY'S STATUS & QUICK PUNCH
// ==========================================

/**
 * GET /api/attendance/today
 * Returns today's attendance record and punch status for the authenticated user.
 */
router.get('/today', async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) {
      return res.json({
        employeeId: null,
        record: null,
        hasCheckedIn: false,
        hasCheckedOut: false,
        message: 'No linked employee profile found.'
      });
    }

    const [rows] = await pool.query(
      `SELECT a.*, e.name AS employee_name
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.employee_id = ? AND a.date = CURDATE()`,
      [employeeId]
    );

    const record = rows[0] || null;

    res.json({
      employeeId,
      record,
      hasCheckedIn: Boolean(record),
      hasCheckedOut: Boolean(record && record.check_out)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch today attendance.', error: error.message });
  }
});

/**
 * POST /api/attendance/check-in
 * Records check-in for today. Prevents duplicate check-ins.
 */
router.post('/check-in', async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({ message: 'No linked employee profile found for your account.' });
    }

    // 1. Check if employee exists and is active
    const [empRows] = await pool.query(
      'SELECT id, name, status FROM employees WHERE id = ? AND deleted_at IS NULL',
      [employeeId]
    );
    if (empRows.length === 0) {
      return res.status(404).json({ message: 'Employee record not found.' });
    }
    const employee = empRows[0];

    // 2. Prevent duplicate check-in for the same date
    const [existing] = await pool.query(
      'SELECT id, check_in, check_out FROM attendance WHERE employee_id = ? AND date = CURDATE()',
      [employeeId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: 'You have already checked in for today.',
        alreadyCheckedIn: true,
        record: existing[0]
      });
    }

    // 3. Determine check-in timestamp and calculate late arrival metrics
    const now = new Date();
    const { isLate, lateMinutes, status } = calculateLateDetails(now);

    const [result] = await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, is_late, late_minutes, status)
       VALUES (?, CURDATE(), NOW(), ?, ?, ?)`,
      [employeeId, isLate, lateMinutes, status]
    );

    const newId = result.insertId;

    const [savedRows] = await pool.query('SELECT * FROM attendance WHERE id = ?', [newId]);
    const savedRecord = savedRows[0];

    // Optional: Log audit if late
    if (isLate) {
      logAudit({
        req,
        action: 'CREATE',
        entityType: 'ATTENDANCE',
        entityId: newId,
        employeeName: employee.name,
        details: `Late check-in recorded (${lateMinutes} mins late) on ${savedRecord.date}`
      }).catch(() => {});
    }

    res.status(201).json({
      message: isLate
        ? `Check-in recorded. Marked late by ${lateMinutes} minutes.`
        : 'Check-in recorded successfully on time.',
      attendance: savedRecord
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'You have already checked in for today.' });
    }
    res.status(500).json({ message: 'Failed to record check-in.', error: error.message });
  }
});

/**
 * POST /api/attendance/check-out
 * Records check-out for today. Prevents checkout without checkin, duplicate checkouts, and invalid times.
 */
router.post('/check-out', async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({ message: 'No linked employee profile found for your account.' });
    }

    // 1. Fetch active check-in for today
    const [existing] = await pool.query(
      `SELECT a.*, e.name AS employee_name
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.employee_id = ? AND a.date = CURDATE()`,
      [employeeId]
    );

    if (existing.length === 0) {
      return res.status(400).json({
        message: 'No active check-in record found for today. Please check in first before checking out.'
      });
    }

    const record = existing[0];

    // 2. Prevent duplicate checkout
    if (record.check_out) {
      return res.status(400).json({
        message: 'You have already checked out for today.',
        alreadyCheckedOut: true,
        record
      });
    }

    const now = new Date();
    const checkInTime = new Date(record.check_in);

    // 3. Prevent invalid checkout times (must be strictly after check_in)
    if (now.getTime() <= checkInTime.getTime()) {
      return res.status(400).json({
        message: 'Check-out time must be after check-in time.'
      });
    }

    // 4. Calculate total working hours
    const totalHours = calculateWorkHours(checkInTime, now);
    let finalStatus = record.status;
    if (totalHours < 4 && finalStatus !== 'Late') {
      finalStatus = 'Half Day';
    }

    await pool.query(
      `UPDATE attendance 
       SET check_out = NOW(), total_hours = ?, status = ?
       WHERE id = ?`,
      [totalHours, finalStatus, record.id]
    );

    const [updatedRows] = await pool.query('SELECT * FROM attendance WHERE id = ?', [record.id]);
    const updatedRecord = updatedRows[0];

    res.json({
      message: `Check-out recorded successfully. Total working time: ${totalHours} hours.`,
      attendance: updatedRecord
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to record check-out.', error: error.message });
  }
});

// ==========================================
// 2. ATTENDANCE LOGS & HISTORY
// ==========================================

/**
 * GET /api/attendance/history
 * List attendance logs with server-side pagination, search, status, and date range filters.
 * Admins can view all employees; regular employees are scoped to their own records.
 */
router.get('/history', async (req, res) => {
  try {
    const {
      search,
      department_id,
      status,
      startDate,
      endDate,
      employee_id,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = ' WHERE 1=1';
    const params = [];

    // RBAC: Non-admin employees only view their own history; Dept managers locked to own department
    if (req.user.role === 'employee') {
      const empId = await resolveEmployeeId(req);
      if (!empId) {
        return res.json({
          records: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 1 }
        });
      }
      whereClause += ' AND a.employee_id = ?';
      params.push(empId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        whereClause += ' AND 1=0';
      } else {
        whereClause += ' AND e.department_id = ?';
        params.push(req.user.department_id);
      }
      if (employee_id && employee_id !== 'all') {
        whereClause += ' AND a.employee_id = ?';
        params.push(employee_id);
      }
    } else if (employee_id && employee_id !== 'all') {
      whereClause += ' AND a.employee_id = ?';
      params.push(employee_id);
    }

    // Search by employee name, email, or employee ID (supports #2, 2, EMP-2)
    if (search && search.trim() !== '') {
      const rawSearch = search.trim();
      const s = `%${rawSearch}%`;
      const normalizedIdStr = rawSearch.replace(/^id[:=\s]*/i, '').replace(/^#\s*/, '').replace(/^emp-?\s*/i, '').trim();
      const parsedId = parseInt(normalizedIdStr, 10);
      const isExplicitId = !isNaN(parsedId) && parsedId > 0 && /^(#|emp-?|id[:=\s])/i.test(rawSearch);
      const isPureNumber = /^\d+$/.test(rawSearch);

      if (isExplicitId) {
        whereClause += ' AND (e.id = ? OR CONCAT("#", e.id) = ? OR CONCAT("EMP-", LPAD(e.id, 4, "0")) = ?)';
        params.push(parsedId, rawSearch, rawSearch);
      } else if (isPureNumber) {
        whereClause += ' AND (e.id = ? OR CAST(e.id AS CHAR) LIKE ? OR CONCAT("#", e.id) LIKE ? OR e.name LIKE ? OR e.email LIKE ?)';
        params.push(parsedId, s, s, s, s);
      } else {
        whereClause += ' AND (e.name LIKE ? OR e.email LIKE ? OR CAST(e.id AS CHAR) LIKE ? OR CONCAT("#", e.id) LIKE ?)';
        params.push(s, s, s, s);
      }
    }

    // Department filter (admin / hr_manager only)
    if (req.user.role !== 'department_manager' && department_id && department_id !== 'all') {
      whereClause += ' AND e.department_id = ?';
      params.push(department_id);
    }

    // Status filter (Present, Late, Half Day, Absent)
    if (status && status !== 'all') {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }

    // Date range filter
    if (startDate && startDate.trim() !== '') {
      whereClause += ' AND a.date >= ?';
      params.push(startDate.trim());
    }
    if (endDate && endDate.trim() !== '') {
      whereClause += ' AND a.date <= ?';
      params.push(endDate.trim());
    }

    // Allowed sort columns
    const SORT_MAP = {
      date: 'a.date',
      check_in: 'a.check_in',
      check_out: 'a.check_out',
      total_hours: 'a.total_hours',
      status: 'a.status',
      employee_name: 'e.name'
    };
    const sortCol = SORT_MAP[sortBy] || 'a.date';
    const sortDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // 1. Total matching count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
    `;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    // 2. Fetch records
    const dataSql = `
      SELECT 
        a.id,
        a.employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        d.name AS department_name,
        a.date,
        a.check_in,
        a.check_out,
        a.total_hours,
        a.is_late,
        a.late_minutes,
        a.status,
        a.is_corrected,
        a.notes,
        a.created_at
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir}, a.check_in DESC
      LIMIT ? OFFSET ?
    `;

    const [records] = await pool.query(dataSql, [...params, limitNum, offset]);

    res.json({
      records,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attendance history.', error: error.message });
  }
});

// ==========================================
// 3. MONTHLY ATTENDANCE REPORT & EXPORTS
// ==========================================

/**
 * GET /api/attendance/report/monthly
 * Returns monthly summary metrics per employee for a specified month & year.
 */
router.get('/report/monthly', async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const departmentId = req.query.department_id;

    let baseQuery = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        e.designation,
        d.name AS department_name,
        COUNT(a.id) AS days_recorded,
        SUM(CASE WHEN a.status IN ('Present', 'Late', 'Half Day') THEN 1 ELSE 0 END) AS days_present,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS days_late,
        SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) AS days_half_day,
        ROUND(COALESCE(SUM(a.total_hours), 0), 2) AS total_hours_worked,
        ROUND(COALESCE(AVG(CASE WHEN a.total_hours > 0 THEN a.total_hours ELSE NULL END), 0), 2) AS avg_hours_per_day
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND YEAR(a.date) = ? 
        AND MONTH(a.date) = ?
      WHERE e.deleted_at IS NULL
    `;
    const params = [year, month];

    // RBAC: Scoping for employees and department managers
    if (req.user.role === 'employee') {
      const empId = await resolveEmployeeId(req);
      baseQuery += ' AND e.id = ?';
      params.push(empId || -1);
    } else if (req.user.role === 'department_manager') {
      baseQuery += ' AND e.department_id = ?';
      params.push(req.user.department_id || -1);
    } else if (departmentId && departmentId !== 'all') {
      baseQuery += ' AND e.department_id = ?';
      params.push(departmentId);
    }

    baseQuery += `
      GROUP BY e.id, e.name, e.email, e.designation, d.name
      ORDER BY e.name ASC
    `;

    const [rows] = await pool.query(baseQuery, params);

    // Calculate company-wide / team-wide metrics summary
    const summary = rows.reduce(
      (acc, r) => {
        acc.totalEmployees += 1;
        acc.totalPresentDays += Number(r.days_present || 0);
        acc.totalLateDays += Number(r.days_late || 0);
        acc.totalHours += Number(r.total_hours_worked || 0);
        return acc;
      },
      { totalEmployees: 0, totalPresentDays: 0, totalLateDays: 0, totalHours: 0 }
    );
    summary.totalHours = parseFloat(summary.totalHours.toFixed(2));

    res.json({
      year,
      month,
      summary,
      report: rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate monthly attendance report.', error: error.message });
  }
});

/**
 * GET /api/attendance/report/export/csv
 * Export monthly report to CSV format.
 */
router.get('/report/export/csv', requirePermission('employee.export'), async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const departmentId = req.query.department_id;

    let baseQuery = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        d.name AS department_name,
        e.designation,
        COUNT(a.id) AS days_recorded,
        SUM(CASE WHEN a.status IN ('Present', 'Late', 'Half Day') THEN 1 ELSE 0 END) AS days_present,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS days_late,
        SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) AS days_half_day,
        ROUND(COALESCE(SUM(a.total_hours), 0), 2) AS total_hours_worked,
        ROUND(COALESCE(AVG(CASE WHEN a.total_hours > 0 THEN a.total_hours ELSE NULL END), 0), 2) AS avg_hours_per_day
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND YEAR(a.date) = ? 
        AND MONTH(a.date) = ?
      WHERE e.deleted_at IS NULL
    `;
    const params = [year, month];

    if (req.user.role === 'department_manager') {
      baseQuery += ' AND e.department_id = ?';
      params.push(req.user.department_id || -1);
    } else if (departmentId && departmentId !== 'all') {
      baseQuery += ' AND e.department_id = ?';
      params.push(departmentId);
    }

    baseQuery += ' GROUP BY e.id, e.name, e.email, d.name, e.designation ORDER BY e.name ASC';

    const [rows] = await pool.query(baseQuery, params);

    const headers = [
      'Employee ID',
      'Name',
      'Department',
      'Designation',
      'Days Present',
      'Late Days',
      'Half Days',
      'Total Hours Worked',
      'Avg Hours / Day'
    ];

    const dataRows = rows.map((r) => [
      r.employee_id,
      r.employee_name,
      r.department_name || 'Unassigned',
      r.designation,
      r.days_present || 0,
      r.days_late || 0,
      r.days_half_day || 0,
      r.total_hours_worked || 0,
      r.avg_hours_per_day || 0
    ]);

    const csvContent = generateCSV(headers, dataRows);
    const filename = `attendance_report_${year}_${String(month).padStart(2, '0')}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export report to CSV.', error: error.message });
  }
});

/**
 * GET /api/attendance/report/export/excel
 * Export monthly report to Microsoft Excel format.
 */
router.get('/report/export/excel', requirePermission('employee.export'), async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const departmentId = req.query.department_id;

    let baseQuery = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        d.name AS department_name,
        e.designation,
        COUNT(a.id) AS days_recorded,
        SUM(CASE WHEN a.status IN ('Present', 'Late', 'Half Day') THEN 1 ELSE 0 END) AS days_present,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS days_late,
        SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) AS days_half_day,
        ROUND(COALESCE(SUM(a.total_hours), 0), 2) AS total_hours_worked,
        ROUND(COALESCE(AVG(CASE WHEN a.total_hours > 0 THEN a.total_hours ELSE NULL END), 0), 2) AS avg_hours_per_day
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND YEAR(a.date) = ? 
        AND MONTH(a.date) = ?
      WHERE e.deleted_at IS NULL
    `;
    const params = [year, month];

    if (req.user.role === 'department_manager') {
      baseQuery += ' AND e.department_id = ?';
      params.push(req.user.department_id || -1);
    } else if (departmentId && departmentId !== 'all') {
      baseQuery += ' AND e.department_id = ?';
      params.push(departmentId);
    }

    baseQuery += ' GROUP BY e.id, e.name, e.email, d.name, e.designation ORDER BY e.name ASC';

    const [rows] = await pool.query(baseQuery, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Employee Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(`Attendance ${year}-${String(month).padStart(2, '0')}`);

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Employee Name', key: 'name', width: 24 },
      { header: 'Department', key: 'dept', width: 20 },
      { header: 'Designation', key: 'designation', width: 22 },
      { header: 'Days Present', key: 'present', width: 14 },
      { header: 'Late Days', key: 'late', width: 12 },
      { header: 'Half Days', key: 'half_day', width: 12 },
      { header: 'Total Hours', key: 'total_hours', width: 14 },
      { header: 'Avg Hours/Day', key: 'avg_hours', width: 16 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4338CA' }
      };
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach((r) => {
      const row = worksheet.addRow({
        id: r.employee_id,
        name: r.employee_name,
        dept: r.department_name || 'Unassigned',
        designation: r.designation,
        present: Number(r.days_present || 0),
        late: Number(r.days_late || 0),
        half_day: Number(r.days_half_day || 0),
        total_hours: Number(r.total_hours_worked || 0),
        avg_hours: Number(r.avg_hours_per_day || 0)
      });
      row.height = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `attendance_report_${year}_${String(month).padStart(2, '0')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export report to Excel.', error: error.message });
  }
});

// ==========================================
// 4. ATTENDANCE CORRECTIONS WORKFLOW
// ==========================================

/**
 * POST /api/attendance/corrections
 * Employee submits an attendance correction request.
 */
router.post('/corrections', async (req, res) => {
  try {
    const { date, requested_check_in, requested_check_out, reason } = req.body;

    if (!date || !requested_check_in || !requested_check_out || !reason || !reason.trim()) {
      return res.status(400).json({
        message: 'All fields are required: date, requested check-in, requested check-out, and reason.'
      });
    }

    const checkInDate = new Date(requested_check_in);
    const checkOutDate = new Date(requested_check_out);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({ message: 'Invalid check-in or check-out date/time format.' });
    }

    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      return res.status(400).json({
        message: 'Requested check-out time must be strictly after requested check-in time.'
      });
    }

    const employeeId = await resolveEmployeeId(req);
    if (!employeeId) {
      return res.status(400).json({ message: 'No linked employee profile found for your account.' });
    }

    // Find if an attendance record exists for that date
    const [existingAttendance] = await pool.query(
      'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
      [employeeId, date]
    );
    const attendanceId = existingAttendance.length > 0 ? existingAttendance[0].id : null;

    // Check if a PENDING correction already exists for this date
    const [pending] = await pool.query(
      'SELECT id FROM attendance_corrections WHERE employee_id = ? AND date = ? AND status = "PENDING"',
      [employeeId, date]
    );

    if (pending.length > 0) {
      return res.status(400).json({
        message: 'A pending correction request already exists for this date. Please wait for review.'
      });
    }

    const formattedCheckIn = toMySqlDateTime(requested_check_in);
    const formattedCheckOut = toMySqlDateTime(requested_check_out);
    const targetDate = formatLocalDate(date);

    const [result] = await pool.query(
      `INSERT INTO attendance_corrections 
        (attendance_id, employee_id, date, requested_check_in, requested_check_out, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [attendanceId, employeeId, targetDate, formattedCheckIn, formattedCheckOut, reason.trim()]
    );

    const correctionId = result.insertId;

    // Notify admins of new pending correction request
    const [empRows] = await pool.query('SELECT name FROM employees WHERE id = ?', [employeeId]);
    const empName = empRows[0]?.name || 'Employee';

    notifyAdmins({
      type: 'system',
      title: 'New Attendance Correction Request',
      message: `${empName} has requested an attendance correction for ${date}. Reason: "${reason.trim()}"`,
      link: '/attendance?tab=corrections'
    }).catch(() => {});

    res.status(201).json({
      message: 'Attendance correction request submitted successfully.',
      correctionId
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit correction request.', error: error.message });
  }
});

/**
 * GET /api/attendance/corrections
 * List correction requests. Employees view own; Admins view all.
 */
router.get('/corrections', async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = ' WHERE 1=1';
    const params = [];

    if (req.user.role === 'employee') {
      const empId = await resolveEmployeeId(req);
      if (!empId) {
        return res.json({ corrections: [], pagination: { total: 0, page: 1, limit: limitNum, totalPages: 1 } });
      }
      whereClause += ' AND c.employee_id = ?';
      params.push(empId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        whereClause += ' AND 1=0';
      } else {
        whereClause += ' AND e.department_id = ?';
        params.push(req.user.department_id);
      }
    }

    if (status && status !== 'all') {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    const countSql = `
      SELECT COUNT(*) AS total
      FROM attendance_corrections c
      JOIN employees e ON c.employee_id = e.id
      ${whereClause}
    `;
    const [countResult] = await pool.query(countSql, params);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    const dataSql = `
      SELECT 
        c.*,
        e.name AS employee_name,
        e.email AS employee_email,
        d.name AS department_name,
        reviewer.name AS reviewer_name
      FROM attendance_corrections c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [corrections] = await pool.query(dataSql, [...params, limitNum, offset]);

    res.json({
      corrections,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch correction requests.', error: error.message });
  }
});

/**
 * PATCH /api/attendance/corrections/:id/approve
 * Manager / Admin approves an attendance correction.
 */
router.patch('/corrections/:id/approve', requirePermission('attendance.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const [corrRows] = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.department_id 
       FROM attendance_corrections c 
       JOIN employees e ON c.employee_id = e.id 
       WHERE c.id = ?`,
      [id]
    );

    if (corrRows.length === 0) {
      return res.status(404).json({ message: 'Attendance correction request not found.' });
    }

    const correction = corrRows[0];

    // RBAC: Department manager can only approve corrections for employees in their own department
    if (req.user.role === 'department_manager' && correction.department_id !== req.user.department_id) {
      return res.status(403).json({
        message: 'Access denied: Department managers can only manage attendance for employees in their own department.',
        userRole: req.user.role
      });
    }

    if (correction.status !== 'PENDING') {
      return res.status(400).json({
        message: `Request has already been ${correction.status.toLowerCase()}.`
      });
    }

    // Recalculate metrics based on requested times
    const checkIn = new Date(correction.requested_check_in);
    const checkOut = new Date(correction.requested_check_out);
    const totalHours = calculateWorkHours(checkIn, checkOut);
    const { isLate, lateMinutes, status } = calculateLateDetails(checkIn);
    let finalStatus = status;
    if (totalHours < 4 && finalStatus !== 'Late') {
      finalStatus = 'Half Day';
    }

    const formattedReqCheckIn = toMySqlDateTime(correction.requested_check_in);
    const formattedReqCheckOut = toMySqlDateTime(correction.requested_check_out);
    const targetDate = formatLocalDate(correction.date);

    // Upsert attendance table
    if (correction.attendance_id) {
      await pool.query(
        `UPDATE attendance 
         SET check_in = ?, check_out = ?, total_hours = ?, is_late = ?, late_minutes = ?, status = ?, is_corrected = TRUE
         WHERE id = ?`,
        [formattedReqCheckIn, formattedReqCheckOut, totalHours, isLate, lateMinutes, finalStatus, correction.attendance_id]
      );
    } else {
      const [insertResult] = await pool.query(
        `INSERT INTO attendance 
          (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status, is_corrected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE
          check_in = VALUES(check_in),
          check_out = VALUES(check_out),
          total_hours = VALUES(total_hours),
          is_late = VALUES(is_late),
          late_minutes = VALUES(late_minutes),
          status = VALUES(status),
          is_corrected = TRUE`,
        [correction.employee_id, targetDate, formattedReqCheckIn, formattedReqCheckOut, totalHours, isLate, lateMinutes, finalStatus]
      );
      if (!correction.attendance_id && insertResult.insertId) {
        await pool.query('UPDATE attendance_corrections SET attendance_id = ? WHERE id = ?', [insertResult.insertId, id]);
      }
    }

    // Mark correction APPROVED
    await pool.query(
      `UPDATE attendance_corrections 
       SET status = 'APPROVED', reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );

    // Notify employee of approval
    notifyEmployeeUser({
      employeeId: correction.employee_id,
      type: 'system',
      title: 'Attendance Correction Approved',
      message: `Your attendance correction request for ${new Date(correction.date).toISOString().split('T')[0]} has been approved.`,
      link: '/attendance',
      sendEmail: true
    }).catch(() => {});

    // Log audit
    logAudit({
      req,
      action: 'UPDATE',
      entityType: 'ATTENDANCE_CORRECTION',
      entityId: id,
      employeeName: correction.employee_name,
      details: `Approved attendance correction for ${correction.date}: Check-in ${correction.requested_check_in}, Check-out ${correction.requested_check_out}`
    }).catch(() => {});

    res.json({ message: 'Attendance correction approved and records updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve correction request.', error: error.message });
  }
});

/**
 * PATCH /api/attendance/corrections/:id/reject
 * Manager / Admin rejects an attendance correction request with a reason.
 */
router.patch('/corrections/:id/reject', requirePermission('attendance.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const [corrRows] = await pool.query(
      `SELECT c.*, e.name AS employee_name, e.department_id 
       FROM attendance_corrections c 
       JOIN employees e ON c.employee_id = e.id 
       WHERE c.id = ?`,
      [id]
    );

    if (corrRows.length === 0) {
      return res.status(404).json({ message: 'Attendance correction request not found.' });
    }

    const correction = corrRows[0];

    // RBAC: Department manager can only reject corrections for employees in their own department
    if (req.user.role === 'department_manager' && correction.department_id !== req.user.department_id) {
      return res.status(403).json({
        message: 'Access denied: Department managers can only manage attendance for employees in their own department.',
        userRole: req.user.role
      });
    }

    if (correction.status !== 'PENDING') {
      return res.status(400).json({
        message: `Request has already been ${correction.status.toLowerCase()}.`
      });
    }

    const reason = rejection_reason && rejection_reason.trim() ? rejection_reason.trim() : 'Correction request rejected by administrator.';

    await pool.query(
      `UPDATE attendance_corrections 
       SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [reason, req.user.id, id]
    );

    // Notify employee of rejection
    notifyEmployeeUser({
      employeeId: correction.employee_id,
      type: 'system',
      title: 'Attendance Correction Rejected',
      message: `Your attendance correction request for ${new Date(correction.date).toISOString().split('T')[0]} was rejected. Reason: ${reason}`,
      link: '/attendance',
      sendEmail: true
    }).catch(() => {});

    // Log audit
    logAudit({
      req,
      action: 'UPDATE',
      entityType: 'ATTENDANCE_CORRECTION',
      entityId: id,
      employeeName: correction.employee_name,
      details: `Rejected attendance correction for ${correction.date}. Reason: ${reason}`
    }).catch(() => {});

    res.json({ message: 'Attendance correction request rejected successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reject correction request.', error: error.message });
  }
});

module.exports = router;
