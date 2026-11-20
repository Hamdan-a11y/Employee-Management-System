const pool = require('../db');

async function migrateJobs() {
  console.log('--- Migrating Background Jobs & Summaries Tables ---');

  // 1. Table job_runs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_name VARCHAR(100) NOT NULL,
      run_key VARCHAR(255) NOT NULL,
      status ENUM('running', 'success', 'failed') NOT NULL DEFAULT 'running',
      attempts INT NOT NULL DEFAULT 1,
      error TEXT NULL,
      started_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      processed_count INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_job_run_key (job_name, run_key),
      INDEX idx_job_runs_status (status),
      INDEX idx_job_runs_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Created or verified table: job_runs');

  // 2. Table daily_summaries
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department_id INT NULL,
      date DATE NOT NULL,
      present_count INT NOT NULL DEFAULT 0,
      absent_count INT NOT NULL DEFAULT 0,
      late_count INT NOT NULL DEFAULT 0,
      on_leave_count INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_dept_date (department_id, date),
      INDEX idx_daily_summaries_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('Created or verified table: daily_summaries');

  // 3. Add is_missing_checkout column to attendance if not exists, and allow check_in to be NULL for absent records
  await pool.query('ALTER TABLE attendance MODIFY COLUMN check_in DATETIME NULL');
  console.log('Modified attendance.check_in to allow NULL for absent records');

  const [cols] = await pool.query("SHOW COLUMNS FROM attendance LIKE 'is_missing_checkout'");
  if (cols.length === 0) {
    await pool.query(`
      ALTER TABLE attendance 
      ADD COLUMN is_missing_checkout TINYINT(1) NOT NULL DEFAULT 0 AFTER suspicious_reason
    `);
    console.log('Added column is_missing_checkout to table attendance');
  } else {
    console.log('Column is_missing_checkout already exists on attendance');
  }

  console.log('--- Jobs Migration Completed Successfully ---');
}

if (require.main === module) {
  migrateJobs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrateJobs;
