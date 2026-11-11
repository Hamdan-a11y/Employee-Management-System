const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

async function backup() {
  try {
    console.log('Creating backup table employees_backup_20261111...');
    await pool.query('DROP TABLE IF EXISTS employees_backup_20261111');
    await pool.query('CREATE TABLE employees_backup_20261111 AS SELECT * FROM employees');
    const [r] = await pool.query('SELECT COUNT(*) as count FROM employees_backup_20261111');
    console.log(`Backup completed successfully! Table 'employees_backup_20261111' contains ${r[0].count} records.`);
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

backup();

