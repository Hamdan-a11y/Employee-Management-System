const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

async function dryRun() {
  const conn = await pool.getConnection();
  try {
    console.log('--- Testing SQL execution in a transaction with automatic ROLLBACK ---');
    await conn.beginTransaction();

    const sqlFile = path.join(__dirname, 'update_hire_dates.sql');
    const sqlText = fs.readFileSync(sqlFile, 'utf8');

    const statements = sqlText
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let count = 0;
    for (const stmt of statements) {
      if (stmt.toLowerCase().startsWith('use ')) continue;
      await conn.query(stmt);
      count++;
    }
    console.log(`✓ Successfully executed ${count} statements without errors!`);

    // Check monthly hiring stats within the transaction
    const [monthlyHiringRows] = await conn.query(`
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
      const found = monthlyHiringRows.find(
        (row) => Number(row.hireYear) === y && Number(row.hireMonth) === m
      );

      monthlyHiringStats.push({
        year: y,
        month: m,
        monthLabel,
        count: found ? Number(found.count) : 0,
      });
    }

    console.log('\nDry-run simulated chart results:');
    console.table(monthlyHiringStats);

    // Rollback so the live data is untouched until the user approves!
    await conn.rollback();
    console.log('✓ Transaction successfully rolled back. Live table remains untouched.');
    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error('Dry-run failed:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

dryRun();

