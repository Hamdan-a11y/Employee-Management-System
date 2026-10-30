const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migrateLeaves() {
  console.log('[Migration] Starting Leave Management schema migration...');
  const conn = await pool.getConnection();

  try {
    // 1. Create leave_balances table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        year INT NOT NULL,
        annual_total INT NOT NULL DEFAULT 15,
        annual_used INT NOT NULL DEFAULT 0,
        sick_total INT NOT NULL DEFAULT 10,
        sick_used INT NOT NULL DEFAULT 0,
        casual_total INT NOT NULL DEFAULT 5,
        casual_used INT NOT NULL DEFAULT 0,
        maternity_total INT NOT NULL DEFAULT 90,
        maternity_used INT NOT NULL DEFAULT 0,
        paternity_total INT NOT NULL DEFAULT 10,
        paternity_used INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_emp_year (employee_id, year),
        CONSTRAINT fk_leave_balances_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration] Table `leave_balances` verified/created.');

    // 2. Create leave_requests table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        leave_type ENUM('Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid') NOT NULL DEFAULT 'Annual',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_count INT NOT NULL DEFAULT 1,
        reason TEXT NOT NULL,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        rejection_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_emp_status (employee_id, status),
        INDEX idx_dates (start_date, end_date),
        CONSTRAINT fk_leave_requests_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        CONSTRAINT fk_leave_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration] Table `leave_requests` verified/created.');

    // 3. Populate default leave balances for current year for all existing active employees
    const currentYear = new Date().getFullYear();
    const [employees] = await conn.query('SELECT id FROM employees WHERE status = "Active"');

    for (const emp of employees) {
      await conn.query(`
        INSERT IGNORE INTO leave_balances (employee_id, year, annual_total, annual_used, sick_total, sick_used, casual_total, casual_used)
        VALUES (?, ?, 15, 0, 10, 0, 5, 0)
      `, [emp.id, currentYear]);
    }
    console.log(`[Migration] Initialized default leave balances for ${employees.length} active employees for year ${currentYear}.`);

    console.log('[Migration] Leave Management schema migration completed successfully.');
  } catch (err) {
    console.error('[Migration] Migration error:', err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrateLeaves()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
