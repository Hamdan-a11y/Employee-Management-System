const pool = require('../db');
const { getKarachiDate, runJob } = require('./runner');

/**
 * Core cleanup execution
 * Deletes job_runs older than 90 days.
 */
async function executeCleanup(context = {}) {
  const daysToKeep = Number(context.daysToKeep) || 90;

  const [result] = await pool.query(
    'DELETE FROM job_runs WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [daysToKeep]
  );

  return result.affectedRows || 0;
}

/**
 * Runner caller for cleanup
 */
async function cleanupJob(options = {}) {
  const targetDate = options.date || getKarachiDate();
  return await runJob({
    jobName: 'cleanup',
    runKey: `cleanup:${targetDate}`,
    jobFn: executeCleanup,
    force: Boolean(options.force),
    context: { ...options, date: targetDate }
  });
}

module.exports = {
  cleanupJob,
  executeCleanup
};
