const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function migrateRBAC() {
  console.log('[Migration] Starting RBAC schema migration...');
  const conn = await pool.getConnection();

  try {
    // 1. Modify users.role enum
    console.log('[Migration] Updating users.role enum...');
    await conn.query(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'hr_manager', 'department_manager', 'employee') NOT NULL DEFAULT 'employee'
    `);
    console.log('[Migration] users.role enum updated.');

    // 2. Check and add department_id column to users
    console.log('[Migration] Checking department_id in users table...');
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'department_id'
    `);

    if (cols.length === 0) {
      await conn.query(`
        ALTER TABLE users 
        ADD COLUMN department_id INT NULL,
        ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      console.log('[Migration] Added department_id column and foreign key to users table.');
    } else {
      console.log('[Migration] department_id column already exists in users table.');
    }

    // 3. Seed / Verify test users for all roles
    const hashedPassword = await bcrypt.hash('Password123!', 10);

    // HR Manager
    await conn.query(`
      INSERT INTO users (name, email, password, role)
      VALUES ('HR Manager', 'hr_manager@example.com', ?, 'hr_manager')
      ON DUPLICATE KEY UPDATE role = 'hr_manager'
    `, [hashedPassword]);
    console.log('[Migration] HR Manager account verified/seeded: hr_manager@example.com');

    // Department Manager Dept 1 (Engineering)
    await conn.query(`
      INSERT INTO users (name, email, password, role, department_id)
      VALUES ('Engineering Manager', 'manager_dept1@example.com', ?, 'department_manager', 1)
      ON DUPLICATE KEY UPDATE role = 'department_manager', department_id = 1
    `, [hashedPassword]);
    console.log('[Migration] Dept 1 Manager account verified/seeded: manager_dept1@example.com');

    // Department Manager Dept 2 (HR / Operations)
    await conn.query(`
      INSERT INTO users (name, email, password, role, department_id)
      VALUES ('HR Dept Manager', 'manager_dept2@example.com', ?, 'department_manager', 2)
      ON DUPLICATE KEY UPDATE role = 'department_manager', department_id = 2
    `, [hashedPassword]);
    console.log('[Migration] Dept 2 Manager account verified/seeded: manager_dept2@example.com');

    console.log('[Migration] RBAC migration completed successfully.');
  } catch (err) {
    console.error('[Migration] RBAC migration failed:', err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

migrateRBAC()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

