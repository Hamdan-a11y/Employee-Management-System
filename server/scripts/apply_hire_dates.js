const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

async function applyHireDates() {
  const conn = await pool.getConnection();
  try {
    console.log('--- Applying Realistic Hire Dates ---');

    // 1. Verify backup table exists
    const [bRows] = await conn.query("SHOW TABLES LIKE 'employees_backup_20261111'");
    if (bRows.length === 0) {
      throw new Error("Backup table 'employees_backup_20261111' does not exist! Aborting.");
    }
    const [bCount] = await conn.query('SELECT COUNT(*) as count FROM employees_backup_20261111');
    console.log(`✓ Backup verified: 'employees_backup_20261111' contains ${bCount[0].count} records.`);

    // 2. Read SQL file
    const sqlFile = path.join(__dirname, 'update_hire_dates.sql');
    const sqlText = fs.readFileSync(sqlFile, 'utf8');

    // Split SQL by semicolon
    const statements = sqlText
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Executing ${statements.length} SQL statements within transaction...`);
    await conn.beginTransaction();

    for (const stmt of statements) {
      if (stmt.toLowerCase().startsWith('use ')) continue;
      await conn.query(stmt);
    }

    await conn.commit();
    console.log('✓ All SQL updates committed successfully!');

    // 3. Query the exact monthly hiring breakdown used by dashboard.js
    const [rows] = await conn.query(`
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

    console.log('\n--- Final Monthly Hiring Statistics (Dashboard Chart) ---');
    console.table(monthlyHiringStats);

    const [totalActive] = await conn.query('SELECT COUNT(*) as total FROM employees WHERE deleted_at IS NULL');
    const [totalAll] = await conn.query('SELECT COUNT(*) as total FROM employees');
    console.log(`Total employees in database: ${totalAll[0].total} (Active: ${totalActive[0].total})`);

    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error('Update failed, rolled back:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

applyHireDates();

