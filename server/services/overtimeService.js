const pool = require('../db');
const { getEmployeeShift } = require('./shiftService');
const { getDayType } = require('./calendarService');
const { logAudit } = require('./auditLogger');
const { notifyEmployeeUser, notifyDepartmentManager } = require('./notificationService');

/**
 * Format a Date or date string to YYYY-MM-DD
 */
function formatLocalDate(date) {
  if (!date) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if the payroll month for a given date is closed/locked.
 */
async function isMonthClosed(date, connection = null) {
  const conn = connection || pool;
  const dateStr = formatLocalDate(date);
  const monthStr = dateStr.slice(0, 7);

  const [rows] = await conn.query(
    "SELECT id, status FROM payroll_runs WHERE month = ? AND status IN ('Approved', 'Locked')",
    [monthStr]
  );
  return rows.length > 0;
}

/**
 * Fetch effective overtime policy for a given department and date.
 * Precedence: Department policy -> Company default (department_id IS NULL) -> Fallback defaults.
 * Old rows are never edited; we always select the latest effective row on or before `date`.
 */
async function getOvertimePolicy(departmentId, date, connection = null) {
  const conn = connection || pool;
  const dateStr = formatLocalDate(date);

  // 1. Department-specific policy
  if (departmentId) {
    const [deptRows] = await conn.query(
      `SELECT * FROM overtime_policies 
       WHERE department_id = ? AND effective_date <= ?
       ORDER BY effective_date DESC, id DESC
       LIMIT 1`,
      [departmentId, dateStr]
    );
    if (deptRows.length > 0) {
      return deptRows[0];
    }
  }

  // 2. Company default policy
  const [companyRows] = await conn.query(
    `SELECT * FROM overtime_policies 
     WHERE department_id IS NULL AND effective_date <= ?
     ORDER BY effective_date DESC, id DESC
     LIMIT 1`,
    [dateStr]
  );
  if (companyRows.length > 0) {
    return companyRows[0];
  }

  // 3. Fallback defaults
  return {
    id: null,
    department_id: null,
    threshold_minutes: 15,
    rounding_minutes: 15,
    regular_multiplier: 1.50,
    weekend_multiplier: 2.00,
    holiday_multiplier: 2.50,
    daily_cap_hours: 4.00,
    monthly_cap_hours: 40.00,
    approval_required: false,
    effective_date: '2020-01-01'
  };
}

/**
 * Calculate overtime for an employee on a specific date.
 * Reuses `getEmployeeShift` and `getDayType`.
 */
async function calculateOvertime(employeeId, date, options = {}) {
  const conn = options.connection || pool;
  const dateStr = formatLocalDate(date);
  const shouldSave = options.save !== false;

  // 1. Fetch employee to resolve department
  const [empRows] = await conn.query(
    'SELECT id, name, department_id FROM employees WHERE id = ?',
    [employeeId]
  );
  if (empRows.length === 0) {
    throw new Error(`Employee with ID ${employeeId} not found.`);
  }
  const employee = empRows[0];

  // 2. Resolve Policy, Shift, and Day Type
  const policy = await getOvertimePolicy(employee.department_id, dateStr, conn);
  const shift = await getEmployeeShift(employeeId, dateStr);
  const dayTypeInfo = await getDayType(employeeId, dateStr);

  // Determine Day Type category for overtime multipliers
  let dayType = 'regular';
  let multiplier = Number(policy.regular_multiplier || 1.50);

  if (dayTypeInfo && dayTypeInfo.dayType === 'holiday') {
    dayType = 'holiday';
    multiplier = Number(policy.holiday_multiplier || 2.50);
  } else if (dayTypeInfo && dayTypeInfo.dayType === 'weekend') {
    dayType = 'weekend';
    multiplier = Number(policy.weekend_multiplier || 2.00);
  }

  // 3. Get Attendance Record
  let record = options.attendance;
  if (!record) {
    const [attRows] = await conn.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
      [employeeId, dateStr]
    );
    if (attRows.length > 0) {
      record = attRows[0];
    }
  }

  if (!record || !record.check_in || !record.check_out) {
    return {
      eligible: false,
      employee_id: employeeId,
      work_date: dateStr,
      minutes: 0,
      raw_minutes: 0,
      day_type: dayType,
      multiplier,
      status: policy.approval_required ? 'pending' : 'approved',
      over_cap: false,
      reason: 'No completed attendance record (missing check-in or check-out).'
    };
  }

  const checkIn = new Date(record.check_in);
  const checkOut = new Date(record.check_out);

  if (checkOut.getTime() <= checkIn.getTime()) {
    return {
      eligible: false,
      employee_id: employeeId,
      work_date: dateStr,
      minutes: 0,
      raw_minutes: 0,
      day_type: dayType,
      multiplier,
      status: policy.approval_required ? 'pending' : 'approved',
      over_cap: false,
      reason: 'Check-out is on or before check-in.'
    };
  }

  // 4. Calculate Raw Overtime Minutes
  let rawMinutes = 0;

  if (dayType === 'weekend' || dayType === 'holiday') {
    // "Weekend/holiday: all worked time is overtime."
    if (record.total_hours !== undefined && record.total_hours !== null && Number(record.total_hours) > 0) {
      rawMinutes = Math.round(Number(record.total_hours) * 60);
    } else {
      const diffMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
      const breakMinutes = shift?.break_minutes || 0;
      rawMinutes = Math.max(0, diffMinutes - breakMinutes);
    }
  } else {
    // "Regular day: minutes worked beyond shift end (flexible shift: beyond minimum hours). Night shifts crossing midnight must work."
    if (shift && shift.type === 'flexible') {
      const minWorkingMinutes = shift.min_working_minutes || 480;
      let totalWorkedMinutes = 0;
      if (record.total_hours !== undefined && record.total_hours !== null && Number(record.total_hours) > 0) {
        totalWorkedMinutes = Math.round(Number(record.total_hours) * 60);
      } else {
        const diffMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
        const breakMinutes = shift?.break_minutes || 0;
        totalWorkedMinutes = Math.max(0, diffMinutes - breakMinutes);
      }
      rawMinutes = Math.max(0, totalWorkedMinutes - minWorkingMinutes);
    } else {
      // Fixed Shift (morning, evening, night)
      const crossesMidnight = Boolean(shift?.crosses_midnight) ||
        (shift?.start_time && shift?.end_time && shift.end_time < shift.start_time);

      const [y, m, d] = dateStr.split('-').map(Number);
      const [endH, endM, endS] = (shift?.end_time || '17:00:00').split(':').map(Number);

      let shiftEndDateTime;
      if (crossesMidnight) {
        // Night shift ends on the day after the work date
        shiftEndDateTime = new Date(y, m - 1, d + 1, endH, endM || 0, endS || 0);
      } else {
        shiftEndDateTime = new Date(y, m - 1, d, endH, endM || 0, endS || 0);
      }

      if (checkOut.getTime() > shiftEndDateTime.getTime()) {
        const effectiveOtStart = Math.max(shiftEndDateTime.getTime(), checkIn.getTime());
        rawMinutes = Math.max(0, Math.floor((checkOut.getTime() - effectiveOtStart) / 60000));
      } else {
        rawMinutes = 0;
      }
    }
  }

  // 5. Apply Policy: Threshold
  const threshold = Number(policy.threshold_minutes ?? 15);
  if (rawMinutes < threshold) {
    return {
      eligible: false,
      employee_id: employeeId,
      work_date: dateStr,
      minutes: 0,
      raw_minutes: rawMinutes,
      day_type: dayType,
      multiplier,
      status: policy.approval_required ? 'pending' : 'approved',
      over_cap: false,
      reason: `Worked time (${rawMinutes} mins) is below the overtime threshold (${threshold} mins).`
    };
  }

  // 6. Apply Policy: Rounding
  const rounding = Number(policy.rounding_minutes ?? 15);
  let roundedMinutes = rawMinutes;
  if (rounding > 1) {
    roundedMinutes = Math.floor(rawMinutes / rounding) * rounding;
  }

  if (roundedMinutes <= 0) {
    return {
      eligible: false,
      employee_id: employeeId,
      work_date: dateStr,
      minutes: 0,
      raw_minutes: rawMinutes,
      day_type: dayType,
      multiplier,
      status: policy.approval_required ? 'pending' : 'approved',
      over_cap: false,
      reason: 'Overtime rounded down to 0 minutes.'
    };
  }

  // 7. Apply Policy: Daily Cap & Monthly Cap
  const dailyCapMinutes = Number(policy.daily_cap_hours || 4.00) * 60;
  const exceedsDailyCap = roundedMinutes > dailyCapMinutes;

  const monthlyCapMinutes = Number(policy.monthly_cap_hours || 40.00) * 60;
  const [yStr, mStr] = dateStr.split('-');
  const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
  const monthStart = `${yStr}-${mStr}-01`;
  const monthEnd = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;

  const [monthRows] = await conn.query(
    `SELECT COALESCE(SUM(minutes), 0) AS total_month_minutes 
     FROM overtime_requests 
     WHERE employee_id = ? 
       AND work_date BETWEEN ? AND ? 
       AND work_date != ? 
       AND status != 'rejected'`,
    [employeeId, monthStart, monthEnd, dateStr]
  );
  const priorMonthMinutes = Number(monthRows[0]?.total_month_minutes || 0);
  const exceedsMonthlyCap = (priorMonthMinutes + roundedMinutes) > monthlyCapMinutes;

  const overCap = exceedsDailyCap || exceedsMonthlyCap;

  // 8. Determine Approval Status: "auto-approved if approval_required = false"
  const approvalRequired = Boolean(policy.approval_required);
  const status = options.statusOverride || (!approvalRequired ? 'approved' : 'pending');

  const resultData = {
    eligible: true,
    employee_id: employeeId,
    work_date: dateStr,
    minutes: roundedMinutes,
    raw_minutes: rawMinutes,
    day_type: dayType,
    multiplier,
    status,
    over_cap: overCap,
    policy,
    shift
  };

  // 9. Persist into `overtime_requests` table
  if (shouldSave) {
    let comment = null;
    if (overCap) {
      const reasons = [];
      if (exceedsDailyCap) reasons.push(`Exceeded daily cap of ${policy.daily_cap_hours}h`);
      if (exceedsMonthlyCap) reasons.push(`Exceeded monthly cap of ${policy.monthly_cap_hours}h`);
      comment = reasons.join('; ');
    }

    await conn.query(
      `INSERT INTO overtime_requests (
        employee_id,
        work_date,
        minutes,
        day_type,
        multiplier,
        status,
        over_cap,
        comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        minutes = VALUES(minutes),
        day_type = VALUES(day_type),
        multiplier = VALUES(multiplier),
        status = VALUES(status),
        over_cap = VALUES(over_cap),
        comment = VALUES(comment),
        updated_at = NOW()`,
      [
        employeeId,
        dateStr,
        roundedMinutes,
        dayType,
        multiplier,
        status,
        overCap ? 1 : 0,
        comment
      ]
    );

    const [savedRows] = await conn.query(
      'SELECT * FROM overtime_requests WHERE employee_id = ? AND work_date = ?',
      [employeeId, dateStr]
    );
    resultData.request = savedRows[0] || null;
  }

  return resultData;
}

/**
 * Approve an overtime request.
 * Rules:
 * - Manager acts only on their own department.
 * - No self-approval.
 * - Approved/rejected requests are locked.
 * - Closed months cannot change.
 * - Optional fewer minutes + reason.
 * - Uses transactions, notification, and audit log.
 */
async function approveOvertimeRequest({ requestId, reviewerUser, approvedMinutes, reason, req = null }) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query(
      `SELECT r.*, e.name AS employee_name, e.department_id, e.id AS emp_id
       FROM overtime_requests r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.id = ? FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      const err = new Error('Overtime request not found.');
      err.status = 404;
      throw err;
    }
    const request = rows[0];

    // Closed month check
    const closed = await isMonthClosed(request.work_date, conn);
    if (closed) {
      const err = new Error('Cannot modify overtime for a closed/locked payroll month.');
      err.status = 403;
      throw err;
    }

    // Locked status check
    if (request.status === 'approved' || request.status === 'rejected') {
      const err = new Error(`Overtime request is already ${request.status} and cannot be modified.`);
      err.status = 400;
      throw err;
    }

    // Self-approval restriction
    if (reviewerUser.employee_id && Number(reviewerUser.employee_id) === Number(request.employee_id)) {
      const err = new Error('Self-approval is strictly forbidden. Managers cannot approve their own overtime.');
      err.status = 403;
      throw err;
    }

    // Department restriction for department managers
    if (reviewerUser.role === 'department_manager') {
      if (!reviewerUser.department_id || Number(reviewerUser.department_id) !== Number(request.department_id)) {
        const err = new Error('Access denied: Department managers can only approve overtime for employees in their own department.');
        err.status = 403;
        throw err;
      }
    }

    // Optional fewer minutes validation
    let finalMinutes = request.minutes;
    let commentUpdates = request.comment || '';

    if (approvedMinutes !== undefined && approvedMinutes !== null) {
      const parsedMinutes = parseInt(approvedMinutes, 10);
      if (isNaN(parsedMinutes) || parsedMinutes < 0) {
        const err = new Error('Approved minutes must be a non-negative integer.');
        err.status = 400;
        throw err;
      }
      if (parsedMinutes > request.minutes) {
        const err = new Error(`Approved minutes (${parsedMinutes}) cannot exceed requested minutes (${request.minutes}).`);
        err.status = 400;
        throw err;
      }
      finalMinutes = parsedMinutes;
      if (parsedMinutes < request.minutes) {
        const deductionNote = `Approved ${parsedMinutes} mins (reduced from ${request.minutes} mins)${reason ? ': ' + reason.trim() : ''}`;
        commentUpdates = commentUpdates ? `${commentUpdates}; ${deductionNote}` : deductionNote;
      }
    } else if (reason && reason.trim()) {
      commentUpdates = commentUpdates ? `${commentUpdates}; ${reason.trim()}` : reason.trim();
    }

    await conn.query(
      `UPDATE overtime_requests 
       SET minutes = ?,
           status = 'approved',
           reviewer_id = ?,
           comment = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [finalMinutes, reviewerUser.id, commentUpdates || null, requestId]
    );

    await conn.commit();
    conn.release();

    // Fetch updated record
    const [updatedRows] = await pool.query('SELECT * FROM overtime_requests WHERE id = ?', [requestId]);
    const updatedRequest = updatedRows[0];

    // Notification
    notifyEmployeeUser({
      employeeId: request.employee_id,
      type: 'system',
      title: 'Overtime Request Approved',
      message: `Your overtime of ${finalMinutes} minutes on ${formatLocalDate(request.work_date)} has been approved.`,
      link: '/attendance'
    }).catch(() => {});

    // Audit Log
    if (req) {
      logAudit({
        req,
        action: 'UPDATE',
        entityType: 'OVERTIME_REQUEST',
        entityId: requestId,
        employeeName: request.employee_name,
        details: `Approved ${finalMinutes} minutes overtime for ${formatLocalDate(request.work_date)}${reason ? ' Reason: ' + reason : ''}`
      }).catch(() => {});
    }

    return updatedRequest;
  } catch (error) {
    await conn.rollback();
    conn.release();
    throw error;
  }
}

/**
 * Reject an overtime request.
 * Rules:
 * - Comment is strictly required.
 * - Manager acts only on their own department.
 * - No self-approval / rejection by self.
 * - Approved/rejected requests are locked.
 * - Closed months cannot change.
 * - Uses transactions, notification, and audit log.
 */
async function rejectOvertimeRequest({ requestId, reviewerUser, comment, req = null }) {
  if (!comment || !comment.trim()) {
    const err = new Error('A rejection reason/comment is required.');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const [rows] = await conn.query(
      `SELECT r.*, e.name AS employee_name, e.department_id, e.id AS emp_id
       FROM overtime_requests r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.id = ? FOR UPDATE`,
      [requestId]
    );

    if (rows.length === 0) {
      const err = new Error('Overtime request not found.');
      err.status = 404;
      throw err;
    }
    const request = rows[0];

    // Closed month check
    const closed = await isMonthClosed(request.work_date, conn);
    if (closed) {
      const err = new Error('Cannot modify overtime for a closed/locked payroll month.');
      err.status = 403;
      throw err;
    }

    // Locked status check
    if (request.status === 'approved' || request.status === 'rejected') {
      const err = new Error(`Overtime request is already ${request.status} and cannot be modified.`);
      err.status = 400;
      throw err;
    }

    // Self-approval restriction
    if (reviewerUser.employee_id && Number(reviewerUser.employee_id) === Number(request.employee_id)) {
      const err = new Error('Self-rejection/approval is forbidden. Managers cannot review their own overtime.');
      err.status = 403;
      throw err;
    }

    // Department restriction for department managers
    if (reviewerUser.role === 'department_manager') {
      if (!reviewerUser.department_id || Number(reviewerUser.department_id) !== Number(request.department_id)) {
        const err = new Error('Access denied: Department managers can only reject overtime for employees in their own department.');
        err.status = 403;
        throw err;
      }
    }

    await conn.query(
      `UPDATE overtime_requests 
       SET status = 'rejected',
           reviewer_id = ?,
           comment = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [reviewerUser.id, comment.trim(), requestId]
    );

    await conn.commit();
    conn.release();

    const [updatedRows] = await pool.query('SELECT * FROM overtime_requests WHERE id = ?', [requestId]);
    const updatedRequest = updatedRows[0];

    // Notification
    notifyEmployeeUser({
      employeeId: request.employee_id,
      type: 'system',
      title: 'Overtime Request Rejected',
      message: `Your overtime request for ${formatLocalDate(request.work_date)} was rejected: "${comment.trim()}"`,
      link: '/attendance'
    }).catch(() => {});

    // Audit Log
    if (req) {
      logAudit({
        req,
        action: 'UPDATE',
        entityType: 'OVERTIME_REQUEST',
        entityId: requestId,
        employeeName: request.employee_name,
        details: `Rejected overtime request for ${formatLocalDate(request.work_date)}. Reason: ${comment.trim()}`
      }).catch(() => {});
    }

    return updatedRequest;
  } catch (error) {
    await conn.rollback();
    conn.release();
    throw error;
  }
}

/**
 * If an attendance correction changes check-out, recalculate overtime.
 * Rules:
 * - Approved overtime goes back to pending.
 * - Closed months cannot change.
 */
async function recalculateOvertimeOnCorrection(employeeId, date, connection = null) {
  const conn = connection || pool;
  const dateStr = formatLocalDate(date);

  // Closed month check
  const closed = await isMonthClosed(dateStr, conn);
  if (closed) {
    throw new Error('Attendance correction cannot change overtime for a closed/locked payroll month.');
  }

  // Check if an overtime request exists
  const [existingRows] = await conn.query(
    'SELECT * FROM overtime_requests WHERE employee_id = ? AND work_date = ?',
    [employeeId, dateStr]
  );

  // Recalculate without auto-saving yet
  const result = await calculateOvertime(employeeId, dateStr, {
    connection: conn,
    save: false
  });

  if (result.minutes > 0) {
    // Save or update with status = 'pending' ("Approved overtime goes back to pending")
    await conn.query(
      `INSERT INTO overtime_requests (
        employee_id,
        work_date,
        minutes,
        day_type,
        multiplier,
        status,
        over_cap,
        comment
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      ON DUPLICATE KEY UPDATE
        minutes = VALUES(minutes),
        day_type = VALUES(day_type),
        multiplier = VALUES(multiplier),
        status = 'pending',
        over_cap = VALUES(over_cap),
        comment = VALUES(comment),
        updated_at = NOW()`,
      [
        employeeId,
        dateStr,
        result.minutes,
        result.day_type,
        result.multiplier,
        result.over_cap ? 1 : 0,
        result.over_cap ? 'Overtime recalculated after attendance correction (exceeds cap)' : 'Recalculated after attendance correction'
      ]
    );
  } else if (existingRows.length > 0) {
    // Previously existed but after correction, overtime is 0: mark rejected or set minutes = 0
    await conn.query(
      `UPDATE overtime_requests 
       SET minutes = 0,
           status = 'rejected',
           comment = 'Recalculated after attendance correction: 0 overtime minutes',
           updated_at = NOW()
       WHERE employee_id = ? AND work_date = ?`,
      [employeeId, dateStr]
    );
  }

  const [finalRows] = await conn.query(
    'SELECT * FROM overtime_requests WHERE employee_id = ? AND work_date = ?',
    [employeeId, dateStr]
  );
  return finalRows[0] || null;
}

/**
 * Compile monthly overtime report with breakdown:
 * - total approved minutes & hours
 * - by type: regular, weekend, holiday
 * - pending count & hours
 * - rejected count & hours
 * - weighted hours: sum of (minutes/60) * multiplier for approved requests
 */
async function getOvertimeMonthlyReport({ month, departmentId = null, connection = null }) {
  const conn = connection || pool;
  const [yStr, mStr] = month.split('-');
  const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  let sql = `
    SELECT 
      r.id,
      r.employee_id,
      r.work_date,
      r.minutes,
      r.day_type,
      r.multiplier,
      r.status,
      r.over_cap,
      r.comment,
      e.name AS employee_name,
      e.department_id,
      d.name AS department_name
    FROM overtime_requests r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE r.work_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    sql += ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  sql += ' ORDER BY r.work_date ASC, e.name ASC';

  const [rows] = await conn.query(sql, params);

  let approvedMinutes = 0;
  let approvedRegularMinutes = 0;
  let approvedWeekendMinutes = 0;
  let approvedHolidayMinutes = 0;
  let approvedRegularWeightedHours = 0;
  let approvedWeekendWeightedHours = 0;
  let approvedHolidayWeightedHours = 0;

  let pendingCount = 0;
  let pendingMinutes = 0;
  let rejectedCount = 0;
  let rejectedMinutes = 0;

  for (const r of rows) {
    const mins = Number(r.minutes) || 0;
    const mult = Number(r.multiplier) || 1.0;
    const hours = mins / 60.0;
    const weightedHrs = hours * mult;

    if (r.status === 'approved') {
      approvedMinutes += mins;
      if (r.day_type === 'regular') {
        approvedRegularMinutes += mins;
        approvedRegularWeightedHours += weightedHrs;
      } else if (r.day_type === 'weekend') {
        approvedWeekendMinutes += mins;
        approvedWeekendWeightedHours += weightedHrs;
      } else if (r.day_type === 'holiday') {
        approvedHolidayMinutes += mins;
        approvedHolidayWeightedHours += weightedHrs;
      }
    } else if (r.status === 'pending') {
      pendingCount++;
      pendingMinutes += mins;
    } else if (r.status === 'rejected') {
      rejectedCount++;
      rejectedMinutes += mins;
    }
  }

  const totalWeightedHours = Math.round((approvedRegularWeightedHours + approvedWeekendWeightedHours + approvedHolidayWeightedHours) * 100) / 100;

  return {
    month,
    summary: {
      totalApprovedMinutes: approvedMinutes,
      totalApprovedHours: Math.round((approvedMinutes / 60.0) * 100) / 100,
      totalWeightedHours,
      byType: {
        regular: {
          minutes: approvedRegularMinutes,
          hours: Math.round((approvedRegularMinutes / 60.0) * 100) / 100,
          weightedHours: Math.round(approvedRegularWeightedHours * 100) / 100
        },
        weekend: {
          minutes: approvedWeekendMinutes,
          hours: Math.round((approvedWeekendMinutes / 60.0) * 100) / 100,
          weightedHours: Math.round(approvedWeekendWeightedHours * 100) / 100
        },
        holiday: {
          minutes: approvedHolidayMinutes,
          hours: Math.round((approvedHolidayMinutes / 60.0) * 100) / 100,
          weightedHours: Math.round(approvedHolidayWeightedHours * 100) / 100
        }
      },
      pending: {
        count: pendingCount,
        minutes: pendingMinutes,
        hours: Math.round((pendingMinutes / 60.0) * 100) / 100
      },
      rejected: {
        count: rejectedCount,
        minutes: rejectedMinutes,
        hours: Math.round((rejectedMinutes / 60.0) * 100) / 100
      }
    },
    requests: rows
  };
}

module.exports = {
  getOvertimePolicy,
  calculateOvertime,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  recalculateOvertimeOnCorrection,
  getOvertimeMonthlyReport,
  isMonthClosed,
  formatLocalDate
};
