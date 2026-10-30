const pool = require('./db');

async function migrateAttendance() {
  console.log('[Migration] Creating attendance and attendance_corrections tables...');

  const createAttendanceTable = `
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      date DATE NOT NULL,
      check_in DATETIME NOT NULL,
      check_out DATETIME NULL,
      total_hours DECIMAL(5, 2) DEFAULT 0.00,
      is_late BOOLEAN NOT NULL DEFAULT FALSE,
      late_minutes INT NOT NULL DEFAULT 0,
      status ENUM('Present', 'Half Day', 'Late', 'Absent') DEFAULT 'Present',
      is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE KEY unique_emp_attendance_date (employee_id, date),
      INDEX idx_attendance_date (date),
      INDEX idx_attendance_emp_date (employee_id, date),
      INDEX idx_attendance_status (status)
    );
  `;

  const createCorrectionsTable = `
    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      attendance_id INT NULL,
      employee_id INT NOT NULL,
      date DATE NOT NULL,
      requested_check_in DATETIME NOT NULL,
      requested_check_out DATETIME NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      rejection_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_corr_emp (employee_id),
      INDEX idx_corr_status (status),
      INDEX idx_corr_date (date)
    );
  `;

  try {
    await pool.query(createAttendanceTable);
    console.log('[Migration] Table `attendance` created or verified successfully.');

    await pool.query(createCorrectionsTable);
    console.log('[Migration] Table `attendance_corrections` created or verified successfully.');

    console.log('[Migration] Attendance migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('[Migration Error] Failed to create attendance tables:', err);
    process.exit(1);
  }
}

migrateAttendance();

