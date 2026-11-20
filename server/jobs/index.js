const { runJob, buildRunKey, getKarachiDate, getKarachiTime, getKarachiDateTime } = require('./runner');
const { markAbsentJob, executeMarkAbsent } = require('./markAbsent');
const { missingCheckoutJob, executeMissingCheckout } = require('./missingCheckout');
const { checkinReminderJob, executeCheckinReminder } = require('./checkinReminder');
const { dailySummaryJob, executeDailySummary } = require('./dailySummary');
const { monthlyReportJob, executeMonthlyReport } = require('./monthlyReport');
const { cleanupJob, executeCleanup } = require('./cleanup');
const { initializeScheduler, catchUpOnStartup } = require('./scheduler');

// Map of all registered jobs by name
const JOBS_REGISTRY = {
  mark_absent: markAbsentJob,
  missing_checkout: missingCheckoutJob,
  checkin_reminder: checkinReminderJob,
  daily_summary: dailySummaryJob,
  monthly_report: monthlyReportJob,
  cleanup: cleanupJob
};

module.exports = {
  runJob,
  buildRunKey,
  getKarachiDate,
  getKarachiTime,
  getKarachiDateTime,
  markAbsentJob,
  missingCheckoutJob,
  checkinReminderJob,
  dailySummaryJob,
  monthlyReportJob,
  cleanupJob,
  initializeScheduler,
  catchUpOnStartup,
  JOBS_REGISTRY
};
