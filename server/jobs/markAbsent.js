const pool = require('../db');
const { getEmployeeShift } = require('../services/shiftService');
const { getDayType, isMonthLocked } = require('../services/calendarService');
const { getKarachiDate, getKarachiTime, runJob } = require('./runner');

/**
 * Checks whether a given shift has fully ended relative to Karachi wall-clock time.
 */
function hasShiftEnded(shift, targetDate, karachiDate, karachiTime) {
  if (!shift) return true;

  // If checking a past date (prior to yesterday), shifts have definitely ended
  if (targetDate < karachiDate) {
    if (shift.crosses_midnight) {
      // Night shift crossing midnight ends on the morning of targetDate + 1
      // If targetDate is yesterday, it ended this morning at shift.end_time
      const [y, m, d] = targetDate.split('-').map(Number);
      const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
      if (nextDay === karachiDate) {
        // Today is the morning it ends; compare current time to end_time
        return shift.end_time ? karachiTime >= shift.end_time : true;
      }
      return targetDate < nextDay;
    }
    return true;
  }

  // If targetDate is today
  if (targetDate === karachiDate) {
    if (shift.crosses_midnight) {
      // Shift that starts tonight (e.g. 22:00) doesn't end until tomorrow morning (06:00)
      return false;
    }
    if (shift.type === 'flexible' || !shift.end_time) {
      // Flexible shifts end at midnight
      return false;
    }
    // Fixed daytime shift: compare current time with end_time (+ grace)
    const grace = shift.grace_minutes || 0;
    const [h, min, s] = (shift.end_time || '18:00:00').split(':').map(Number);
    const endMinutes = h * 60 + min + grace;
    const [curH, curMin] = karachiTime.split(':').map(Number);
    const curMinutes = curH * 60 + curMin;

    return curMinutes >= endMinutes;
  }

  // Future dates
  return false;
}

/**
 * Automated mark_absent job logic
 * Marks employees with no check-in as absent after shift end.
 * Skips holidays, weekends, approved leaves, and already-marked records.
 */
async function executeMarkAbsent(context = {}) {
  const targetDate = context.date || getKarachiDate();
  const karachiDate = getKarachiDate();
  const karachiTime = getKarachiTime();

  // 1. Skip if month is closed/locked
  const isLocked = await isMonthLocked(targetDate);
  if (isLocked) {
    console.log(`[mark_absent] Month for ${targetDate} is locked/closed. Skipping.`);
    return 0;
  }

  // 2. Fetch active employees
  const [employees] = await pool.query(
    `SELECT id, name, department_id, joining_date 
     FROM employees 
     WHERE status = 'Active' AND (joining_date IS NULL OR joining_date <= ?)`,
    [targetDate]
  );

  if (employees.length === 0) return 0;

  // 3. Process employees in transaction
  const connection = await pool.getConnection();
  let markedCount = 0;

  try {
    await connection.beginTransaction();

    for (const emp of employees) {
      // Check if shift has ended
      const shift = await getEmployeeShift(emp.id, targetDate, connection);
      const ended = hasShiftEnded(shift, targetDate, karachiDate, karachiTime);
      if (!ended) {
        continue;
      }

      // Check calendar day type (skip holidays, weekends, approved leave)
      const calendar = await getDayType(emp.id, targetDate, connection);
      if (
        calendar.dayType === 'holiday' ||
        calendar.dayType === 'weekend' ||
        calendar.dayType === 'on_leave' ||
        !calendar.isWorkingDay
      ) {
        continue;
      }

      // Check if attendance record already exists for (employee_id, date)
      const [existing] = await connection.query(
        'SELECT id, check_in, status FROM attendance WHERE employee_id = ? AND date = ?',
        [emp.id, targetDate]
      );

      if (existing.length > 0) {
        // Already marked or already checked in
        continue;
      }

      // Insert Absent record
      await connection.query(
        `INSERT INTO attendance (
          employee_id,
          shift_id,
          date,
          check_in,
          status,
          total_hours,
          is_late,
          late_minutes,
          is_short_day,
          notes
        ) VALUES (?, ?, ?, NULL, 'Absent', 0.00, 0, 0, 0, 'Automated: Marked absent after shift ended without check-in')`,
        [emp.id, shift?.id || null, targetDate]
      );

      markedCount++;
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return markedCount;
}

/**
 * Runner caller for mark_absent
 */
async function markAbsentJob(options = {}) {
  const targetDate = options.date || getKarachiDate();
  return await runJob({
    jobName: 'mark_absent',
    runKey: `mark_absent:${targetDate}`,
    jobFn: executeMarkAbsent,
    force: Boolean(options.force),
    context: { ...options, date: targetDate }
  });
}

module.exports = {
  markAbsentJob,
  executeMarkAbsent,
  hasShiftEnded
};
