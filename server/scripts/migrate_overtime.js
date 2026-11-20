const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrateOvertime() {
  console.log('Connecting to database for Overtime Management migration...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    database: process.env.DB_NAME || 'employee_db',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });

  try {
    console.log('Creating overtime_policies table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS overtime_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NULL,
        threshold_minutes INT NOT NULL DEFAULT 15,
        rounding_minutes INT NOT NULL DEFAULT 15,
        regular_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
        weekend_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 2.00,
        holiday_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 2.50,
        daily_cap_hours DECIMAL(4, 2) NOT NULL DEFAULT 4.00,
        monthly_cap_hours DECIMAL(5, 2) NOT NULL DEFAULT 40.00,
        approval_required BOOLEAN NOT NULL DEFAULT TRUE,
        effective_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_policy_dept_eff (department_id, effective_date),
        INDEX idx_policy_eff (effective_date),
        CONSTRAINT fk_ot_policy_department FOREIGN KEY (department_id) 
          REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating overtime_requests table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS overtime_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        work_date DATE NOT NULL,
        minutes INT NOT NULL DEFAULT 0,
        day_type ENUM('regular', 'weekend', 'holiday') NOT NULL,
        multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        over_cap BOOLEAN NOT NULL DEFAULT FALSE,
        reviewer_id INT NULL,
        comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_emp_work_date (employee_id, work_date),
        INDEX idx_ot_req_date (work_date),
        INDEX idx_ot_req_status (status),
        CONSTRAINT fk_ot_req_employee FOREIGN KEY (employee_id) 
          REFERENCES employees(id) ON DELETE CASCADE,
        CONSTRAINT fk_ot_req_reviewer FOREIGN KEY (reviewer_id) 
          REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default company policy if none exists
    const [existingPolicies] = await conn.query(
      'SELECT id FROM overtime_policies WHERE department_id IS NULL LIMIT 1'
    );
    if (existingPolicies.length === 0) {
      console.log('Seeding default company overtime policy...');
      await conn.query(`
        INSERT INTO overtime_policies (
          department_id,
          threshold_minutes,
          rounding_minutes,
          regular_multiplier,
          weekend_multiplier,
          holiday_multiplier,
          daily_cap_hours,
          monthly_cap_hours,
          approval_required,
          effective_date
        ) VALUES (
          NULL,
          15,
          15,
          1.50,
          2.00,
          2.50,
          4.00,
          40.00,
          FALSE,
          '2020-01-01'
        );
      `);
      console.log('Default company overtime policy seeded successfully.');
    } else {
      console.log('Company overtime policy already exists.');
    }

    console.log('Overtime migration completed successfully.');
  } catch (err) {
    console.error('Overtime migration failed:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrateOvertime()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrateOvertime;
