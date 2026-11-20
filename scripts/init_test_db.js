const path = require('path');
module.paths.push(path.join(__dirname, '../server/node_modules'));
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

async function initTestDb() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const targetDb = 'employee_test_db';

  console.log(`Connecting to MySQL at ${host}:${port}...`);
  const conn = await mysql.createConnection({ host, user, password, port });

  await conn.query(`CREATE DATABASE IF NOT EXISTS ${targetDb}`);
  console.log(`Database "${targetDb}" is ready.`);

  // Get all tables from employee_db
  const [tables] = await conn.query('SHOW TABLES FROM employee_db');
  for (const row of tables) {
    const tbl = Object.values(row)[0];
    await conn.query(`CREATE TABLE IF NOT EXISTS ${targetDb}.${tbl} LIKE employee_db.${tbl}`);
  }
  console.log(`Cloned table schemas to ${targetDb}.`);

  // Copy departments, employees, users, shifts, working_week_configs, holidays to test DB
  const tablesToCopyData = [
    'departments',
    'employees',
    'users',
    'shifts',
    'shift_rotations',
    'shift_rotation_steps',
    'employee_shift_assignments',
    'working_week_configs',
    'holidays',
    'overtime_policies',
    'payroll_settings'
  ];

  for (const tbl of tablesToCopyData) {
    const [exists] = await conn.query(`SHOW TABLES FROM ${targetDb} LIKE '${tbl}'`);
    if (exists.length > 0) {
      await conn.query(`INSERT IGNORE INTO ${targetDb}.${tbl} SELECT * FROM employee_db.${tbl}`);
    }
  }
  console.log(`Copied baseline data to ${targetDb}.`);

  await conn.end();
}

initTestDb().catch(console.error);
