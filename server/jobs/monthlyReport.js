const pool = require('../db');
const { isMonthLocked } = require('../services/calendarService');
const { getKarachiDate, runJob } = require('./runner');
const { assertPeriodOpen } = require('../services/periodService');

/**
 * Calculates prior month string ('YYYY-MM') from Karachi date
 */
function getPreviousMonthString(karachiDate = getKarachiDate()) {
  const [y, m] = karachiDate.split('-').map(Number);
  const prevMonthDate = new Date(Date.UTC(y, m - 2, 1));
  const prevY = prevMonthDate.getUTCFullYear();
  const prevM = String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0');
  return `${prevY}-${prevM}`;
}

/**
 * Core monthly_report execution
 */
async function executeMonthlyReport(context = {}) {
  const targetMonth = context.month || getPreviousMonthString(context.date || getKarachiDate());

  // Rule: Never overwrite or generate for a closed / locked month
  await assertPeriodOpen(`${targetMonth}-01`);

  const isLocked = await isMonthLocked(`${targetMonth}-01`);
  if (isLocked) {
    console.log(`[monthly_report] Month ${targetMonth} is closed/locked. Skipping generation.`);
    return 0;
  }

  // Fetch active employees
  const [employees] = await pool.query(
    "SELECT id, name, department_id FROM employees WHERE status = 'Active'"
  );

  let processedEmployees = 0;

  for (const emp of employees) {
    // 1. Query attendance totals
    const [attRows] = await pool.query(
      `SELECT 
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN (is_late = 1 OR late_minutes > 0) THEN 1 ELSE 0 END) AS late_days,
        SUM(total_hours) AS total_hours
       FROM attendance
       WHERE employee_id = ? AND date LIKE ?`,
      [emp.id, `${targetMonth}%`]
    );

    // 2. Query approved overtime
    const [otRows] = await pool.query(
      `SELECT SUM(minutes) AS ot_minutes
       FROM overtime_requests
       WHERE employee_id = ? AND work_date LIKE ? AND status = 'approved'`,
      [emp.id, `${targetMonth}%`]
    );

    processedEmployees++;
  }

  return processedEmployees;
}

/**
 * Runner caller for monthly_report
 */
async function monthlyReportJob(options = {}) {
  const targetMonth = options.month || getPreviousMonthString(options.date || getKarachiDate());
  return await runJob({
    jobName: 'monthly_report',
    runKey: `monthly_report:${targetMonth}`,
    jobFn: executeMonthlyReport,
    force: Boolean(options.force),
    context: { ...options, month: targetMonth }
  });
}

module.exports = {
  monthlyReportJob,
  executeMonthlyReport,
  getPreviousMonthString
};
