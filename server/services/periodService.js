const pool = require('../db');
const { formatDate, getDayType } = require('./calendarService');
const { logAudit } = require('./auditLogger');
const { notifyAdmins } = require('./notificationService');

/**
 * Normalizes input date to YYYY-MM
 */
function normalizeMonth(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') return dateInput.slice(0, 7);
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return String(dateInput).slice(0, 7);
}

/**
 * Requirement 2: ONE SHARED GUARD
 * Throws "Month is closed" if the date's month is closed in attendance_periods.
 *
 * @param {string|Date} dateInput
 * @param {object} connection Optional active MySQL transaction connection
 */
async function assertPeriodOpen(dateInput, connection = null) {
  const month = normalizeMonth(dateInput);
  if (!month) return;

  const executor = connection || pool;
  const [rows] = await executor.query(
    'SELECT status FROM attendance_periods WHERE month = ? LIMIT 1',
    [month]
  );

  if (rows.length > 0 && rows[0].status === 'closed') {
    const err = new Error('Month is closed');
    err.statusCode = 403;
    err.code = 'MONTH_CLOSED';
    throw err;
  }
}

/**
 * Checks if a month is currently closed.
 */
async function isPeriodClosed(dateInput, connection = null) {
  const month = normalizeMonth(dateInput);
  if (!month) return false;

  const executor = connection || pool;
  const [rows] = await executor.query(
    'SELECT status FROM attendance_periods WHERE month = ? LIMIT 1',
    [month]
  );

  return rows.length > 0 && rows[0].status === 'closed';
}

/**
 * Requirement 3: Review Before Closing Checklist
 */
async function getClosingChecklist(monthStr) {
  const month = normalizeMonth(monthStr);
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Valid month in YYYY-MM format is required.');
  }

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  const now = new Date();
  const todayStr = formatDate(now);
  const isMonthEnded = todayStr > endDate;

  // 1. Pending Attendance Corrections
  const [pendingCorrections] = await pool.query(
    `SELECT c.id, c.employee_id, e.name AS employee_name, c.date, c.reason
     FROM attendance_corrections c
     JOIN employees e ON c.employee_id = e.id
     WHERE c.status = 'PENDING' AND c.date BETWEEN ? AND ?`,
    [startDate, endDate]
  );

  // 2. Pending Overtime Approvals
  const [pendingOvertime] = await pool.query(
    `SELECT o.id, o.employee_id, e.name AS employee_name, o.work_date, o.minutes, o.day_type
     FROM overtime_requests o
     JOIN employees e ON o.employee_id = e.id
     WHERE o.status = 'pending' AND o.work_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );

  // 3. Pending Leave Requests overlapping the month
  const [pendingLeaves] = await pool.query(
    `SELECT l.id, l.employee_id, e.name AS employee_name, l.leave_type, l.start_date, l.end_date, l.days_count
     FROM leave_requests l
     JOIN employees e ON l.employee_id = e.id
     WHERE l.status = 'PENDING' AND NOT (l.end_date < ? OR l.start_date > ?)`,
    [startDate, endDate]
  );

  // 4. Missing Check-outs (check-in with no check-out)
  const [missingCheckouts] = await pool.query(
    `SELECT a.id, a.employee_id, e.name AS employee_name, a.date, a.check_in
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.date BETWEEN ? AND ?
       AND a.check_in IS NOT NULL
       AND a.check_out IS NULL
       AND (a.is_missing_checkout = 1 OR a.date < ?)`,
    [startDate, endDate, todayStr]
  );

  // 5. Unrun mark_absent days in the past
  const [jobRuns] = await pool.query(
    `SELECT run_key FROM job_runs
     WHERE job_name = 'mark_absent' AND status = 'success' AND run_key LIKE ?`,
    [`mark_absent:${month}-%`]
  );
  const ranDates = new Set(jobRuns.map((r) => r.run_key.replace('mark_absent:', '')));

  const unrunAbsentDays = [];
  const limitDate = isMonthEnded ? endDate : todayStr;
  let cur = new Date(y, m - 1, 1);
  const endD = new Date(y, m - 1, isMonthEnded ? lastDay : now.getDate());

  while (cur < endD) {
    const curStr = formatDate(cur);
    if (!ranDates.has(curStr)) {
      unrunAbsentDays.push({ date: curStr, reason: 'mark_absent job has not run' });
    }
    cur.setDate(cur.getDate() + 1);
  }

  // 6. Active Employees with no shift
  const [employeesNoShift] = await pool.query(
    `SELECT e.id, e.name, e.department_id, d.name AS department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN employee_shift_assignments esa ON e.id = esa.employee_id
       AND esa.effective_from <= ?
     WHERE e.deleted_at IS NULL AND (e.status = 'Active' OR e.status IS NULL)
       AND esa.id IS NULL`,
    [endDate]
  );

  const totalPending =
    pendingCorrections.length +
    pendingOvertime.length +
    pendingLeaves.length +
    missingCheckouts.length +
    unrunAbsentDays.length +
    employeesNoShift.length;

  const isReady = isMonthEnded && totalPending === 0;

  // Fetch current period status
  const [periodRows] = await pool.query(
    'SELECT * FROM attendance_periods WHERE month = ?',
    [month]
  );

  return {
    month,
    status: periodRows[0]?.status || 'open',
    closed_at: periodRows[0]?.closed_at || null,
    summary_generated_at: periodRows[0]?.summary_generated_at || null,
    isMonthEnded,
    isReady,
    totalPending,
    checklist: {
      pending_corrections: {
        count: pendingCorrections.length,
        items: pendingCorrections,
        link: '/attendance?tab=corrections',
      },
      pending_overtime: {
        count: pendingOvertime.length,
        items: pendingOvertime,
        link: '/overtime?tab=approvals',
      },
      pending_leaves: {
        count: pendingLeaves.length,
        items: pendingLeaves,
        link: '/leaves',
      },
      missing_checkouts: {
        count: missingCheckouts.length,
        items: missingCheckouts,
        link: '/attendance',
      },
      unrun_mark_absent_days: {
        count: unrunAbsentDays.length,
        items: unrunAbsentDays,
        link: '/admin/jobs',
      },
      employees_no_shift: {
        count: employeesNoShift.length,
        items: employeesNoShift,
        link: '/shifts',
      },
    },
  };
}

/**
 * Requirement 4: Close Month
 * In ONE transaction:
 * - Set status closed
 * - Generate payroll_attendance_summary rows using getDayType and approved overtime
 * - Write period_history and audit log
 * - Notify HR and Admin
 */
async function closePeriod({ monthStr, userId, userRole, override = false, reason = null, req = null }) {
  const month = normalizeMonth(monthStr);
  if (!month) throw new Error('Valid month is required.');

  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  const now = new Date();
  const todayStr = formatDate(now);

  // 1. Block if month has not ended
  if (todayStr <= endDate) {
    const err = new Error('Cannot close a month before it has ended.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Check pending checklist items
  const checklist = await getClosingChecklist(month);
  if (checklist.totalPending > 0 && !override) {
    const err = new Error('Cannot close month: There are pending checklist items. Resolve all items or provide Admin override.');
    err.statusCode = 400;
    err.checklist = checklist;
    throw err;
  }

  // 3. Admin override validation
  if (override) {
    if (userRole !== 'admin') {
      const err = new Error('Only Admin can override pending items to close a month.');
      err.statusCode = 403;
      throw err;
    }
    if (!reason || reason.trim().length === 0) {
      const err = new Error('A mandatory reason is required to override pending items.');
      err.statusCode = 400;
      throw err;
    }
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 4. Update or Insert attendance_periods
    await conn.query(
      `INSERT INTO attendance_periods (month, status, closed_by, closed_at, summary_generated_at)
       VALUES (?, 'closed', ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         status = 'closed',
         closed_by = VALUES(closed_by),
         closed_at = VALUES(closed_at),
         summary_generated_at = VALUES(summary_generated_at)`,
      [month, userId]
    );

    // 5. Delete prior summary rows for idempotency
    await conn.query('DELETE FROM payroll_attendance_summary WHERE month = ?', [month]);

    // 6. Generate payroll_attendance_summary rows for all active employees
    const [employees] = await conn.query(
      "SELECT id FROM employees WHERE deleted_at IS NULL AND (status = 'Active' OR status IS NULL)"
    );

    // Pre-fetch approved overtime for the month grouped by employee and day_type
    const [otRows] = await conn.query(
      `SELECT employee_id, day_type, SUM(minutes) AS total_minutes
       FROM overtime_requests
       WHERE status = 'approved' AND work_date BETWEEN ? AND ?
       GROUP BY employee_id, day_type`,
      [startDate, endDate]
    );

    const otMap = new Map();
    for (const ot of otRows) {
      if (!otMap.has(ot.employee_id)) {
        otMap.set(ot.employee_id, { regular: 0, weekend: 0, holiday: 0, total: 0 });
      }
      const entry = otMap.get(ot.employee_id);
      const mins = Number(ot.total_minutes || 0);
      if (ot.day_type === 'regular') entry.regular += mins;
      else if (ot.day_type === 'weekend') entry.weekend += mins;
      else if (ot.day_type === 'holiday') entry.holiday += mins;
      entry.total += mins;
    }

    // Pre-fetch attendance for all employees in this month
    const [attRows] = await conn.query(
      `SELECT employee_id, date, status, is_late, late_minutes
       FROM attendance
       WHERE date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    const attByEmp = new Map();
    for (const a of attRows) {
      const dStr = formatDate(a.date);
      if (!attByEmp.has(a.employee_id)) {
        attByEmp.set(a.employee_id, new Map());
      }
      attByEmp.get(a.employee_id).set(dStr, a);
    }

    // Days in the month
    const dates = [];
    let cur = new Date(y, m - 1, 1);
    const endD = new Date(y, m - 1, lastDay);
    while (cur <= endD) {
      dates.push(formatDate(cur));
      cur.setDate(cur.getDate() + 1);
    }

    for (const emp of employees) {
      let workingDays = 0;
      let presentDays = 0;
      let absentDays = 0;
      let leaveDaysPaid = 0;
      let leaveDaysUnpaid = 0;
      let holidayDays = 0;
      let lateCount = 0;
      let lateMinutes = 0;

      const empAttMap = attByEmp.get(emp.id) || new Map();

      for (const dStr of dates) {
        const dayInfo = await getDayType(emp.id, dStr, conn);
        const att = empAttMap.get(dStr);

        if (dayInfo.dayType === 'holiday') {
          holidayDays += 1;
        } else if (dayInfo.dayType === 'on_leave') {
          if (dayInfo.leave?.leave_type === 'Unpaid') {
            leaveDaysUnpaid += 1;
          } else {
            leaveDaysPaid += 1;
          }
        } else if (dayInfo.dayType === 'half_day_leave') {
          if (dayInfo.leave?.leave_type === 'Unpaid') {
            leaveDaysUnpaid += 0.5;
          } else {
            leaveDaysPaid += 0.5;
          }
          workingDays += 0.5;
          if (att && att.status !== 'Absent') {
            presentDays += 0.5;
          } else {
            absentDays += 0.5;
          }
        } else if (dayInfo.dayType === 'working') {
          workingDays += 1;
          if (att && att.status !== 'Absent') {
            presentDays += 1;
            if (att.is_late) {
              lateCount += 1;
              lateMinutes += Number(att.late_minutes || 0);
            }
          } else {
            absentDays += 1;
          }
        } else if (dayInfo.dayType === 'weekend') {
          if (att && att.status !== 'Absent') {
            presentDays += 1;
            if (att.is_late) {
              lateCount += 1;
              lateMinutes += Number(att.late_minutes || 0);
            }
          }
        }
      }

      const empOt = otMap.get(emp.id) || { regular: 0, weekend: 0, holiday: 0, total: 0 };

      await conn.query(
        `INSERT INTO payroll_attendance_summary (
          month, employee_id, working_days, present_days, absent_days,
          leave_days_paid, leave_days_unpaid, holiday_days,
          late_count, late_minutes,
          approved_overtime_regular_minutes, approved_overtime_weekend_minutes,
          approved_overtime_holiday_minutes, approved_overtime_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          month,
          emp.id,
          workingDays,
          presentDays,
          absentDays,
          leaveDaysPaid,
          leaveDaysUnpaid,
          holidayDays,
          lateCount,
          lateMinutes,
          empOt.regular,
          empOt.weekend,
          empOt.holiday,
          empOt.total,
        ]
      );
    }

    // 7. Insert period_history
    const action = override ? 'override_close' : 'closed';
    await conn.query(
      `INSERT INTO period_history (month, action, user_id, reason)
       VALUES (?, ?, ?, ?)`,
      [month, action, userId, reason]
    );

    await conn.commit();

    // 8. Log audit
    if (req) {
      logAudit({
        req,
        action: 'UPDATE',
        entityType: 'ATTENDANCE_PERIOD',
        entityId: month,
        details: `Closed attendance period ${month} (${action})${reason ? ': ' + reason : ''}`,
      }).catch(() => {});
    }

    // 9. Notify HR and Admin
    notifyAdmins({
      type: 'system',
      title: `Attendance Period Closed: ${month}`,
      message: `The attendance period for ${month} was closed by user #${userId}${override ? ' with admin override' : ''}. Payroll attendance summaries are generated.`,
      link: '/monthly-closing',
    }).catch(() => {});

    return {
      success: true,
      month,
      status: 'closed',
      action,
      summary_count: employees.length,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Requirement 5: Reopen Month (Admin only)
 * - Blocked if payroll for that month is approved or locked
 * - Reopen requires mandatory reason (min 10 characters)
 * - In ONE transaction: status open, delete summary rows, write period_history and audit log
 */
async function reopenPeriod({ monthStr, userId, userRole, reason, req = null }) {
  const month = normalizeMonth(monthStr);
  if (!month) throw new Error('Valid month is required.');

  // 1. Admin only
  if (userRole !== 'admin') {
    const err = new Error('Only Admin can reopen a closed month.');
    err.statusCode = 403;
    throw err;
  }

  // 2. Reason validation (min 10 characters)
  if (!reason || reason.trim().length < 10) {
    const err = new Error('Reopen reason is mandatory (minimum 10 characters).');
    err.statusCode = 400;
    throw err;
  }

  // 3. Block if payroll for that month is approved or locked
  const [payrollRuns] = await pool.query(
    'SELECT id, status FROM payroll_runs WHERE month = ? AND status IN ("Approved", "Locked")',
    [month]
  );
  if (payrollRuns.length > 0) {
    const err = new Error('Cannot reopen month: Payroll for this month is approved or locked. Please use next-month adjustments instead.');
    err.statusCode = 400;
    throw err;
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 4. Update attendance_periods to open
    await conn.query(
      `UPDATE attendance_periods
       SET status = 'open', closed_by = NULL, closed_at = NULL, summary_generated_at = NULL
       WHERE month = ?`,
      [month]
    );

    // 5. Delete summary rows
    await conn.query('DELETE FROM payroll_attendance_summary WHERE month = ?', [month]);

    // 6. Write period_history
    await conn.query(
      `INSERT INTO period_history (month, action, user_id, reason)
       VALUES (?, 'reopened', ?, ?)`,
      [month, 'reopened', userId, reason.trim()]
    );

    await conn.commit();

    // 7. Audit log
    if (req) {
      logAudit({
        req,
        action: 'UPDATE',
        entityType: 'ATTENDANCE_PERIOD',
        entityId: month,
        details: `Reopened attendance period ${month}. Reason: ${reason.trim()}`,
      }).catch(() => {});
    }

    // 8. Notify HR and Admin
    notifyAdmins({
      type: 'system',
      title: `Attendance Period Reopened: ${month}`,
      message: `The attendance period for ${month} was reopened by Admin #${userId}. Reason: "${reason.trim()}". Summaries have been cleared until reclosed.`,
      link: '/monthly-closing',
    }).catch(() => {});

    return {
      success: true,
      month,
      status: 'open',
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Fetches Period Details, History Timeline, and Summary Rows
 */
async function getPeriodDetails(monthStr) {
  const month = normalizeMonth(monthStr);
  if (!month) throw new Error('Valid month is required.');

  // Period row
  const [periodRows] = await pool.query(
    `SELECT ap.*, u.name AS closed_by_name
     FROM attendance_periods ap
     LEFT JOIN users u ON ap.closed_by = u.id
     WHERE ap.month = ?`,
    [month]
  );

  const period = periodRows[0] || { month, status: 'open' };

  // History timeline
  const [history] = await pool.query(
    `SELECT ph.*, u.name AS user_name, u.role AS user_role
     FROM period_history ph
     LEFT JOIN users u ON ph.user_id = u.id
     WHERE ph.month = ?
     ORDER BY ph.created_at DESC`,
    [month]
  );

  // Summary rows
  const [summaries] = await pool.query(
    `SELECT pas.*, e.name AS employee_name, e.designation, d.name AS department_name
     FROM payroll_attendance_summary pas
     JOIN employees e ON pas.employee_id = e.id
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE pas.month = ?
     ORDER BY e.name ASC`,
    [month]
  );

  return {
    period,
    history,
    summaries,
  };
}

module.exports = {
  assertPeriodOpen,
  isPeriodClosed,
  getClosingChecklist,
  closePeriod,
  reopenPeriod,
  getPeriodDetails,
  normalizeMonth,
};
