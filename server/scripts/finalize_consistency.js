const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

async function fix() {
  try {
    // 1. Ensure any hire date on current date is earlier than now
    await pool.query("UPDATE employees SET created_at = CONCAT(DATE(created_at), ' 09:15:00') WHERE DATE(created_at) = CURDATE()");

    // 2. Multi-table delete for attendance records preceding hire date
    await pool.query("DELETE attendance FROM attendance JOIN employees ON attendance.employee_id = employees.id WHERE attendance.date < DATE(employees.created_at)");

    // 3. Align users created_at with employee hire date
    await pool.query("UPDATE users JOIN employees ON users.employee_id = employees.id SET users.created_at = employees.created_at WHERE users.created_at < employees.created_at");

    // 4. Align audit logs created_at with employee hire date
    await pool.query("UPDATE audit_logs JOIN employees ON audit_logs.entity_id = employees.id AND audit_logs.entity_type = 'EMPLOYEE' SET audit_logs.created_at = employees.created_at WHERE audit_logs.action = 'CREATE' AND audit_logs.created_at < employees.created_at");

    // Verification checks
    const [attCheck] = await pool.query('SELECT COUNT(*) as cnt FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.date < DATE(e.created_at)');
    console.log(`✓ Attendance before hire date check: ${attCheck[0].cnt} (must be 0)`);

    const [leaveCheck] = await pool.query('SELECT COUNT(*) as cnt FROM leave_requests l JOIN employees e ON l.employee_id = e.id WHERE l.start_date < DATE(e.created_at)');
    console.log(`✓ Leaves before hire date check: ${leaveCheck[0].cnt} (must be 0)`);

    const [userCheck] = await pool.query('SELECT COUNT(*) as cnt FROM users u JOIN employees e ON u.employee_id = e.id WHERE u.created_at < e.created_at');
    console.log(`✓ Users created before hire date check: ${userCheck[0].cnt} (must be 0)`);

    const [futureCheck] = await pool.query('SELECT COUNT(*) as cnt FROM employees WHERE created_at > NOW()');
    console.log(`✓ Future hire dates check: ${futureCheck[0].cnt} (must be 0)`);

    const [weekendCheck] = await pool.query('SELECT COUNT(*) as cnt FROM employees WHERE DAYOFWEEK(created_at) IN (1, 7)');
    console.log(`✓ Weekend hire dates check: ${weekendCheck[0].cnt} (must be 0)`);

    // Fetch final 6-month chart counts
    const [rows] = await pool.query(`
      SELECT 
        YEAR(created_at) AS hireYear,
        MONTH(created_at) AS hireMonth,
        COUNT(*) AS count
      FROM employees
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        AND deleted_at IS NULL
      GROUP BY hireYear, hireMonth
      ORDER BY hireYear ASC, hireMonth ASC
    `);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyHiringStats = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const monthLabel = `${monthNames[m - 1]} ${y}`;
      const found = rows.find(
        (row) => Number(row.hireYear) === y && Number(row.hireMonth) === m
      );

      monthlyHiringStats.push({
        year: y,
        month: m,
        monthLabel,
        count: found ? Number(found.count) : 0,
      });
    }

    console.log('\n--- Live Dashboard Chart Monthly Hiring Stats ---');
    console.table(monthlyHiringStats);

    process.exit(0);
  } catch (err) {
    console.error('Finalize consistency failed:', err);
    process.exit(1);
  }
}

fix();

