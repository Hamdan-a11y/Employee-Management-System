const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function migrateShifts() {
  console.log('Connecting to database for shifts migration...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    database: process.env.DB_NAME || 'employee_db',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });

  try {
    console.log('Creating shifts table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type ENUM('morning', 'evening', 'night', 'flexible') NOT NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        grace_minutes INT NOT NULL DEFAULT 0,
        break_minutes INT NOT NULL DEFAULT 0,
        min_working_minutes INT NOT NULL DEFAULT 480,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_shift_type (type),
        INDEX idx_shift_active (is_active),
        INDEX idx_shift_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating shift_rotations table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shift_rotations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating shift_rotation_steps table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS shift_rotation_steps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rotation_id INT NOT NULL,
        week_number INT NOT NULL,
        shift_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rotation_id) REFERENCES shift_rotations(id) ON DELETE CASCADE,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_rot_week (rotation_id, week_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Creating employee_shift_assignments table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS employee_shift_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        shift_id INT NULL,
        rotation_id INT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        assigned_by INT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT,
        FOREIGN KEY (rotation_id) REFERENCES shift_rotations(id) ON DELETE RESTRICT,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_emp_assignment_dates (employee_id, start_date, end_date),
        INDEX idx_shift_assignment (shift_id),
        INDEX idx_rotation_assignment (rotation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Checking columns on attendance table...');
    const [cols] = await conn.query('SHOW COLUMNS FROM attendance');
    const colNames = cols.map((c) => c.Field);

    if (!colNames.includes('shift_id')) {
      console.log('Adding shift_id column to attendance table...');
      await conn.query(`
        ALTER TABLE attendance
        ADD COLUMN shift_id INT NULL AFTER employee_id,
        ADD CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
      `);
    }

    if (!colNames.includes('is_short_day')) {
      console.log('Adding is_short_day column to attendance table...');
      await conn.query(`
        ALTER TABLE attendance
        ADD COLUMN is_short_day BOOLEAN NOT NULL DEFAULT FALSE AFTER late_minutes;
      `);
    }

    console.log('Seeding default shifts if table is empty...');
    const [existingShifts] = await conn.query('SELECT COUNT(*) as count FROM shifts');
    if (existingShifts[0].count === 0) {
      await conn.query(`
        INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
        VALUES 
          ('General Morning Shift', 'morning', '09:00:00', '17:00:00', 15, 60, 480, TRUE, TRUE),
          ('Afternoon / Evening Shift', 'evening', '14:00:00', '22:00:00', 15, 45, 480, TRUE, FALSE),
          ('Overnight Night Shift', 'night', '22:00:00', '06:00:00', 15, 30, 480, TRUE, FALSE),
          ('Flexible Core Hours', 'flexible', NULL, NULL, 0, 60, 480, TRUE, FALSE);
      `);
      console.log('Seeded 4 standard shifts.');

      // Also create a sample 3-week rotation pattern
      const [mShift] = await conn.query("SELECT id FROM shifts WHERE type = 'morning' LIMIT 1");
      const [eShift] = await conn.query("SELECT id FROM shifts WHERE type = 'evening' LIMIT 1");
      const [nShift] = await conn.query("SELECT id FROM shifts WHERE type = 'night' LIMIT 1");

      if (mShift[0] && eShift[0] && nShift[0]) {
        const [rotRes] = await conn.query(`
          INSERT INTO shift_rotations (name, description)
          VALUES ('Standard 3-Week Cycle', 'Week 1 Morning, Week 2 Evening, Week 3 Night pattern')
        `);
        const rotId = rotRes.insertId;

        await conn.query(`
          INSERT INTO shift_rotation_steps (rotation_id, week_number, shift_id)
          VALUES 
            (?, 1, ?),
            (?, 2, ?),
            (?, 3, ?)
        `, [rotId, mShift[0].id, rotId, eShift[0].id, rotId, nShift[0].id]);
        console.log('Seeded standard 3-week rotation pattern.');
      }
    }

    console.log('Shift management tables migration completed successfully!');
  } finally {
    await conn.end();
  }
}

migrateShifts().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
