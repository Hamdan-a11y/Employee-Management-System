const pool = require('../db');
const { getKarachiDate, runJob } = require('./runner');

/**
 * Core cleanup execution
 * Deletes job_runs older than 90 days.
 */
async function executeCleanup(context = {}) {
  const daysToKeep = Number(context.daysToKeep) || 90;
  const ipRetentionDays = Number(context.ipRetentionDays) || 180;

  const [result] = await pool.query(
    'DELETE FROM job_runs WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [daysToKeep]
  );

  // Delete IP data after 180 days across tracking tables
  await pool.query(
    'UPDATE refresh_tokens SET ip = NULL WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND ip IS NOT NULL',
    [ipRetentionDays]
  );
  await pool.query(
    'UPDATE security_events SET ip = NULL WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND ip IS NOT NULL',
    [ipRetentionDays]
  );
  await pool.query(
    'UPDATE audit_logs SET ip_address = NULL WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND ip_address IS NOT NULL',
    [ipRetentionDays]
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
