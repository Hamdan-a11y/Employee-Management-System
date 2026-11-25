const fs = require('fs');
const path = require('path');
module.paths.push(path.join(__dirname, '../server/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const mysql = require('mysql2/promise');
const { performance } = require('perf_hooks');

const QUERIES = {
  attendance_list: {
    name: 'Attendance List (Filters + Pagination)',
    description: 'Filter by date range, department, status with OFFSET 1000 LIMIT 50',
    sql: `
      SELECT a.*, e.name AS employee_name, e.email AS employee_email, d.name AS department_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE a.date BETWEEN '2024-01-01' AND '2024-06-30'
        AND a.status = 'Present'
        AND e.department_id = 2
      ORDER BY a.date DESC, a.id DESC
      LIMIT 50 OFFSET 1000
    `
  },
  monthly_report: {
    name: 'Monthly Report Aggregation',
    description: 'Aggregates attendance metrics per employee for a calendar month',
    sql: `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.email AS employee_email,
        e.designation,
        d.name AS department_name,
        COUNT(a.id) AS days_recorded,
        SUM(CASE WHEN a.status IN ('Present', 'Late', 'Half Day') THEN 1 ELSE 0 END) AS days_present,
        SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS days_late,
        SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) AS days_half_day,
        ROUND(COALESCE(SUM(a.total_hours), 0), 2) AS total_hours_worked,
        ROUND(COALESCE(AVG(CASE WHEN a.total_hours > 0 THEN a.total_hours ELSE NULL END), 0), 2) AS avg_hours_per_day
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND a.date BETWEEN '2024-03-01' AND '2024-03-31'
      WHERE e.deleted_at IS NULL
      GROUP BY e.id, e.name, e.email, e.designation, d.name
      ORDER BY e.name ASC
    `
  },
  department_attendance_pct: {
    name: 'Department Attendance %',
    description: 'Calculates present employee counts grouped by department over 6 months',
    sql: `
      SELECT e.department_id, COUNT(a.id) AS present_count
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date BETWEEN '2024-01-01' AND '2024-06-30'
        AND a.status != 'Absent'
        AND a.check_in IS NOT NULL
      GROUP BY e.department_id
    `
  },
  punctuality_ranking: {
    name: 'Punctuality Ranking',
    description: 'Calculates on-time percentage and ranks employees using RANK() OVER window function',
    sql: `
      WITH emp_stats AS (
        SELECT 
          a.employee_id,
          e.name AS employee_name,
          e.department_id,
          d.name AS department_name,
          COUNT(a.id) AS days_present,
          SUM(CASE WHEN (a.is_late = 0 OR a.is_late IS NULL) AND a.status != 'Absent' THEN 1 ELSE 0 END) AS on_time_days,
          ROUND(
            (SUM(CASE WHEN (a.is_late = 0 OR a.is_late IS NULL) AND a.status != 'Absent' THEN 1.0 ELSE 0.0 END) * 100.0) /
            NULLIF(COUNT(a.id), 0),
            1
          ) AS punctuality_pct
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE a.date BETWEEN '2024-01-01' AND '2024-06-30'
          AND a.status != 'Absent'
          AND a.check_in IS NOT NULL
        GROUP BY a.employee_id, e.name, e.department_id, d.name
        HAVING days_present >= 5
      ),
      ranked_top AS (
        SELECT *,
          RANK() OVER (ORDER BY punctuality_pct DESC, days_present DESC) AS rk
        FROM emp_stats
      )
      SELECT * FROM ranked_top WHERE rk <= 10
    `
  },
  absenteeism_trend: {
    name: 'Absenteeism Trend',
    description: 'Monthly absent days across 3 years with month-over-month lag delta using LAG()',
    sql: `
      WITH monthly_absences AS (
        SELECT 
          DATE_FORMAT(a.date, '%Y-%m') AS month,
          COUNT(a.id) AS absent_days
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.date BETWEEN '2023-01-01' AND '2025-12-31'
          AND a.status = 'Absent'
        GROUP BY DATE_FORMAT(a.date, '%Y-%m')
      ),
      with_lag AS (
        SELECT 
          month,
          absent_days,
          LAG(absent_days, 1, 0) OVER (ORDER BY month) AS prev_month_absent_days,
          absent_days - LAG(absent_days, 1, 0) OVER (ORDER BY month) AS change_from_prev
        FROM monthly_absences
      )
      SELECT 
        month,
        absent_days,
        prev_month_absent_days,
        change_from_prev,
        CASE 
          WHEN prev_month_absent_days = 0 THEN 0
          ELSE ROUND((change_from_prev * 100.0) / prev_month_absent_days, 1)
        END AS pct_change
      FROM with_lag
      ORDER BY month ASC
    `
  },
  dashboard_stats: {
    name: 'Dashboard Stats',
    description: 'Live counts for active employees, present, late, absent, and missing checkouts',
    sql: `
      SELECT 
        (SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL AND status = 'Active') AS activeEmployees,
        (SELECT COUNT(*) FROM attendance WHERE date = '2024-03-15' AND status = 'Present') AS todayPresent,
        (SELECT COUNT(*) FROM attendance WHERE date = '2024-03-15' AND is_late = 1) AS todayLate,
        (SELECT COUNT(*) FROM attendance WHERE date = '2024-03-15' AND status = 'Absent') AS todayAbsent,
        (SELECT COUNT(*) FROM attendance WHERE date = '2024-03-15' AND is_missing_checkout = 1) AS todayMissingCheckout
    `
  }
};

async function runBenchmark(label = 'before', options = {}) {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'employee_test_db';

  console.log(`[Benchmark] Running benchmark with label: "${label}" on ${dbName}`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: dbName
  });

  const iterations = options.iterations || 5;
  const results = {};

  try {
    for (const [key, q] of Object.entries(QUERIES)) {
      console.log(`-> Profiling ${q.name}...`);

      // 1. Run EXPLAIN ANALYZE
      let explainOutput = '';
      try {
        const [explainRows] = await conn.query(`EXPLAIN ANALYZE ${q.sql}`);
        explainOutput = explainRows.map(r => r.EXPLAIN || JSON.stringify(r)).join('\n');
      } catch (exErr) {
        explainOutput = `EXPLAIN ANALYZE error: ${exErr.message}`;
      }

      // 2. Measure execution time across iterations
      const times = [];
      let rowCount = 0;

      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        const [rows] = await conn.query(q.sql);
        const t1 = performance.now();
        times.push(t1 - t0);
        rowCount = Array.isArray(rows) ? rows.length : 1;
      }

      const meanMs = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100;
      const minMs = Math.round(Math.min(...times) * 100) / 100;
      const maxMs = Math.round(Math.max(...times) * 100) / 100;

      results[key] = {
        name: q.name,
        description: q.description,
        mean_ms: meanMs,
        min_ms: minMs,
        max_ms: maxMs,
        iterations,
        rows_returned: rowCount,
        explain_analyze: explainOutput
      };

      console.log(`   Mean: ${meanMs} ms | Min: ${minMs} ms | Max: ${maxMs} ms`);
    }

    // Ensure output directory exists
    const docsDir = path.join(__dirname, '../docs/performance');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // 1. Write JSON output
    const jsonPath = path.join(docsDir, `${label}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ label, timestamp: new Date().toISOString(), database: dbName, results }, null, 2));
    console.log(`[Output] Written JSON benchmark report: ${jsonPath}`);

    // 2. Write Markdown output
    const mdPath = path.join(docsDir, `${label}.md`);
    let md = `# Attendance Performance Benchmark Report: ${label.toUpperCase()}\n\n`;
    md += `- **Date**: ${new Date().toISOString()}\n`;
    md += `- **Database**: \`${dbName}\` (1,000,000+ attendance records)\n`;
    md += `- **Iterations per query**: ${iterations}\n\n`;

    md += `## Summary Table\n\n`;
    md += `| Query | Mean (ms) | Min (ms) | Max (ms) | Rows |\n`;
    md += `|---|---|---|---|---|\n`;

    for (const [k, r] of Object.entries(results)) {
      md += `| **${r.name}** | \`${r.mean_ms} ms\` | ${r.min_ms} ms | ${r.max_ms} ms | ${r.rows_returned} |\n`;
    }

    md += `\n---\n\n## Detailed Execution Plans (EXPLAIN ANALYZE)\n\n`;

    for (const [k, r] of Object.entries(results)) {
      md += `### ${r.name}\n`;
      md += `> ${r.description}\n\n`;
      md += `\`\`\`\n${r.explain_analyze.trim()}\n\`\`\`\n\n`;
    }

    fs.writeFileSync(mdPath, md);
    console.log(`[Output] Written Markdown benchmark report: ${mdPath}`);

    // If running 'after', automatically generate comparison.md
    if (label === 'after') {
      generateComparison(docsDir);
    }

  } finally {
    await conn.end();
  }

  return results;
}

function generateComparison(docsDir = path.join(__dirname, '../docs/performance')) {
  const beforeJsonPath = path.join(docsDir, 'before.json');
  const afterJsonPath = path.join(docsDir, 'after.json');
  const compMdPath = path.join(docsDir, 'comparison.md');

  if (!fs.existsSync(beforeJsonPath) || !fs.existsSync(afterJsonPath)) {
    console.warn('[Comparison] Missing before.json or after.json, skipping comparison.md generation.');
    return;
  }

  const beforeData = JSON.parse(fs.readFileSync(beforeJsonPath, 'utf8'));
  const afterData = JSON.parse(fs.readFileSync(afterJsonPath, 'utf8'));

  let md = `# Attendance Performance Optimization Comparison\n\n`;
  md += `Comparison between baseline (**before** optimization) and indexed/optimized execution (**after** optimization).\n\n`;
  md += `- **Database**: \`${afterData.database || 'employee_test_db'}\` (1,096,000 attendance records)\n`;
  md += `- **Date**: ${new Date().toISOString()}\n\n`;

  md += `## Query Execution Time Comparison\n\n`;
  md += `| Query | Before (ms) | After (ms) | % Gain |\n`;
  md += `|---|---|---|---|\n`;

  for (const [key, afterQuery] of Object.entries(afterData.results)) {
    const beforeQuery = beforeData.results[key];
    const beforeMs = beforeQuery ? beforeQuery.mean_ms : 'N/A';
    const afterMs = afterQuery.mean_ms;
    let gainStr = 'N/A';

    if (beforeQuery && beforeMs > 0) {
      const gain = Math.round(((beforeMs - afterMs) / beforeMs) * 1000) / 10;
      gainStr = gain >= 0 ? `+${gain}%` : `${gain}%`;
    }

    md += `| **${afterQuery.name}** | \`${beforeMs} ms\` | \`${afterMs} ms\` | **${gainStr}** |\n`;
  }

  // Preserve load test section if it exists, or add placeholder
  if (fs.existsSync(compMdPath)) {
    const existingContent = fs.readFileSync(compMdPath, 'utf8');
    const loadTestIdx = existingContent.indexOf('## Load Test Results');
    if (loadTestIdx !== -1) {
      md += '\n\n' + existingContent.slice(loadTestIdx);
    }
  }

  fs.writeFileSync(compMdPath, md);
  console.log(`[Output] Written comparison report: ${compMdPath}`);
}

if (require.main === module) {
  let label = 'before';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--label=')) label = arg.split('=')[1];
    else if (!arg.startsWith('-')) label = arg;
  }
  runBenchmark(label).catch(err => {
    console.error('[Benchmark Error]', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark, QUERIES };
