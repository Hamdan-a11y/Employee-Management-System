const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migratePayroll() {
  console.log('--- Starting Payroll Migration ---');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Holidays table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date DATE NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_holidays_date (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed some national holidays for 2026 if not exist
    const sampleHolidays = [
      ['Kashmir Solidarity Day', '2026-02-05'],
      ['Pakistan Day', '2026-03-23'],
      ['Labour Day', '2026-05-01'],
      ['Independence Day', '2026-08-14'],
      ['Iqbal Day', '2026-11-09'],
      ['Quaid-e-Azam Day', '2026-12-25'],
    ];

    for (const [name, date] of sampleHolidays) {
      await conn.query(
        'INSERT IGNORE INTO holidays (name, date) VALUES (?, ?)',
        [name, date]
      );
    }

    // 2. Payroll Settings table (configurable late threshold, overtime multiplier, standard hours)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        id INT PRIMARY KEY DEFAULT 1,
        late_arrival_threshold INT NOT NULL DEFAULT 3,
        late_deduction_days DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
        overtime_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
        standard_daily_hours DECIMAL(4, 2) NOT NULL DEFAULT 8.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      INSERT IGNORE INTO payroll_settings (id, late_arrival_threshold, late_deduction_days, overtime_multiplier, standard_daily_hours, currency)
      VALUES (1, 3, 1.00, 1.50, 8.00, 'PKR');
    `);

    // 3. Employee Salaries table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS employee_salaries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL UNIQUE,
        basic_salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        allowances DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        fixed_deductions DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        effective_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        INDEX idx_sal_eff_date (effective_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Payroll Runs table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        month VARCHAR(7) NOT NULL UNIQUE,
        status ENUM('Draft', 'Approved', 'Locked') NOT NULL DEFAULT 'Draft',
        working_days INT NOT NULL DEFAULT 0,
        total_employees INT NOT NULL DEFAULT 0,
        total_gross DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        total_deductions DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        total_net DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        warnings_count INT NOT NULL DEFAULT 0,
        warnings_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        warnings_acknowledged_by INT NULL,
        warnings_acknowledged_at DATETIME NULL,
        created_by INT NOT NULL,
        approved_by INT NULL,
        approved_at DATETIME NULL,
        locked_by INT NULL,
        locked_at DATETIME NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (warnings_acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_run_status (status),
        INDEX idx_run_month (month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Payslips table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payslips (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payroll_run_id INT NOT NULL,
        employee_id INT NOT NULL,
        month VARCHAR(7) NOT NULL,
        status ENUM('Draft', 'Approved', 'Locked') NOT NULL DEFAULT 'Draft',
        basic_salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        daily_rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        hourly_rate DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        working_days_in_month INT NOT NULL DEFAULT 0,
        payable_days DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        prorated_basic DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        allowances DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        overtime_hours DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
        overtime_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
        overtime_pay DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        fixed_deductions DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        unpaid_leave_days DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        unpaid_leave_deduction DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        absent_days INT NOT NULL DEFAULT 0,
        absence_deduction DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        late_arrivals_count INT NOT NULL DEFAULT 0,
        late_deduction_days DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        late_deduction_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        adjustments_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        gross_pay DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        total_deductions DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        net_pay DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        warnings JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE KEY unique_run_emp (payroll_run_id, employee_id),
        INDEX idx_payslips_emp_month (employee_id, month),
        INDEX idx_payslips_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Payslip Items table (Line-by-line breakdown)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payslip_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payslip_id INT NOT NULL,
        category ENUM('EARNING', 'DEDUCTION', 'ADJUSTMENT') NOT NULL,
        type VARCHAR(50) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        rate DECIMAL(12, 2) NULL,
        quantity DECIMAL(6, 2) NULL,
        related_entity_type VARCHAR(50) NULL,
        related_entity_ids JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE CASCADE,
        INDEX idx_items_payslip (payslip_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Payroll Adjustments table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payroll_adjustments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        source_month VARCHAR(7) NOT NULL,
        target_payroll_run_id INT NULL,
        type ENUM('ATTENDANCE_CORRECTION', 'LEAVE_CHANGE', 'MANUAL') NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        reason TEXT NOT NULL,
        reference_id INT NULL,
        status ENUM('PENDING', 'APPLIED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        applied_at DATETIME NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (target_payroll_run_id) REFERENCES payroll_runs(id) ON DELETE SET NULL,
        INDEX idx_adj_emp_status (employee_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Add is_locked to attendance table if not exists
    const [attColumns] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'is_locked';
    `);
    if (attColumns.length === 0) {
      await conn.query(`
        ALTER TABLE attendance ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      console.log('Added is_locked column to attendance table.');
    }

    // 9. Add joining_date to employees table if not exists (fallback to DATE(created_at))
    const [empColumns] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'joining_date';
    `);
    if (empColumns.length === 0) {
      await conn.query(`
        ALTER TABLE employees ADD COLUMN joining_date DATE NULL DEFAULT NULL;
      `);
      console.log('Added joining_date column to employees table.');
    }

    // 10. Seed default salaries for existing active employees if none exist
    const [existingSalaries] = await conn.query('SELECT COUNT(*) as count FROM employee_salaries');
    if (existingSalaries[0].count === 0) {
      const [employees] = await conn.query('SELECT id, designation FROM employees WHERE status = "Active" AND deleted_at IS NULL');
      for (const emp of employees) {
        // Base salary tier according to designation
        let basic = 120000;
        let allowances = 15000;
        let fixedDeductions = 5000;

        const des = (emp.designation || '').toLowerCase();
        if (des.includes('architect') || des.includes('lead') || des.includes('vp') || des.includes('head')) {
          basic = 250000;
          allowances = 30000;
          fixedDeductions = 10000;
        } else if (des.includes('senior')) {
          basic = 180000;
          allowances = 20000;
          fixedDeductions = 7000;
        } else if (des.includes('junior') || des.includes('associate')) {
          basic = 75000;
          allowances = 10000;
          fixedDeductions = 3000;
        }

        await conn.query(`
          INSERT IGNORE INTO employee_salaries (employee_id, basic_salary, allowances, fixed_deductions, effective_date)
          VALUES (?, ?, ?, ?, '2026-01-01');
        `, [emp.id, basic, allowances, fixedDeductions]);
      }
      console.log(`Seeded initial salaries for ${employees.length} employees.`);
    }

    await conn.commit();
    console.log('--- Payroll Migration Completed Successfully ---');
  } catch (error) {
    await conn.rollback();
    console.error('Migration failed:', error);
    throw error;
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  migratePayroll().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migratePayroll;
