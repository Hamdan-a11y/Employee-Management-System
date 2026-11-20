const pool = require('../db');
const { getEmployeeShift } = require('../services/shiftService');
const { isMonthLocked } = require('../services/calendarService');
const { notifyEmployeeUser, notifyUser } = require('../services/notificationService');
const { getKarachiDate, getKarachiTime, runJob } = require('./runner');

/**
 * Helper to notify department manager
 */
async function notifyDepartmentManager({ departmentId, title, message }) {
  if (!departmentId) return;
  try {
    const [managers] = await pool.query(
      "SELECT id FROM users WHERE role = 'department_manager' AND department_id = ?",
      [departmentId]
    );
    for (const mgr of managers) {
      await notifyUser({
        userId: mgr.id,
        type: 'system',
        title,
        message,
        link: '/attendance'
      });
    }
  } catch (err) {
    console.error('[missingCheckout] Failed to notify department manager:', err.message);
  }
}

/**
 * Checks if a shift check-out is missing past shift end + buffer minutes
 */
function isMissingCheckout(shift, checkInTimeStr, recordDate, karachiDate, karachiTime, bufferMinutes = 60) {
  if (!shift) return false;

  const [curH, curMin] = karachiTime.split(':').map(Number);
  const nowMinutesTotal = curH * 60 + curMin;

  if (recordDate < karachiDate) {
    if (shift.crosses_midnight) {
      const [y, m, d] = recordDate.split('-').map(Number);
      const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
      if (nextDay === karachiDate) {
        // Ends today morning at shift.end_time + buffer
        const [endH, endMin] = (shift.end_time || '06:00:00').split(':').map(Number);
        const shiftEndWithBuffer = endH * 60 + endMin + bufferMinutes;
        return nowMinutesTotal >= shiftEndWithBuffer;
      }
      return true;
    }
    return true;
  }

  if (recordDate === karachiDate) {
    if (shift.crosses_midnight) {
      // Night shift crossing midnight ends tomorrow morning
      return false;
    }

    if (shift.type === 'flexible' || !shift.end_time) {
      // Flexible shift: buffer past minimum working hours from check-in
      if (!checkInTimeStr) return false;
      const checkInDate = new Date(checkInTimeStr);
      const minMinutes = shift.min_working_minutes || 480;
      const expectedEnd = new Date(checkInDate.getTime() + (minMinutes + bufferMinutes) * 60000);
      return new Date() >= expectedEnd;
    }

    // Fixed daytime shift: compare current time with end_time + buffer
    const [endH, endMin] = (shift.end_time || '18:00:00').split(':').map(Number);
    const shiftEndWithBuffer = endH * 60 + endMin + bufferMinutes;
    return nowMinutesTotal >= shiftEndWithBuffer;
  }

  return false;
}

/**
 * Core missing_checkout execution
 */
async function executeMissingCheckout(context = {}) {
  const targetDate = context.date || getKarachiDate();
  const karachiDate = getKarachiDate();
  const karachiTime = getKarachiTime();
  const bufferMinutes = context.bufferMinutes || 60;

  // Skip if month is closed
  const isLocked = await isMonthLocked(targetDate);
  if (isLocked) {
    console.log(`[missing_checkout] Month for ${targetDate} is locked/closed. Skipping.`);
    return 0;
  }

  // Find attendance rows with check-in but no check-out
  const [records] = await pool.query(
    `SELECT a.id, a.employee_id, a.date, a.check_in, a.notes, a.is_missing_checkout,
            e.name AS employee_name, e.department_id
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.date <= ? 
       AND a.check_in IS NOT NULL 
       AND a.check_out IS NULL
       AND (a.is_missing_checkout = 0 OR a.is_missing_checkout IS NULL)`,
    [targetDate]
  );

  let flaggedCount = 0;

  for (const record of records) {
    const shift = await getEmployeeShift(record.employee_id, record.date);
    const recDate = typeof record.date === 'string' 
      ? record.date.slice(0, 10) 
      : (record.date instanceof Date ? record.date.toISOString().slice(0, 10) : String(record.date));

    const missing = isMissingCheckout(
      shift,
      record.check_in,
      recDate,
      karachiDate,
      karachiTime,
      bufferMinutes
    );

    if (missing) {
      // Flag record
      await pool.query(
        `UPDATE attendance 
         SET is_missing_checkout = 1,
             is_flagged_suspicious = 1,
             suspicious_reason = 'Missing check-out after shift end',
             notes = CONCAT(IFNULL(notes, ''), ' [Missing Check-out flagged by automated job]')
         WHERE id = ?`,
        [record.id]
      );

      // Notify Employee
      await notifyEmployeeUser({
        employeeId: record.employee_id,
        type: 'profile',
        title: 'Missing Check-out Alert',
        message: `You did not record a check-out for your shift on ${record.date}. Please submit an attendance correction request if needed.`,
        link: '/attendance'
      });

      // Notify Manager
      await notifyDepartmentManager({
        departmentId: record.department_id,
        title: 'Employee Missing Check-out',
        message: `Employee ${record.employee_name} has not recorded a check-out for their shift on ${record.date}.`
      });

      flaggedCount++;
    }
  }

  return flaggedCount;
}

/**
 * Runner caller for missing_checkout
 */
async function missingCheckoutJob(options = {}) {
  const targetDate = options.date || getKarachiDate();
  return await runJob({
    jobName: 'missing_checkout',
    runKey: `missing_checkout:${targetDate}`,
    jobFn: executeMissingCheckout,
    force: Boolean(options.force),
    context: { ...options, date: targetDate }
  });
}

module.exports = {
  missingCheckoutJob,
  executeMissingCheckout,
  isMissingCheckout
};
