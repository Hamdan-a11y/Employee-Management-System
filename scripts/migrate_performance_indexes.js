const path = require('path');
module.paths.push(path.join(__dirname, '../server/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const mysql = require('mysql2/promise');

async function addIndexIfNotExists(conn, table, indexName, columns) {
  const [dbRows] = await conn.query('SELECT DATABASE() AS current_db');
  const currentDb = dbRows[0].current_db;
  
  const [rows] = await conn.query(
    `SELECT COUNT(1) as cnt FROM information_schema.statistics 
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [currentDb, table, indexName]
  );
  
  if (rows[0].cnt === 0) {
    console.log(`Adding index ${indexName} on ${table} (${columns}) in ${currentDb}...`);
    await conn.query(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
    console.log(`✓ Added index ${indexName}`);
  } else {
    console.log(`Index ${indexName} already exists on ${table} in ${currentDb}.`);
  }
}

async function runIndexMigration(dbName) {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const targetDb = dbName || process.env.DB_NAME || 'employee_test_db';

  console.log(`Connecting to ${targetDb}...`);
  const conn = await mysql.createConnection({ host, port, user, password, database: targetDb });

  try {
    // 1. Indexes for attendance list filtering & Keyset pagination
    await addIndexIfNotExists(conn, 'attendance', 'idx_att_perf_keyset', 'date DESC, id DESC');

    // 2. Indexes for Department Attendance % & Punctuality Ranking (date range + status + check_in)
    await addIndexIfNotExists(conn, 'attendance', 'idx_att_perf_date_chk_stat_emp', 'date, check_in, status, employee_id');

    // 3. Index for Absenteeism Trend (status = 'Absent' + date range)
    await addIndexIfNotExists(conn, 'attendance', 'idx_att_perf_status_date_emp', 'status, date, employee_id');

    // 4. Covering index for Monthly Report Aggregation
    await addIndexIfNotExists(conn, 'attendance', 'idx_att_perf_covering_month', 'date, employee_id, status, is_late, total_hours');

    // 5. Covering index for Dashboard Stats Missing Checkout
    await addIndexIfNotExists(conn, 'attendance', 'idx_att_perf_date_missing', 'date, is_missing_checkout');

    // 6. Index for employee department scoping & filtering
    await addIndexIfNotExists(conn, 'employees', 'idx_emp_perf_dept_del_id', 'department_id, deleted_at, id');

    console.log(`✓ Migration completed successfully on ${targetDb}`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const dbName = process.env.DB_NAME || 'employee_test_db';
  runIndexMigration(dbName)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runIndexMigration, addIndexIfNotExists };
