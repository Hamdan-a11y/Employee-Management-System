const cron = require('node-cron');
const { getKarachiDate } = require('./runner');
const { markAbsentJob } = require('./markAbsent');
const { missingCheckoutJob } = require('./missingCheckout');
const { checkinReminderJob } = require('./checkinReminder');
const { dailySummaryJob } = require('./dailySummary');
const { monthlyReportJob } = require('./monthlyReport');
const { cleanupJob } = require('./cleanup');

const TIMEZONE = 'Asia/Karachi';

/**
 * Calculates yesterday's date string in Asia/Karachi
 */
function getYesterdayKarachiDate(karachiDate = getKarachiDate()) {
  const [y, m, d] = karachiDate.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
  return yesterday.toISOString().split('T')[0];
}

/**
 * Startup Catch-up mechanism:
 * Runs once on server boot. If scheduled jobs for yesterday or today were missed
 * because the server was stopped/rebooting, executes them once idempotently.
 */
async function catchUpOnStartup() {
  console.log('[Scheduler] Running startup catch-up check for missed background jobs...');
  const today = getKarachiDate();
  const yesterday = getYesterdayKarachiDate(today);

  try {
    // 1. Catch up mark_absent for yesterday
    const maRes = await markAbsentJob({ date: yesterday });
    if (!maRes.skipped) {
      console.log(`[Scheduler] Catch-up completed mark_absent for ${yesterday}:`, maRes.processedCount, 'marked.');
    }

    // 2. Catch up missing_checkout for yesterday
    const mcRes = await missingCheckoutJob({ date: yesterday });
    if (!mcRes.skipped) {
      console.log(`[Scheduler] Catch-up completed missing_checkout for ${yesterday}:`, mcRes.processedCount, 'flagged.');
    }

    // 3. Catch up daily_summary for yesterday
    const dsRes = await dailySummaryJob({ date: yesterday });
    if (!dsRes.skipped) {
      console.log(`[Scheduler] Catch-up completed daily_summary for ${yesterday}:`, dsRes.processedCount, 'summaries.');
    }

    // 4. Catch up cleanup for today
    await cleanupJob({ date: today });

    // 5. Catch up monthly report if today is past the 1st and previous month was not run
    await monthlyReportJob();

    console.log('[Scheduler] Startup catch-up check completed.');
  } catch (err) {
    console.error('[Scheduler] Error during startup catch-up:', err.message);
  }
}

/**
 * Initializes all automated cron schedules in Asia/Karachi timezone
 */
function initializeScheduler() {
  console.log(`[Scheduler] Initializing node-cron automated background jobs in timezone: ${TIMEZONE}`);

  // 1. mark_absent: every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await markAbsentJob();
    } catch (err) {
      console.error('[Cron] mark_absent trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 2. missing_checkout: hourly at minute 15
  cron.schedule('15 * * * *', async () => {
    try {
      await missingCheckoutJob();
    } catch (err) {
      console.error('[Cron] missing_checkout trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 3. checkin_reminder: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await checkinReminderJob();
    } catch (err) {
      console.error('[Cron] checkin_reminder trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 4. daily_summary: every night at 23:50
  cron.schedule('50 23 * * *', async () => {
    try {
      await dailySummaryJob();
    } catch (err) {
      console.error('[Cron] daily_summary trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 5. monthly_report: 1st day of month at 01:00 AM
  cron.schedule('0 1 1 * *', async () => {
    try {
      await monthlyReportJob();
    } catch (err) {
      console.error('[Cron] monthly_report trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // 6. cleanup: daily at 02:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      await cleanupJob();
    } catch (err) {
      console.error('[Cron] cleanup trigger failed:', err.message);
    }
  }, { timezone: TIMEZONE });

  // Run catch-up on server boot
  catchUpOnStartup().catch((err) => {
    console.error('[Scheduler] Catch-up error on startup:', err);
  });
}

module.exports = {
  initializeScheduler,
  catchUpOnStartup,
  getYesterdayKarachiDate
};
