const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

async function inspect() {
  try {
    const [empCount] = await pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active FROM employees');
    console.log('Employee count:', empCount[0]);

    const [monthlyDist] = await pool.query(`
      SELECT YEAR(created_at) as y, MONTH(created_at) as m, COUNT(*) as count
      FROM employees
      GROUP BY y, m
      ORDER BY y DESC, m DESC
    `);
    console.log('Current monthly created_at distribution:');
    console.table(monthlyDist);

    // Check attendance dates
    const [attDates] = await pool.query('SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total FROM attendance');
    console.log('Attendance dates:', attDates[0]);

    // Check leave requests dates
    const [leaveDates] = await pool.query('SELECT MIN(start_date) as min_start, MAX(end_date) as max_end, COUNT(*) as total FROM leave_requests');
    console.log('Leave requests dates:', leaveDates[0]);

    // Check leave balances years
    const [leaveBalYears] = await pool.query('SELECT DISTINCT year FROM leave_balances');
    console.log('Leave balances years:', leaveBalYears);

    // Check audit logs dates
    const [auditDates] = await pool.query('SELECT MIN(created_at) as min_created, MAX(created_at) as max_created, COUNT(*) as total FROM audit_logs');
    console.log('Audit logs dates:', auditDates[0]);

    // Check users created_at
    const [userDates] = await pool.query('SELECT MIN(created_at) as min_created, MAX(created_at) as max_created, COUNT(*) as total FROM users');
    console.log('Users dates:', userDates[0]);

    // Check employees min and max created_at
    const [empDates] = await pool.query('SELECT MIN(created_at) as min_created, MAX(created_at) as max_created FROM employees');
    console.log('Employees min/max created_at:', empDates[0]);

    // Check current database date/time
    const [curTime] = await pool.query('SELECT NOW() as now, CURDATE() as curdate');
    console.log('Database current time:', curTime[0]);

    // Check employees min attendance and leave dates
    const [empActivity] = await pool.query(`
      SELECT 
        e.id, 
        e.name, 
        MIN(a.date) as min_att, 
        MIN(l.start_date) as min_leave
      FROM employees e 
      LEFT JOIN attendance a ON e.id = a.employee_id 
      LEFT JOIN leave_requests l ON e.id = l.employee_id 
      GROUP BY e.id, e.name 
      HAVING min_att IS NOT NULL OR min_leave IS NOT NULL
    `);
    console.log(`Employees with attendance or leaves: ${empActivity.length}`);
    if (empActivity.length > 0) {
      console.log('Sample activity dates:', empActivity.slice(0, 5));
    }

    // Distribution of min attendance date per employee
    const [attDist] = await pool.query(`
      SELECT min_date as min_att_date, COUNT(*) as emp_count 
      FROM (SELECT employee_id, MIN(date) as min_date FROM attendance GROUP BY employee_id) t 
      GROUP BY min_date
      ORDER BY min_date ASC
    `);
    console.log('Distribution of min attendance date across employees:', attDist);

    // Distribution of min leave request date per employee
    const [leaveDist] = await pool.query(`
      SELECT min_date as min_leave_date, COUNT(*) as emp_count 
      FROM (SELECT employee_id, MIN(start_date) as min_date FROM leave_requests GROUP BY employee_id) t 
      GROUP BY min_date
      ORDER BY min_date ASC
    `);
    console.log('Distribution of min leave date across employees:', leaveDist);

    // Check employees with leave requests
    const [empLeaves] = await pool.query(`SELECT DISTINCT employee_id, MIN(start_date) as min_leave FROM leave_requests GROUP BY employee_id`);
    console.log('Employee IDs with leaves count:', empLeaves.length);
    console.log('Employee IDs with leaves:', empLeaves.map(r => r.employee_id).join(', '));

    // Check users table - which employees are linked to users
    const [empUsers] = await pool.query(`SELECT id, name, email, employee_id, created_at FROM users WHERE employee_id IS NOT NULL`);
    console.log('Users linked to employee_id:', empUsers.length);

    // Check deleted employees
    const [deletedEmps] = await pool.query('SELECT id, name, created_at, deleted_at, termination_date FROM employees WHERE deleted_at IS NOT NULL');
    console.log('Deleted employees:', deletedEmps);

    // Integrity and consistency verification checks
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

    process.exit(0);
  } catch (err) {
    console.error('Inspection failed:', err);
    process.exit(1);
  }
}

inspect();
