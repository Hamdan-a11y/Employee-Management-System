const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../services/auditLogger');
const { JOBS_REGISTRY, getKarachiDate } = require('../jobs');

// Middleware: Authenticate and enforce Admin-only access
router.use(authenticateToken);

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin privileges are required to manage background jobs.' });
  }
  next();
};

router.use(requireAdmin);

/**
 * GET /api/jobs/definitions
 * Returns registered jobs metadata
 */
router.get('/definitions', (req, res) => {
  const definitions = [
    {
      name: 'mark_absent',
      label: 'Mark Absent',
      schedule: 'Every 30 minutes',
      description: 'Marks employees with no check-in as absent after shift ends (skips holidays, weekends, approved leaves).'
    },
    {
      name: 'missing_checkout',
      label: 'Missing Check-out Detection',
      schedule: 'Hourly at :15',
      description: 'Detects check-ins with no check-out past shift end + buffer, flags the record, and notifies employee & manager.'
    },
    {
      name: 'checkin_reminder',
      label: 'Check-in Reminder',
      schedule: 'Every 15 minutes',
      description: 'Notifies employees 30-45 minutes before scheduled shift start if not yet checked in.'
    },
    {
      name: 'daily_summary',
      label: 'Daily Department Summary',
      schedule: 'Nightly at 23:50',
      description: 'Aggregates present, absent, late, and on-leave counts per department and saves to daily_summaries.'
    },
    {
      name: 'monthly_report',
      label: 'Monthly Attendance Report',
      schedule: '1st of month at 01:00 AM',
      description: "Generates prior month's summary metrics per employee (never overwrites a closed month)."
    },
    {
      name: 'cleanup',
      label: 'Log Cleanup',
      schedule: 'Daily at 02:00 AM',
      description: 'Prunes job execution history older than 90 days from job_runs.'
    }
  ];

  res.json({ jobs: definitions });
});

/**
 * GET /api/jobs/runs
 * List paginated job execution logs with filters
 */
router.get('/runs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      job_name,
      status,
      date
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let sql = `
      SELECT 
        id, 
        job_name, 
        run_key, 
        status, 
        attempts, 
        error, 
        started_at, 
        finished_at, 
        processed_count,
        TIMESTAMPDIFF(SECOND, started_at, finished_at) AS duration_seconds
      FROM job_runs
      WHERE 1=1
    `;
    const params = [];

    if (job_name && job_name !== 'all') {
      sql += ' AND job_name = ?';
      params.push(job_name);
    }

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status.toLowerCase());
    }

    if (date) {
      sql += ' AND (run_key LIKE ? OR started_at LIKE ?)';
      params.push(`%${date}%`, `${date}%`);
    }

    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS counted`;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(sql, params);

    res.json({
      runs: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve job runs.', error: err.message });
  }
});

/**
 * POST /api/jobs/run-now
 * Triggers a registered job immediately using the idempotent runner.
 * Supports optional force flag; logs in audit log.
 */
router.post('/run-now', async (req, res) => {
  try {
    const { job_name, date, force = false } = req.body;

    if (!job_name || !JOBS_REGISTRY[job_name]) {
      return res.status(400).json({
        message: `Invalid job_name. Available jobs: ${Object.keys(JOBS_REGISTRY).join(', ')}`
      });
    }

    const targetDate = date || getKarachiDate();

    // Log action to audit log
    await logAudit({
      req,
      action: force ? 'FORCE_RUN' : 'TRIGGER',
      entityType: 'JOB_RUN',
      details: `Admin triggered background job '${job_name}' for date '${targetDate}' (force: ${Boolean(force)})`
    }).catch(() => {});

    // Execute job through its runner
    const jobFunction = JOBS_REGISTRY[job_name];
    const result = await jobFunction({ date: targetDate, force: Boolean(force), ignoreWindow: true });

    res.json({
      message: result.skipped
        ? `Job '${job_name}' skipped: ${result.reason}`
        : result.success
        ? `Job '${job_name}' executed successfully.`
        : `Job '${job_name}' execution completed with status: failed.`,
      result
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to execute job run.', error: err.message });
  }
});

module.exports = router;
