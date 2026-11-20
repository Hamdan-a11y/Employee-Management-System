const pool = require('../db');

/**
 * Migration for Attendance Locking & Monthly Closing.
 * Creates:
 * 1. attendance_periods
 * 2. period_history
 * 3. payroll_attendance_summary
 * 4. Safety net database triggers on attendance table
 */
async function runMonthlyClosingMigration() {
  const conn = await pool.getConnection();
  try {
    console.log('[Migration] Starting Attendance Locking & Monthly Closing migration...');

    // 1. attendance_periods
    await conn.query(`
      CREATE TABLE IF NOT EXISTS attendance_periods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL UNIQUE,
        status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
        closed_by INT NULL,
        closed_at DATETIME NULL,
        summary_generated_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_att_periods_month (month),
        INDEX idx_att_periods_status (status)
      ) ENGINE=InnoDB;
    `);
    console.log('[Migration] Table attendance_periods ensured.');

    // 2. period_history
    await conn.query(`
      CREATE TABLE IF NOT EXISTS period_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        action ENUM('closed', 'reopened', 'override_close') NOT NULL,
        user_id INT NOT NULL,
        reason TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_period_history_month (month)
      ) ENGINE=InnoDB;
    `);
    console.log('[Migration] Table period_history ensured.');

    // 3. payroll_attendance_summary
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_attendance_summary (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        employee_id INT NOT NULL,
        working_days DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        present_days DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        absent_days DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        leave_days_paid DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        leave_days_unpaid DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        holiday_days DECIMAL(5,1) NOT NULL DEFAULT 0.0,
        late_count INT NOT NULL DEFAULT 0,
        late_minutes INT NOT NULL DEFAULT 0,
        approved_overtime_regular_minutes INT NOT NULL DEFAULT 0,
        approved_overtime_weekend_minutes INT NOT NULL DEFAULT 0,
        approved_overtime_holiday_minutes INT NOT NULL DEFAULT 0,
        approved_overtime_minutes INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_period_emp (month, employee_id),
        INDEX idx_summary_month (month),
        INDEX idx_summary_emp (employee_id)
      ) ENGINE=InnoDB;
    `);
    console.log('[Migration] Table payroll_attendance_summary ensured.');

    // 4. Database triggers on attendance as safety net
    try {
      await conn.query('DROP TRIGGER IF EXISTS trg_attendance_before_insert;');
      await conn.query(`
        CREATE TRIGGER trg_attendance_before_insert BEFORE INSERT ON attendance
        FOR EACH ROW
        BEGIN
          DECLARE p_status VARCHAR(10);
          SELECT status INTO p_status FROM attendance_periods WHERE month = DATE_FORMAT(NEW.date, '%Y-%m') LIMIT 1;
          IF p_status = 'closed' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Month is closed: attendance changes blocked by trigger';
          END IF;
        END;
      `);
      console.log('[Migration] Trigger trg_attendance_before_insert ensured.');

      await conn.query('DROP TRIGGER IF EXISTS trg_attendance_before_update;');
      await conn.query(`
        CREATE TRIGGER trg_attendance_before_update BEFORE UPDATE ON attendance
        FOR EACH ROW
        BEGIN
          DECLARE p_status VARCHAR(10);
          SELECT status INTO p_status FROM attendance_periods WHERE month = DATE_FORMAT(NEW.date, '%Y-%m') LIMIT 1;
          IF p_status = 'closed' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Month is closed: attendance changes blocked by trigger';
          END IF;
        END;
      `);
      console.log('[Migration] Trigger trg_attendance_before_update ensured.');

      await conn.query('DROP TRIGGER IF EXISTS trg_attendance_before_delete;');
      await conn.query(`
        CREATE TRIGGER trg_attendance_before_delete BEFORE DELETE ON attendance
        FOR EACH ROW
        BEGIN
          DECLARE p_status VARCHAR(10);
          SELECT status INTO p_status FROM attendance_periods WHERE month = DATE_FORMAT(OLD.date, '%Y-%m') LIMIT 1;
          IF p_status = 'closed' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Month is closed: attendance changes blocked by trigger';
          END IF;
        END;
      `);
      console.log('[Migration] Trigger trg_attendance_before_delete ensured.');
    } catch (trigErr) {
      console.warn('[Migration Warning] Triggers creation warning:', trigErr.message);
    }

    console.log('[Migration] Attendance Locking & Monthly Closing migration completed.');
  } catch (err) {
    console.error('[Migration Error]:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  runMonthlyClosingMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMonthlyClosingMigration };
