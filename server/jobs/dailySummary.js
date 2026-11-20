const pool = require('../db');
const { getKarachiDate, runJob } = require('./runner');

/**
 * Core daily_summary execution
 */
async function executeDailySummary(context = {}) {
  const targetDate = context.date || getKarachiDate();

  // 1. Fetch all active departments
  const [departments] = await pool.query('SELECT id, name FROM departments');

  let processedDepts = 0;

  // Process department-level counts and company total (deptId = null)
  const targets = [{ id: null, name: 'Company Overall' }, ...departments];

  for (const dept of targets) {
    const deptId = dept.id;

    // Attendance stats query
    let attSql = `
      SELECT 
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN (a.is_late = 1 OR a.late_minutes > 0) THEN 1 ELSE 0 END) AS late_count
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date = ? AND e.status = 'Active'
    `;
    const attParams = [targetDate];

    if (deptId !== null) {
      attSql += ' AND e.department_id = ?';
      attParams.push(deptId);
    }

    const [attRows] = await pool.query(attSql, attParams);
    const presentCount = Number(attRows[0]?.present_count) || 0;
    const absentCount = Number(attRows[0]?.absent_count) || 0;
    const lateCount = Number(attRows[0]?.late_count) || 0;

    // Leave stats query (Approved leaves covering targetDate)
    let leaveSql = `
      SELECT COUNT(DISTINCT lr.employee_id) AS on_leave_count
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.status = 'APPROVED'
        AND ? BETWEEN lr.start_date AND lr.end_date
        AND e.status = 'Active'
    `;
    const leaveParams = [targetDate];

    if (deptId !== null) {
      leaveSql += ' AND e.department_id = ?';
      leaveParams.push(deptId);
    }

    const [leaveRows] = await pool.query(leaveSql, leaveParams);
    const onLeaveCount = Number(leaveRows[0]?.on_leave_count) || 0;

    // Upsert into daily_summaries
    await pool.query(
      `INSERT INTO daily_summaries (
        department_id,
        date,
        present_count,
        absent_count,
        late_count,
        on_leave_count
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        present_count = VALUES(present_count),
        absent_count = VALUES(absent_count),
        late_count = VALUES(late_count),
        on_leave_count = VALUES(on_leave_count),
        updated_at = NOW()`,
      [deptId, targetDate, presentCount, absentCount, lateCount, onLeaveCount]
    );

    processedDepts++;
  }

  return processedDepts;
}

/**
 * Runner caller for daily_summary
 */
async function dailySummaryJob(options = {}) {
  const targetDate = options.date || getKarachiDate();
  return await runJob({
    jobName: 'daily_summary',
    runKey: `daily_summary:${targetDate}`,
    jobFn: executeDailySummary,
    force: Boolean(options.force),
    context: { ...options, date: targetDate }
  });
}

module.exports = {
  dailySummaryJob,
  executeDailySummary
};
