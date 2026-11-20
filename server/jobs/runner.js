const pool = require('../db');
const { notifyAdmins } = require('../services/notificationService');

/**
 * Timezone: Asia/Karachi helpers
 */
function getKarachiDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d); // YYYY-MM-DD
}

function getKarachiTime(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d); // HH:mm:ss
}

function getKarachiDateTime(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return `${getKarachiDate(d)} ${getKarachiTime(d)}`;
}

/**
 * Builds standard run key
 */
function buildRunKey(jobName, dateOrKey = null) {
  const suffix = dateOrKey ? String(dateOrKey) : getKarachiDate();
  return `${jobName}:${suffix}`;
}

/**
 * Sleep helper for retries
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic Idempotent Job Runner Wrapper
 * 
 * Rules:
 * - Builds a run_key (e.g. "mark_absent:2026-11-20")
 * - Skips if a run with that key already succeeded or is running (no duplicate processing)
 * - Logs start, success, and failure to job_runs
 * - On failure, retries up to 3 times with increasing delay, then marks failed and notifies Admin
 * - All jobs use timezone Asia/Karachi
 */
async function runJob({
  jobName,
  runKey = null,
  jobFn,
  force = false,
  maxAttempts = 3,
  retryDelayMs = 200,
  context = {}
}) {
  const finalRunKey = runKey || buildRunKey(jobName, context.date);

  // 1. Check existing job run
  const [existingRows] = await pool.query(
    'SELECT * FROM job_runs WHERE job_name = ? AND run_key = ?',
    [jobName, finalRunKey]
  );

  let jobRunId = null;
  let previousAttempts = 0;

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    jobRunId = existing.id;
    previousAttempts = existing.attempts || 0;

    // Check if already succeeded or running (unless forced)
    if (!force) {
      if (existing.status === 'success') {
        return {
          skipped: true,
          reason: 'Job run already completed successfully.',
          runKey: finalRunKey,
          status: 'success',
          jobRunId: existing.id,
          processedCount: existing.processed_count
        };
      }
      if (existing.status === 'running') {
        return {
          skipped: true,
          reason: 'Job run is currently in progress.',
          runKey: finalRunKey,
          status: 'running',
          jobRunId: existing.id
        };
      }
    }

    // Mark as running for retry or force
    await pool.query(
      `UPDATE job_runs 
       SET status = 'running', attempts = attempts + 1, error = NULL, started_at = NOW(), finished_at = NULL 
       WHERE id = ?`,
      [jobRunId]
    );
  } else {
    // Insert new running record
    const [ins] = await pool.query(
      `INSERT INTO job_runs (job_name, run_key, status, attempts, started_at, processed_count)
       VALUES (?, ?, 'running', 1, NOW(), 0)`,
      [jobName, finalRunKey]
    );
    jobRunId = ins.insertId;
  }

  // 2. Execute with retries
  let lastError = null;
  let currentAttempt = 1;

  while (currentAttempt <= maxAttempts) {
    try {
      const processedCount = await jobFn({
        ...context,
        jobName,
        runKey: finalRunKey,
        jobRunId,
        attempt: currentAttempt,
        karachiDate: getKarachiDate(),
        karachiTime: getKarachiTime()
      });

      const count = typeof processedCount === 'number' ? processedCount : 0;

      // Mark success
      await pool.query(
        `UPDATE job_runs 
         SET status = 'success', finished_at = NOW(), processed_count = ?, error = NULL 
         WHERE id = ?`,
        [count, jobRunId]
      );

      return {
        success: true,
        skipped: false,
        runKey: finalRunKey,
        jobRunId,
        attempts: currentAttempt,
        processedCount: count
      };
    } catch (err) {
      lastError = err;
      console.error(`[JobRunner] Error in ${jobName} (attempt ${currentAttempt}/${maxAttempts}):`, err.message);

      if (currentAttempt < maxAttempts) {
        // Wait with increasing delay before retrying
        const delay = retryDelayMs * currentAttempt;
        await sleep(delay);
        currentAttempt++;
        await pool.query(
          'UPDATE job_runs SET attempts = ?, error = ? WHERE id = ?',
          [currentAttempt, `Attempt ${currentAttempt - 1} failed: ${err.message}`, jobRunId]
        );
      } else {
        break;
      }
    }
  }

  // 3. Mark failed after exhausting all attempts
  const errorMsg = lastError ? lastError.message : 'Unknown execution failure';
  await pool.query(
    `UPDATE job_runs 
     SET status = 'failed', finished_at = NOW(), error = ? 
     WHERE id = ?`,
    [errorMsg, jobRunId]
  );

  // Notify Admins
  try {
    await notifyAdmins({
      type: 'system',
      title: `Automated Job Failed: ${jobName}`,
      message: `The background job '${jobName}' (${finalRunKey}) failed after ${maxAttempts} attempts. Error: ${errorMsg}`
    });
  } catch (notifyErr) {
    console.error('[JobRunner] Failed to notify admin of job failure:', notifyErr.message);
  }

  if (context.throwOnError) {
    throw lastError;
  }

  return {
    success: false,
    skipped: false,
    runKey: finalRunKey,
    jobRunId,
    attempts: currentAttempt,
    error: errorMsg
  };
}

module.exports = {
  runJob,
  buildRunKey,
  getKarachiDate,
  getKarachiTime,
  getKarachiDateTime,
  sleep
};
