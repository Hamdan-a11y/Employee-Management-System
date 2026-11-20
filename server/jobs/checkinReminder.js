const pool = require('../db');
const { getEmployeeShift } = require('../services/shiftService');
const { getDayType } = require('../services/calendarService');
const { notifyEmployeeUser } = require('../services/notificationService');
const { getKarachiDate, getKarachiTime, runJob } = require('./runner');

/**
 * Checks if current time is within reminder window before shift starts (e.g. 15-45 mins before)
 */
function isWithinReminderWindow(shiftStartTime, karachiTime, reminderWindowMinutes = 30) {
  if (!shiftStartTime) return false;

  const [startH, startMin] = shiftStartTime.split(':').map(Number);
  const startTotalMinutes = startH * 60 + startMin;

  const [curH, curMin] = karachiTime.split(':').map(Number);
  const curTotalMinutes = curH * 60 + curMin;

  // Minutes remaining until shift starts
  const minutesUntilStart = startTotalMinutes - curTotalMinutes;

  // Remind if within [0, reminderWindowMinutes] (e.g. 0 to 30 mins before start)
  return minutesUntilStart >= 0 && minutesUntilStart <= reminderWindowMinutes;
}

/**
 * Core checkin_reminder execution
 */
async function executeCheckinReminder(context = {}) {
  const targetDate = context.date || getKarachiDate();
  const karachiTime = getKarachiTime();
  const reminderWindow = context.reminderWindowMinutes || 45;

  const [employees] = await pool.query(
    "SELECT id, name, department_id FROM employees WHERE status = 'Active'"
  );

  let remindedCount = 0;

  for (const emp of employees) {
    // 1. Shift
    const shift = await getEmployeeShift(emp.id, targetDate);
    if (!shift || shift.type === 'flexible' || !shift.start_time) {
      continue;
    }

    // 2. Check window (if manual run without strict window check, ignore window check if context.ignoreWindow is set)
    if (!context.ignoreWindow && !isWithinReminderWindow(shift.start_time, karachiTime, reminderWindow)) {
      continue;
    }

    // 3. Skip weekends, holidays, approved leaves
    const calendar = await getDayType(emp.id, targetDate);
    if (
      calendar.dayType === 'holiday' ||
      calendar.dayType === 'weekend' ||
      calendar.dayType === 'on_leave' ||
      !calendar.isWorkingDay
    ) {
      continue;
    }

    // 4. Check if already checked in today
    const [attRows] = await pool.query(
      'SELECT id, check_in FROM attendance WHERE employee_id = ? AND date = ? AND check_in IS NOT NULL',
      [emp.id, targetDate]
    );

    if (attRows.length > 0) {
      continue; // already checked in
    }

    // 5. Send reminder
    await notifyEmployeeUser({
      employeeId: emp.id,
      type: 'profile',
      title: 'Upcoming Shift Reminder',
      message: `Your shift (${shift.name}) is scheduled to start at ${shift.start_time}. Don't forget to check in on time!`,
      link: '/attendance'
    });

    remindedCount++;
  }

  return remindedCount;
}

/**
 * Runner caller for checkin_reminder
 */
async function checkinReminderJob(options = {}) {
  const targetDate = options.date || getKarachiDate();
  return await runJob({
    jobName: 'checkin_reminder',
    runKey: `checkin_reminder:${targetDate}:${getKarachiTime().slice(0, 2)}`, // Hourly bucket or date
    jobFn: executeCheckinReminder,
    force: Boolean(options.force),
    context: { ...options, date: targetDate }
  });
}

module.exports = {
  checkinReminderJob,
  executeCheckinReminder,
  isWithinReminderWindow
};
