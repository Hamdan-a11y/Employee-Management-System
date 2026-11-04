const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runSchema() {
  console.log('Connecting to MySQL database...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Password@123',
    multipleStatements: true,
  });

  console.log('Reading schema.sql...');
  const sql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

  console.log('Executing schema.sql...');
  await conn.query(sql);

  console.log('Validating table counts in employee_db:');
  const tables = [
    'departments',
    'employees',
    'users',
    'attendance',
    'leave_requests',
    'leave_balances',
    'audit_logs',
    'notifications'
  ];

  for (const t of tables) {
    const [rows] = await conn.query(`SELECT COUNT(*) as count FROM employee_db.${t}`);
    console.log(`  - ${t}: ${rows[0].count} rows`);
  }

  await conn.end();
  console.log('Schema execution completed successfully!');
}

runSchema().catch((err) => {
  console.error('Failed to run schema.sql:', err);
  process.exit(1);
});

