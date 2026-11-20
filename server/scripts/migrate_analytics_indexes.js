const pool = require('../db');

/**
 * Migration to add high-performance composite indexes for Advanced Attendance Analytics.
 * Idempotently checks if index exists before adding.
 */
async function runAnalyticsIndexesMigration() {
  const conn = await pool.getConnection();
  try {
    console.log('[Migration] Starting analytics indexes migration...');

    const indexesToAdd = [
      {
        table: 'attendance',
        indexName: 'idx_att_date_status',
        columns: '(date, status)',
      },
      {
        table: 'attendance',
        indexName: 'idx_att_date_is_late',
        columns: '(date, is_late)',
      },
      {
        table: 'attendance',
        indexName: 'idx_att_emp_date_status',
        columns: '(employee_id, date, status)',
      },
      {
        table: 'overtime_requests',
        indexName: 'idx_ot_status_workdate',
        columns: '(status, work_date, day_type)',
      },
      {
        table: 'employees',
        indexName: 'idx_emp_department',
        columns: '(department_id)',
      },
      {
        table: 'daily_summaries',
        indexName: 'idx_daily_summary_dept_date',
        columns: '(department_id, date)',
      },
    ];

    for (const item of indexesToAdd) {
      const [existing] = await conn.query(
        `SHOW INDEX FROM \`${item.table}\` WHERE Key_name = ?`,
        [item.indexName]
      );

      if (existing.length === 0) {
        console.log(`[Migration] Adding index ${item.indexName} on ${item.table}...`);
        await conn.query(
          `ALTER TABLE \`${item.table}\` ADD INDEX \`${item.indexName}\` ${item.columns}`
        );
        console.log(`[Migration] Index ${item.indexName} added successfully.`);
      } else {
        console.log(`[Migration] Index ${item.indexName} already exists on ${item.table}. Skipping.`);
      }
    }

    console.log('[Migration] Analytics indexes migration completed successfully.');
  } catch (err) {
    console.error('[Migration Error]:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  runAnalyticsIndexesMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runAnalyticsIndexesMigration };
