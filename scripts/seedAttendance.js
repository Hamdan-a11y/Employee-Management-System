const path = require('path');
module.paths.push(path.join(__dirname, '../server/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const mysql = require('mysql2/promise');

async function seedAttendance() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'employee_test_db';

  console.log(`[Seed Attendance] Target database: ${dbName} on ${host}:${port}`);

  // Safety Guard: Runs ONLY if DB name contains "test" or SEED_ALLOWED=true
  const isTestDb = dbName.toLowerCase().includes('test');
  const seedAllowed = process.env.SEED_ALLOWED === 'true';

  if (!isTestDb && !seedAllowed) {
    console.error(
      `[SAFETY BLOCKED] Database "${dbName}" does not contain "test" and SEED_ALLOWED=true is not set. Refusing to seed.`
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: dbName,
    multipleStatements: true,
  });

  try {
    // Check idempotence
    const [countRows] = await conn.query('SELECT COUNT(*) AS total FROM attendance');
    const existingCount = Number(countRows[0].total || 0);

    if (existingCount >= 1000000) {
      console.log(
        `[IDEMPOTENT] Attendance table already contains ${existingCount.toLocaleString()} rows (>= 1,000,000). Skipping.`
      );
      await conn.end();
      return;
    }

    console.log(`Current attendance row count: ${existingCount}. Seeding 1,000,000+ rows...`);

    // Ensure session CTE recursion depth allows large generation
    await conn.query('SET SESSION cte_max_recursion_depth = 2000000');

    // 1. Ensure at least 1,000 active employees exist
    console.log('Ensuring 1,000 employee profiles exist in test database...');
    await conn.query(`
      INSERT IGNORE INTO employees (id, name, email, phone, department_id, designation, status, joining_date)
      WITH RECURSIVE generate_series(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM generate_series WHERE n < 1000
      )
      SELECT 
        s.n,
        CONCAT('Test Employee ', s.n),
        CONCAT('test_emp_', s.n, '@example-corp.internal'),
        CONCAT('0300', LPAD(s.n, 7, '0')),
        ((s.n % 5) + 1),
        CASE (s.n % 4)
          WHEN 0 THEN 'Senior Engineer'
          WHEN 1 THEN 'Product Designer'
          WHEN 2 THEN 'Accountant'
          ELSE 'Operations Associate'
        END,
        'Active',
        '2022-01-01'
      FROM generate_series s;
    `);

    // 2. Insert ~3 years of attendance across 1096 days (2023-01-01 to 2025-12-31)
    // 1,000 employees * 1,096 days = 1,096,000 rows
    // Insert in 11 chunked windows of 100 days to stay fast and avoid query buffer overflow
    const totalDays = 1096;
    const chunkSize = 100;

    console.log(`Inserting 1M+ attendance rows in chunks of ${chunkSize} days...`);
    const startTime = Date.now();

    for (let offset = 0; offset < totalDays; offset += chunkSize) {
      const chunkEnd = Math.min(offset + chunkSize - 1, totalDays - 1);
      const chunkDays = chunkEnd - offset + 1;

      await conn.query(`
        SET SESSION cte_max_recursion_depth = 2000000;

        INSERT IGNORE INTO attendance (
          employee_id,
          date,
          check_in,
          check_out,
          total_hours,
          is_late,
          late_minutes,
          status,
          is_missing_checkout,
          check_in_ip_address,
          check_in_user_agent
        )
        WITH RECURSIVE generate_series(n) AS (
          SELECT ${offset}
          UNION ALL
          SELECT n + 1 FROM generate_series WHERE n < ${chunkEnd}
        ),
        emp_series AS (
          SELECT id AS emp_id FROM employees WHERE id <= 1000
        )
        SELECT
          e.emp_id,
          DATE_ADD('2023-01-01', INTERVAL s.n DAY) AS work_date,
          -- check_in
          CASE
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 80 AND 87 THEN NULL -- Absent
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 65 AND 79 THEN TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '09:35:00') -- Late
            ELSE TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '09:00:00') -- On-time / Half day / Overtime / Missing checkout
          END,
          -- check_out
          CASE
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 80 AND 87 THEN NULL -- Absent
            WHEN ((e.emp_id * 31 + s.n) % 100) >= 97 THEN NULL -- Missing checkout
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 88 AND 91 THEN TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '13:00:00') -- Half day
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 92 AND 96 THEN TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '20:30:00') -- Overtime
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 65 AND 79 THEN TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '17:35:00') -- Late
            ELSE TIMESTAMP(DATE_ADD('2023-01-01', INTERVAL s.n DAY), '17:00:00') -- Regular present
          END,
          -- total_hours
          CASE
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 80 AND 87 THEN 0.00 -- Absent
            WHEN ((e.emp_id * 31 + s.n) % 100) >= 97 THEN 0.00 -- Missing checkout
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 88 AND 91 THEN 4.00 -- Half day
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 92 AND 96 THEN 11.50 -- Overtime
            ELSE 8.00
          END,
          -- is_late
          CASE WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 65 AND 79 THEN 1 ELSE 0 END,
          -- late_minutes
          CASE WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 65 AND 79 THEN 35 ELSE 0 END,
          -- status
          CASE
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 80 AND 87 THEN 'Absent'
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 65 AND 79 THEN 'Late'
            WHEN ((e.emp_id * 31 + s.n) % 100) BETWEEN 88 AND 91 THEN 'Half Day'
            ELSE 'Present'
          END,
          -- is_missing_checkout
          CASE WHEN ((e.emp_id * 31 + s.n) % 100) >= 97 THEN 1 ELSE 0 END,
          '127.0.0.1',
          'Benchmark-Seed-Runner/1.0'
        FROM emp_series e
        CROSS JOIN generate_series s;
      `);

      process.stdout.write(
        `  Processed day offset ${offset} to ${chunkEnd} (~${((chunkEnd + 1) * 1000).toLocaleString()} rows)\r`
      );
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nBulk insert completed in ${elapsedSec}s.`);

    // Also populate overtime_requests for the overtime attendance rows so overtime analytics have data
    console.log('Seeding approved overtime_requests corresponding to overtime attendance records...');
    await conn.query(`
      INSERT IGNORE INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status)
      SELECT 
        a.employee_id,
        a.date,
        210, -- 3.5 hours = 210 minutes
        'regular',
        1.50,
        'approved'
      FROM attendance a
      WHERE a.total_hours > 8
      LIMIT 50000;
    `);

    const [finalCountRows] = await conn.query('SELECT COUNT(*) AS total FROM attendance');
    console.log(
      `[SUCCESS] Seed finished. Total attendance rows in ${dbName}: ${Number(finalCountRows[0].total).toLocaleString()}`
    );
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  seedAttendance().catch((err) => {
    console.error('[Seed Error]', err);
    process.exit(1);
  });
}

module.exports = { seedAttendance };
