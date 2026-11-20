const pool = require('../db');
const { logAudit } = require('./auditLogger');

/**
 * Formats date input into 'YYYY-MM-DD' calendar string without UTC offset skew.
 */
function formatDate(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') return dateInput.split('T')[0];
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(dateInput);
}

/**
 * Returns Date object at local midnight from 'YYYY-MM-DD'.
 */
function parseLocalDate(dateStr) {
  const [y, m, d] = formatDate(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Check if an attendance / payroll month ('YYYY-MM') is locked/closed.
 * Closed months cannot have holidays edited or deleted.
 */
async function isMonthLocked(monthStr, connection = null) {
  const executor = connection || pool;
  const month = String(monthStr).slice(0, 7);
  const [periodRows] = await executor.query(
    'SELECT status FROM attendance_periods WHERE month = ? LIMIT 1',
    [month]
  );
  if (periodRows.length > 0 && periodRows[0].status === 'closed') {
    return true;
  }
  const [rows] = await executor.query(
    'SELECT id, status FROM payroll_runs WHERE month = ? AND status IN ("Approved", "Locked")',
    [month]
  );
  return rows.length > 0;
}

/**
 * Fetches the applicable Working Week Configuration for an employee on a given date.
 * Resolves by priority:
 * 1. Shift-specific configuration with effective_from <= date
 * 2. Department-specific configuration with effective_from <= date
 * 3. Company-wide configuration with effective_from <= date
 * 4. Default fallback: Monday-Friday working, Saturday-Sunday off
 */
async function getWorkingWeekConfig(employeeId, dateInput, connection = null) {
  const executor = connection || pool;
  const dateStr = formatDate(dateInput);

  let departmentId = null;
  let shiftId = null;

  if (employeeId) {
    const [empRows] = await executor.query(
      'SELECT department_id FROM employees WHERE id = ?',
      [employeeId]
    );
    if (empRows.length > 0) {
      departmentId = empRows[0].department_id;
    }

    // Try resolving assigned shift if shiftService is available
    try {
      const { getEmployeeShift } = require('./shiftService');
      const shift = await getEmployeeShift(employeeId, dateStr, executor);
      if (shift && shift.id) {
        shiftId = shift.id;
      }
    } catch (e) {
      // Shift service optional or circular load
    }
  }

  // 1. Check Shift-specific config
  if (shiftId) {
    const [shiftConfigs] = await executor.query(
      `SELECT * FROM working_week_configs
       WHERE scope = 'shift' AND shift_id = ? AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`,
      [shiftId, dateStr]
    );
    if (shiftConfigs.length > 0) {
      return shiftConfigs[0];
    }
  }

  // 2. Check Department-specific config
  if (departmentId) {
    const [deptConfigs] = await executor.query(
      `SELECT * FROM working_week_configs
       WHERE scope = 'department' AND department_id = ? AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`,
      [departmentId, dateStr]
    );
    if (deptConfigs.length > 0) {
      return deptConfigs[0];
    }
  }

  // 3. Check Company-wide config
  const [compConfigs] = await executor.query(
    `SELECT * FROM working_week_configs
     WHERE scope = 'company' AND effective_from <= ?
     ORDER BY effective_from DESC LIMIT 1`,
    [dateStr]
  );
  if (compConfigs.length > 0) {
    return compConfigs[0];
  }

  // 4. Default fallback (Monday to Friday working, Saturday/Sunday off)
  return {
    id: null,
    scope: 'company',
    monday: 1,
    tuesday: 1,
    wednesday: 1,
    thursday: 1,
    friday: 1,
    saturday: 0,
    sunday: 0,
    effective_from: '2020-01-01'
  };
}

/**
 * Checks whether a given day of the week (0 = Sun, 1 = Mon, ..., 6 = Sat)
 * is a working day according to the config.
 */
function isDayWorkingInConfig(config, dayOfWeek) {
  switch (dayOfWeek) {
    case 0: return Boolean(config.sunday);
    case 1: return Boolean(config.monday);
    case 2: return Boolean(config.tuesday);
    case 3: return Boolean(config.wednesday);
    case 4: return Boolean(config.thursday);
    case 5: return Boolean(config.friday);
    case 6: return Boolean(config.saturday);
    default: return false;
  }
}

/**
 * Checks if a date falls on a Public Holiday applicable to this employee.
 * Multi-day holidays check date BETWEEN h.date AND COALESCE(h.end_date, h.date).
 * Department scope checks h.scope = 'all' OR h.department_id = emp.department_id.
 */
async function getHolidayForDate(employeeId, dateInput, connection = null) {
  const executor = connection || pool;
  const dateStr = formatDate(dateInput);

  let departmentId = null;
  if (employeeId) {
    const [empRows] = await executor.query(
      'SELECT department_id FROM employees WHERE id = ?',
      [employeeId]
    );
    if (empRows.length > 0) {
      departmentId = empRows[0].department_id;
    }
  }

  const [holidays] = await executor.query(
    `SELECT h.*, d.name AS department_name
     FROM holidays h
     LEFT JOIN departments d ON h.department_id = d.id
     WHERE (? BETWEEN h.date AND COALESCE(h.end_date, h.date))
       AND (
         h.scope = 'all'
         OR (h.scope = 'department' AND ? IS NOT NULL AND h.department_id = ?)
       )
     ORDER BY h.scope ASC, h.id ASC
     LIMIT 1`,
    [dateStr, departmentId, departmentId]
  );

  return holidays.length > 0 ? holidays[0] : null;
}

/**
 * Checks if an employee has an APPROVED leave covering dateInput.
 * Note: PENDING or REJECTED leave requests do NOT cover the date.
 */
async function getApprovedLeaveForDate(employeeId, dateInput, connection = null) {
  if (!employeeId) return null;
  const executor = connection || pool;
  const dateStr = formatDate(dateInput);

  const [leaves] = await executor.query(
    `SELECT lr.*
     FROM leave_requests lr
     WHERE lr.employee_id = ?
       AND lr.status = 'APPROVED'
       AND (? BETWEEN lr.start_date AND lr.end_date)
     ORDER BY lr.id DESC
     LIMIT 1`,
    [employeeId, dateStr]
  );

  return leaves.length > 0 ? leaves[0] : null;
}

/**
 * Requirement 3: ONE SHARED CALENDAR FUNCTION
 * Returns one of: 'holiday', 'weekend', 'on_leave', 'half_day_leave', 'working'.
 * Priority order:
 * 1. holiday
 * 2. weekend
 * 3. approved leave (on_leave or half_day_leave)
 * 4. working
 */
async function getDayType(employeeId, dateInput, connection = null) {
  const executor = connection || pool;
  const dateStr = formatDate(dateInput);
  const dateObj = parseLocalDate(dateStr);
  const dayOfWeek = dateObj.getDay();

  // 1. Holiday Check
  const holiday = await getHolidayForDate(employeeId, dateStr, executor);
  if (holiday) {
    return {
      date: dateStr,
      dayType: 'holiday',
      isWorkingDay: false,
      holiday,
      leave: null,
      isHalfDay: false,
      halfDayType: null,
      name: holiday.name
    };
  }

  // 2. Weekend Check
  const wwConfig = await getWorkingWeekConfig(employeeId, dateStr, executor);
  const isWorking = isDayWorkingInConfig(wwConfig, dayOfWeek);
  if (!isWorking) {
    return {
      date: dateStr,
      dayType: 'weekend',
      isWorkingDay: false,
      holiday: null,
      leave: null,
      isHalfDay: false,
      halfDayType: null,
      workingWeekConfig: wwConfig
    };
  }

  // 3. Approved Leave Check
  const approvedLeave = await getApprovedLeaveForDate(employeeId, dateStr, executor);
  if (approvedLeave) {
    if (approvedLeave.is_half_day) {
      return {
        date: dateStr,
        dayType: 'half_day_leave',
        isWorkingDay: true, // half working day
        holiday: null,
        leave: approvedLeave,
        isHalfDay: true,
        halfDayType: approvedLeave.half_day_type || 'first_half',
        workingWeekConfig: wwConfig
      };
    }
    return {
      date: dateStr,
      dayType: 'on_leave',
      isWorkingDay: false,
      holiday: null,
      leave: approvedLeave,
      isHalfDay: false,
      halfDayType: null,
      workingWeekConfig: wwConfig
    };
  }

  // 4. Default: Working Day
  return {
    date: dateStr,
    dayType: 'working',
    isWorkingDay: true,
    holiday: null,
    leave: null,
    isHalfDay: false,
    halfDayType: null,
    workingWeekConfig: wwConfig
  };
}

/**
 * Requirement 3 & 4: getWorkingDays(employeeId, startDate, endDate)
 * Calculates working days between startDate and endDate skipping weekends & holidays.
 * Generates warning list if request overlaps with weekends or public holidays.
 */
async function getWorkingDays(employeeId, startDateInput, endDateInput, connection = null) {
  const executor = connection || pool;
  const startStr = formatDate(startDateInput);
  const endStr = formatDate(endDateInput);

  const startObj = parseLocalDate(startStr);
  const endObj = parseLocalDate(endStr);

  if (startObj.getTime() > endObj.getTime()) {
    return {
      workingDaysCount: 0,
      workingDates: [],
      totalCalendarDays: 0,
      holidaysCount: 0,
      weekendDaysCount: 0,
      holidaysList: [],
      warnings: ['Start date cannot be after end date.']
    };
  }

  let cur = new Date(startObj);
  let totalCalendarDays = 0;
  let workingDaysCount = 0;
  let holidaysCount = 0;
  let weekendDaysCount = 0;
  const workingDates = [];
  const holidaysList = [];
  const warnings = [];

  while (cur.getTime() <= endObj.getTime()) {
    totalCalendarDays++;
    const curStr = formatDate(cur);
    const dayOfWeek = cur.getDay();

    // Check holiday first
    const holiday = await getHolidayForDate(employeeId, curStr, executor);
    if (holiday) {
      holidaysCount++;
      if (!holidaysList.some((h) => h.id === holiday.id && h.date === curStr)) {
        holidaysList.push({
          id: holiday.id,
          name: holiday.name,
          date: curStr,
          scope: holiday.scope
        });
      }
    } else {
      // Check working week config
      const wwConfig = await getWorkingWeekConfig(employeeId, curStr, executor);
      const isWorking = isDayWorkingInConfig(wwConfig, dayOfWeek);
      if (!isWorking) {
        weekendDaysCount++;
      } else {
        workingDaysCount += 1.0;
        workingDates.push(curStr);
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Generate clear user warnings
  if (holidaysCount > 0) {
    const names = [...new Set(holidaysList.map((h) => h.name))].join(', ');
    warnings.push(`Your request spans ${holidaysCount} holiday day(s) (${names}) which are excluded from deduction.`);
  }

  if (weekendDaysCount > 0) {
    warnings.push(`Your request spans ${weekendDaysCount} regular weekend/off day(s) which are excluded from deduction.`);
  }

  return {
    workingDaysCount,
    workingDates,
    totalCalendarDays,
    holidaysCount,
    weekendDaysCount,
    holidaysList,
    warnings
  };
}

/**
 * Requirement 3 & 5: getAbsentDays(employeeId, month)
 * Calculates absent days for an employee during a calendar month ('YYYY-MM').
 * - Only active dates are counted for mid-month joiners/leavers.
 * - Weekends and Holidays are excluded from absence.
 * - Approved leave excludes days from absence; Pending leave does NOT.
 * - Holiday work / Weekend work is recognized if punched.
 */
async function getAbsentDays(employeeId, monthStr, connection = null) {
  const executor = connection || pool;
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStartDate = `${yearStr}-${String(month).padStart(2, '0')}-01`;
  const monthEndDate = `${yearStr}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // 1. Fetch Employee Profile
  const [empRows] = await executor.query(
    'SELECT id, name, created_at, joining_date, termination_date, deleted_at, status FROM employees WHERE id = ?',
    [employeeId]
  );
  if (empRows.length === 0) {
    return {
      month: monthStr,
      absentDaysCount: 0,
      absentDates: [],
      workingDaysCount: 0,
      presentDaysCount: 0,
      holidayWorkDates: [],
      weekendWorkDates: []
    };
  }
  const employee = empRows[0];

  // Active period for mid-month joiner / leaver
  const joinDate = employee.joining_date ? formatDate(employee.joining_date) : formatDate(employee.created_at);
  const termDate = employee.termination_date ? formatDate(employee.termination_date) : (employee.deleted_at ? formatDate(employee.deleted_at) : null);

  const activeStartDate = joinDate && joinDate > monthStartDate ? joinDate : monthStartDate;
  const activeEndDate = termDate && termDate < monthEndDate ? termDate : monthEndDate;

  // 2. Fetch Attendance Records for the Month
  const [attRows] = await executor.query(
    `SELECT a.*, o_in.name AS office_name
     FROM attendance a
     LEFT JOIN office_locations o_in ON a.check_in_office_id = o_in.id
     WHERE a.employee_id = ? AND a.date BETWEEN ? AND ?`,
    [employeeId, monthStartDate, monthEndDate]
  );
  const attendanceMap = new Map();
  for (const att of attRows) {
    attendanceMap.set(formatDate(att.date), att);
  }

  // 3. Fetch Approved Leaves for the Month
  const [leaveRows] = await executor.query(
    `SELECT * FROM leave_requests
     WHERE employee_id = ?
       AND status = 'APPROVED'
       AND (start_date <= ? AND end_date >= ?)`,
    [employeeId, monthEndDate, monthStartDate]
  );
  const approvedLeavesMap = new Map();
  for (const lr of leaveRows) {
    let cur = new Date(parseLocalDate(lr.start_date));
    const end = parseLocalDate(lr.end_date);
    while (cur.getTime() <= end.getTime()) {
      approvedLeavesMap.set(formatDate(cur), lr);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // 4. Iterate every calendar day in active period
  let curObj = parseLocalDate(activeStartDate);
  const activeEndObj = parseLocalDate(activeEndDate);

  let scheduledWorkingDays = 0;
  let presentDaysCount = 0;
  let absentDaysCount = 0;
  const absentDates = [];
  const holidayWorkDates = [];
  const weekendWorkDates = [];
  const onLeaveDates = [];
  const holidayDates = [];
  const weekendDates = [];

  while (curObj.getTime() <= activeEndObj.getTime()) {
    const curDateStr = formatDate(curObj);
    const dayOfWeek = curObj.getDay();
    const att = attendanceMap.get(curDateStr);
    const hasPunch = att && att.check_in && att.status !== 'Absent';

    // A. Check Holiday
    const holiday = await getHolidayForDate(employeeId, curDateStr, executor);
    if (holiday) {
      holidayDates.push(curDateStr);
      if (hasPunch) {
        holidayWorkDates.push({
          date: curDateStr,
          officeName: att.office_name || 'Office',
          totalHours: parseFloat(att.total_hours) || 0,
          attendanceId: att.id
        });
      }
      curObj.setDate(curObj.getDate() + 1);
      continue;
    }

    // B. Check Weekend
    const wwConfig = await getWorkingWeekConfig(employeeId, curDateStr, executor);
    const isWorking = isDayWorkingInConfig(wwConfig, dayOfWeek);
    if (!isWorking) {
      weekendDates.push(curDateStr);
      if (hasPunch) {
        weekendWorkDates.push({
          date: curDateStr,
          officeName: att.office_name || 'Office',
          totalHours: parseFloat(att.total_hours) || 0,
          attendanceId: att.id
        });
      }
      curObj.setDate(curObj.getDate() + 1);
      continue;
    }

    // C. It is a scheduled working day
    scheduledWorkingDays++;

    // D. Check Approved Leave
    const approvedLeave = approvedLeavesMap.get(curDateStr);
    if (approvedLeave) {
      if (approvedLeave.is_half_day) {
        onLeaveDates.push({ date: curDateStr, leaveType: approvedLeave.leave_type, isHalfDay: true });
        if (hasPunch) {
          presentDaysCount += 1.0;
        } else {
          // Half day absent
          absentDaysCount += 0.5;
          absentDates.push(`${curDateStr} (Half Day)`);
        }
      } else {
        onLeaveDates.push({ date: curDateStr, leaveType: approvedLeave.leave_type, isHalfDay: false });
        // Full approved leave -> excluded from absence
      }
      curObj.setDate(curObj.getDate() + 1);
      continue;
    }

    // E. Scheduled working day without approved leave
    if (hasPunch) {
      presentDaysCount += 1.0;
    } else {
      absentDaysCount += 1.0;
      absentDates.push(curDateStr);
    }

    curObj.setDate(curObj.getDate() + 1);
  }

  return {
    month: monthStr,
    activeStartDate,
    activeEndDate,
    scheduledWorkingDays,
    presentDaysCount,
    absentDaysCount,
    absentDates,
    holidayWorkDates,
    weekendWorkDates,
    onLeaveDates,
    holidayDates,
    weekendDates
  };
}

/**
 * Requirement 4 & 9: Recalculate Approved Leaves when a holiday is added or updated.
 * Returns extra balance to employee and logs audit inside a transaction.
 */
async function recalculateApprovedLeavesForHoliday(holiday, connection = null) {
  const isOuterTransaction = Boolean(connection);
  const conn = connection || (await pool.getConnection());

  try {
    if (!isOuterTransaction) {
      await conn.beginTransaction();
    }

    const holidayStart = formatDate(holiday.date);
    const holidayEnd = formatDate(holiday.end_date || holiday.date);

    // Find all overlapping approved leave requests
    let query = `
      SELECT lr.*, e.name AS employee_name, e.department_id
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.status = 'APPROVED'
        AND lr.start_date <= ?
        AND lr.end_date >= ?
    `;
    const params = [holidayEnd, holidayStart];

    if (holiday.scope === 'department' && holiday.department_id) {
      query += ' AND e.department_id = ?';
      params.push(holiday.department_id);
    }

    query += ' FOR UPDATE';

    const [overlappingLeaves] = await conn.query(query, params);
    const updatedLeaves = [];

    const typePrefixMap = {
      Annual: 'annual',
      Sick: 'sick',
      Casual: 'casual',
      Maternity: 'maternity',
      Paternity: 'paternity',
    };

    for (const leave of overlappingLeaves) {
      const { workingDaysCount } = await getWorkingDays(
        leave.employee_id,
        leave.start_date,
        leave.end_date,
        conn
      );

      const oldDaysCount = parseFloat(leave.days_count);
      const newDaysCount = leave.is_half_day ? 0.5 : workingDaysCount;

      if (newDaysCount < oldDaysCount) {
        const difference = parseFloat((oldDaysCount - newDaysCount).toFixed(1));
        const leaveYear = parseLocalDate(leave.start_date).getFullYear();

        const prefix = typePrefixMap[leave.leave_type];
        if (prefix) {
          // Restore deducted balance
          await conn.query(
            `UPDATE leave_balances
             SET ${prefix}_used = GREATEST(0, ${prefix}_used - ?)
             WHERE employee_id = ? AND year = ?`,
            [difference, leave.employee_id, leaveYear]
          );
        }

        // Update leave request with new working days count
        await conn.query(
          'UPDATE leave_requests SET days_count = ? WHERE id = ?',
          [newDaysCount, leave.id]
        );

        // Check if locked payroll adjustment is required
        const leaveMonth = formatDate(leave.start_date).slice(0, 7);
        const [lockedRuns] = await conn.query(
          'SELECT id, working_days FROM payroll_runs WHERE month = ? AND status = "Locked"',
          [leaveMonth]
        );
        if (lockedRuns.length > 0) {
          const lockedRun = lockedRuns[0];
          const [salRows] = await conn.query(
            'SELECT basic_salary FROM employee_salaries WHERE employee_id = ?',
            [leave.employee_id]
          );
          const basic = Number(salRows[0]?.basic_salary) || 0;
          const wDays = lockedRun.working_days || 22;
          const dailyRate = wDays > 0 ? Math.round((basic / wDays) * 100) / 100 : 0;
          const adjAmount = leave.leave_type === 'Unpaid' ? (dailyRate * difference) : 0;

          if (adjAmount > 0) {
            await conn.query(`
              INSERT INTO payroll_adjustments (employee_id, source_month, type, amount, reason, reference_id, status)
              VALUES (?, ?, 'LEAVE_CHANGE', ?, ?, ?, 'PENDING')
            `, [
              leave.employee_id,
              leaveMonth,
              adjAmount,
              `Restored ${difference} unpaid day(s) pay due to retroactive holiday ${holiday.name} on ${holiday.date}`,
              leave.id
            ]);
          }
        }

        updatedLeaves.push({
          leaveId: leave.id,
          employeeId: leave.employee_id,
          employeeName: leave.employee_name,
          oldDaysCount,
          newDaysCount,
          difference
        });
      }
    }

    if (!isOuterTransaction) {
      await conn.commit();
    }

    return {
      success: true,
      updatedCount: updatedLeaves.length,
      updatedLeaves
    };
  } catch (err) {
    if (!isOuterTransaction) {
      await conn.rollback();
    }
    throw err;
  } finally {
    if (!isOuterTransaction) {
      conn.release();
    }
  }
}

module.exports = {
  formatDate,
  parseLocalDate,
  isMonthLocked,
  getWorkingWeekConfig,
  isDayWorkingInConfig,
  getHolidayForDate,
  getApprovedLeaveForDate,
  getDayType,
  getWorkingDays,
  getAbsentDays,
  recalculateApprovedLeavesForHoliday
};
