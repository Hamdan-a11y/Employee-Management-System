const pool = require('../db');
const { logAudit } = require('./auditLogger');

/**
 * Format a Date object or string into 'YYYY-MM-DD' calendar date string.
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
 * Calculate the exact number of days between two calendar dates (date2 - date1)
 * without timezone offset skew.
 */
function getCalendarDaysBetween(dateStr1, dateStr2) {
  const d1 = formatDate(dateStr1);
  const d2 = formatDate(dateStr2);
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, day1);
  const utc2 = Date.UTC(y2, m2 - 1, day2);
  return Math.floor((utc2 - utc1) / (24 * 60 * 60 * 1000));
}

/**
 * Fetches the configurable default shift, or falls back to standard values.
 */
async function getDefaultShift(connection = null) {
  const executor = connection || pool;
  const [rows] = await executor.query(
    'SELECT * FROM shifts WHERE is_default = TRUE AND is_active = TRUE LIMIT 1'
  );
  if (rows.length > 0) {
    return {
      ...rows[0],
      crosses_midnight: rows[0].type === 'night' || (rows[0].start_time && rows[0].end_time && rows[0].end_time < rows[0].start_time),
      source: 'default'
    };
  }

  // Next fallback: first active shift
  const [firstActive] = await executor.query(
    'SELECT * FROM shifts WHERE is_active = TRUE ORDER BY id ASC LIMIT 1'
  );
  if (firstActive.length > 0) {
    return {
      ...firstActive[0],
      crosses_midnight: firstActive[0].type === 'night' || (firstActive[0].start_time && firstActive[0].end_time && firstActive[0].end_time < firstActive[0].start_time),
      source: 'default'
    };
  }

  // System hard fallback
  return {
    id: null,
    name: 'Standard Morning Shift (Default)',
    type: 'morning',
    start_time: '09:00:00',
    end_time: '17:00:00',
    grace_minutes: 15,
    break_minutes: 60,
    min_working_minutes: 480,
    is_active: 1,
    is_default: 1,
    crosses_midnight: false,
    source: 'default'
  };
}

/**
 * Calculates which shift applies on targetDate for a weekly rotation pattern.
 * Pattern repeats every N weeks from rotationStartDate.
 */
async function calculateRotationShift(rotationId, rotationStartDate, targetDate, connection = null) {
  const executor = connection || pool;
  const [steps] = await executor.query(
    `SELECT step.*, s.* 
     FROM shift_rotation_steps step
     JOIN shifts s ON step.shift_id = s.id
     WHERE step.rotation_id = ?
     ORDER BY step.week_number ASC`,
    [rotationId]
  );

  if (steps.length === 0) {
    return await getDefaultShift(executor);
  }

  const daysDiff = getCalendarDaysBetween(rotationStartDate, targetDate);
  // If target date is prior to rotation start, return default
  if (daysDiff < 0) {
    return await getDefaultShift(executor);
  }

  const weekDiff = Math.floor(daysDiff / 7);
  const stepIndex = weekDiff % steps.length;
  const matched = steps[stepIndex];

  return {
    ...matched,
    crosses_midnight: matched.type === 'night' || (matched.start_time && matched.end_time && matched.end_time < matched.start_time),
    rotation_id: rotationId,
    rotation_week: matched.week_number,
    source: 'rotation'
  };
}

/**
 * Requirement 4: ONE SHARED FUNCTION
 * getEmployeeShift(employeeId, date) returns the shift for that day (from rotation or assignment).
 * Used everywhere (check-in, checkout, late calculation, schedule grid, reports).
 */
async function getEmployeeShift(employeeId, dateInput, connection = null) {
  const executor = connection || pool;
  const targetDate = formatDate(dateInput || new Date());
  const empId = parseInt(employeeId, 10);

  if (!empId || isNaN(empId)) {
    return await getDefaultShift(executor);
  }

  // Find active assignment covering targetDate
  const [assignments] = await executor.query(
    `SELECT a.*, 
            s.id AS s_id, s.name AS s_name, s.type AS s_type, s.start_time AS s_start_time, 
            s.end_time AS s_end_time, s.grace_minutes AS s_grace_minutes, 
            s.break_minutes AS s_break_minutes, s.min_working_minutes AS s_min_working_minutes,
            s.is_active AS s_is_active, s.is_default AS s_is_default,
            r.id AS r_id, r.name AS r_name
     FROM employee_shift_assignments a
     LEFT JOIN shifts s ON a.shift_id = s.id
     LEFT JOIN shift_rotations r ON a.rotation_id = r.id
     WHERE a.employee_id = ?
       AND a.start_date <= ?
       AND (a.end_date IS NULL OR a.end_date >= ?)
     ORDER BY a.start_date DESC, a.id DESC
     LIMIT 1`,
    [empId, targetDate, targetDate]
  );

  if (assignments.length > 0) {
    const assign = assignments[0];

    // If direct shift assignment
    if (assign.shift_id && assign.s_id && assign.s_is_active) {
      const crossesMidnight = assign.s_type === 'night' || (assign.s_start_time && assign.s_end_time && assign.s_end_time < assign.s_start_time);
      return {
        id: assign.s_id,
        name: assign.s_name,
        type: assign.s_type,
        start_time: assign.s_start_time,
        end_time: assign.s_end_time,
        grace_minutes: assign.s_grace_minutes,
        break_minutes: assign.s_break_minutes,
        min_working_minutes: assign.s_min_working_minutes,
        is_active: assign.s_is_active,
        is_default: assign.s_is_default,
        crosses_midnight: crossesMidnight,
        assignment_id: assign.id,
        assignment_start: assign.start_date,
        assignment_end: assign.end_date,
        source: 'assignment'
      };
    }

    // If rotation assignment
    if (assign.rotation_id) {
      const rotShift = await calculateRotationShift(assign.rotation_id, assign.start_date, targetDate, executor);
      return {
        ...rotShift,
        assignment_id: assign.id,
        assignment_start: assign.start_date,
        assignment_end: assign.end_date,
        rotation_id: assign.rotation_id,
        rotation_name: assign.r_name,
        source: 'rotation'
      };
    }
  }

  // No specific assignment: return configurable default shift
  return await getDefaultShift(executor);
}

/**
 * Checks for overlapping shift assignments for an employee.
 * Returns array of conflicting assignments (empty if none).
 */
async function checkAssignmentOverlap(employeeId, startDateInput, endDateInput = null, excludeAssignmentId = null, connection = null) {
  const executor = connection || pool;
  const startDate = formatDate(startDateInput);
  const endDate = endDateInput ? formatDate(endDateInput) : null;
  const empId = parseInt(employeeId, 10);

  let query = `
    SELECT a.*, 
           s.name AS shift_name, 
           r.name AS rotation_name,
           e.name AS employee_name
    FROM employee_shift_assignments a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN shifts s ON a.shift_id = s.id
    LEFT JOIN shift_rotations r ON a.rotation_id = r.id
    WHERE a.employee_id = ?
      AND (? IS NULL OR a.start_date <= ?)
      AND (a.end_date IS NULL OR a.end_date >= ?)
  `;
  const params = [empId, endDate, endDate, startDate];

  if (excludeAssignmentId) {
    query += ' AND a.id != ?';
    params.push(excludeAssignmentId);
  }

  const [overlaps] = await executor.query(query, params);
  return overlaps;
}

/**
 * Requirement 5: ATTENDANCE INTEGRATION
 * Calculate late status based on check-in timestamp and employee shift.
 */
function calculateLateStatus(checkInDateObj, shift) {
  if (!shift || shift.type === 'flexible' || !shift.start_time) {
    return { isLate: false, lateMinutes: 0, status: 'Present' };
  }

  const checkIn = new Date(checkInDateObj);
  const parts = String(shift.start_time).split(':');
  const startH = parseInt(parts[0], 10) || 0;
  const startM = parseInt(parts[1], 10) || 0;
  const startS = parseInt(parts[2], 10) || 0;

  // Shift start time on the date of check-in
  const shiftStart = new Date(checkIn);
  shiftStart.setHours(startH, startM, startS, 0);

  const graceMinutes = parseInt(shift.grace_minutes, 10) || 0;
  const graceCutoff = new Date(shiftStart.getTime() + graceMinutes * 60 * 1000);

  if (checkIn.getTime() > graceCutoff.getTime()) {
    const diffMs = checkIn.getTime() - shiftStart.getTime();
    const lateMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return { isLate: true, lateMinutes, status: 'Late' };
  }

  return { isLate: false, lateMinutes: 0, status: 'Present' };
}

/**
 * Requirement 5: ATTENDANCE INTEGRATION
 * Calculate working hours and flag short day if under minimum minutes.
 * Working hours = (check-out - check-in) - break minutes.
 */
function calculateWorkingHoursAndShortDay(checkInDateObj, checkOutDateObj, shift) {
  const checkIn = new Date(checkInDateObj);
  const checkOut = new Date(checkOutDateObj);
  const diffMs = checkOut.getTime() - checkIn.getTime();

  if (diffMs <= 0) {
    return {
      totalHours: 0,
      breakMinutes: 0,
      effectiveMinutes: 0,
      isShortDay: true
    };
  }

  const rawMinutes = diffMs / (60 * 1000);
  const breakMinutes = shift ? (parseInt(shift.break_minutes, 10) || 0) : 0;
  const effectiveMinutes = Math.max(0, rawMinutes - breakMinutes);
  const totalHours = parseFloat((effectiveMinutes / 60).toFixed(2));

  const minWorkingMinutes = shift ? (parseInt(shift.min_working_minutes, 10) || 0) : 0;
  const isShortDay = minWorkingMinutes > 0 ? (effectiveMinutes < minWorkingMinutes) : (totalHours < 4);

  return {
    totalHours,
    breakMinutes,
    effectiveMinutes,
    isShortDay
  };
}

/**
 * Assign a shift or rotation to a single employee.
 */
async function assignShiftToEmployee({
  employeeId,
  shiftId = null,
  rotationId = null,
  startDate,
  endDate = null,
  notes = null,
  assignedByUserId = null,
  req = null,
  connection = null
}) {
  const executor = connection || pool;
  const empId = parseInt(employeeId, 10);
  const sDate = formatDate(startDate);
  const eDate = endDate ? formatDate(endDate) : null;

  if (eDate && eDate < sDate) {
    throw new Error('End date cannot be earlier than start date.');
  }

  if (!shiftId && !rotationId) {
    throw new Error('Must specify either a shift or a rotation.');
  }
  if (shiftId && rotationId) {
    throw new Error('Cannot assign both a shift and a rotation simultaneously.');
  }

  // 1. Check employee exists and active
  const [emps] = await executor.query(
    'SELECT id, name, department_id, status FROM employees WHERE id = ? AND deleted_at IS NULL',
    [empId]
  );
  if (emps.length === 0) {
    throw new Error(`Employee #${empId} not found or is deleted.`);
  }
  const employee = emps[0];

  // 2. Prevent overlapping assignments for the same employee
  const overlaps = await checkAssignmentOverlap(empId, sDate, eDate, null, executor);
  if (overlaps.length > 0) {
    const o = overlaps[0];
    const existingName = o.shift_name || o.rotation_name || 'Existing Assignment';
    const existingRange = `${formatDate(o.start_date)} to ${o.end_date ? formatDate(o.end_date) : 'Ongoing'}`;
    const err = new Error(`Overlapping assignment exists for ${employee.name} (${existingName}: ${existingRange}).`);
    err.overlaps = overlaps;
    throw err;
  }

  // 3. Insert assignment
  const [res] = await executor.query(
    `INSERT INTO employee_shift_assignments (employee_id, shift_id, rotation_id, start_date, end_date, assigned_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [empId, shiftId || null, rotationId || null, sDate, eDate || null, assignedByUserId || null, notes || null]
  );

  const newAssignmentId = res.insertId;

  // 4. Log in audit log
  await logAudit({
    connection: executor,
    req,
    userId: assignedByUserId,
    action: 'CREATE',
    entityType: 'SHIFT_ASSIGNMENT',
    entityId: newAssignmentId,
    employeeName: employee.name,
    details: `Assigned ${shiftId ? `shift #${shiftId}` : `rotation #${rotationId}`} from ${sDate}${eDate ? ` to ${eDate}` : ' (ongoing)'}`
  });

  return {
    assignmentId: newAssignmentId,
    employeeId: empId,
    employeeName: employee.name,
    startDate: sDate,
    endDate: eDate
  };
}

/**
 * Requirement 2 & 9: Assign shift to whole department in a transaction.
 * Creates one assignment row per active employee.
 */
async function assignShiftToDepartment({
  departmentId,
  shiftId = null,
  rotationId = null,
  startDate,
  endDate = null,
  notes = null,
  assignedByUserId = null,
  req = null
}) {
  const deptId = parseInt(departmentId, 10);
  const sDate = formatDate(startDate);
  const eDate = endDate ? formatDate(endDate) : null;

  if (eDate && eDate < sDate) {
    throw new Error('End date cannot be earlier than start date.');
  }

  if (!shiftId && !rotationId) {
    throw new Error('Must specify either a shift or a rotation.');
  }
  if (shiftId && rotationId) {
    throw new Error('Cannot assign both a shift and a rotation simultaneously.');
  }

  // Fetch department details
  const [deptRows] = await pool.query('SELECT id, name FROM departments WHERE id = ?', [deptId]);
  if (deptRows.length === 0) {
    throw new Error(`Department #${deptId} does not exist.`);
  }
  const department = deptRows[0];

  // Fetch active employees in department
  const [employees] = await pool.query(
    `SELECT id, name FROM employees 
     WHERE department_id = ? AND status = 'Active' AND deleted_at IS NULL
     ORDER BY name ASC`,
    [deptId]
  );

  if (employees.length === 0) {
    throw new Error(`Department "${department.name}" has no active employees.`);
  }

  // Pre-check for overlapping assignments for all active employees
  const allOverlaps = [];
  for (const emp of employees) {
    const overlaps = await checkAssignmentOverlap(emp.id, sDate, eDate, null, pool);
    if (overlaps.length > 0) {
      allOverlaps.push({
        employeeId: emp.id,
        employeeName: emp.name,
        overlappingAssignments: overlaps
      });
    }
  }

  if (allOverlaps.length > 0) {
    const names = allOverlaps.map(o => o.employeeName).slice(0, 3).join(', ');
    const count = allOverlaps.length;
    const msg = `Cannot assign department shift: ${count} employee(s) have overlapping shift assignments (${names}${count > 3 ? '...' : ''}).`;
    const err = new Error(msg);
    err.overlaps = allOverlaps;
    throw err;
  }

  // Execute in transaction
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const createdAssignments = [];
    for (const emp of employees) {
      const [res] = await connection.query(
        `INSERT INTO employee_shift_assignments (employee_id, shift_id, rotation_id, start_date, end_date, assigned_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [emp.id, shiftId || null, rotationId || null, sDate, eDate || null, assignedByUserId || null, notes || null]
      );

      createdAssignments.push({
        id: res.insertId,
        employee_id: emp.id,
        employee_name: emp.name
      });

      // Audit log per employee
      await logAudit({
        connection,
        req,
        userId: assignedByUserId,
        action: 'CREATE',
        entityType: 'SHIFT_ASSIGNMENT',
        entityId: res.insertId,
        employeeName: emp.name,
        details: `Assigned department (${department.name}) ${shiftId ? `shift #${shiftId}` : `rotation #${rotationId}`} from ${sDate}${eDate ? ` to ${eDate}` : ' (ongoing)'}`
      });
    }

    await connection.commit();

    return {
      departmentId: deptId,
      departmentName: department.name,
      totalAssigned: createdAssignments.length,
      assignments: createdAssignments
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Requirement 2: Never edit or delete an old assignment. Close it (set end date).
 */
async function closeAssignment({ assignmentId, endDate, req = null, closedByUserId = null }) {
  const assignId = parseInt(assignmentId, 10);
  const closeDate = formatDate(endDate);

  const [rows] = await pool.query(
    `SELECT a.*, e.name AS employee_name, s.name AS shift_name, r.name AS rotation_name
     FROM employee_shift_assignments a
     JOIN employees e ON a.employee_id = e.id
     LEFT JOIN shifts s ON a.shift_id = s.id
     LEFT JOIN shift_rotations r ON a.rotation_id = r.id
     WHERE a.id = ?`,
    [assignId]
  );

  if (rows.length === 0) {
    throw new Error(`Assignment #${assignId} not found.`);
  }

  const assignment = rows[0];
  const startDateStr = formatDate(assignment.start_date);

  if (closeDate < startDateStr) {
    throw new Error(`End date (${closeDate}) cannot be earlier than assignment start date (${startDateStr}).`);
  }

  await pool.query(
    'UPDATE employee_shift_assignments SET end_date = ? WHERE id = ?',
    [closeDate, assignId]
  );

  await logAudit({
    req,
    userId: closedByUserId,
    action: 'UPDATE',
    entityType: 'SHIFT_ASSIGNMENT',
    entityId: assignId,
    employeeName: assignment.employee_name,
    details: `Closed assignment #${assignId} (${assignment.shift_name || assignment.rotation_name}): set end date to ${closeDate}`
  });

  return {
    id: assignId,
    employee_id: assignment.employee_id,
    employee_name: assignment.employee_name,
    start_date: startDateStr,
    end_date: closeDate
  };
}

module.exports = {
  formatDate,
  getCalendarDaysBetween,
  getDefaultShift,
  calculateRotationShift,
  getEmployeeShift,
  checkAssignmentOverlap,
  calculateLateStatus,
  calculateWorkingHoursAndShortDay,
  assignShiftToEmployee,
  assignShiftToDepartment,
  closeAssignment
};
