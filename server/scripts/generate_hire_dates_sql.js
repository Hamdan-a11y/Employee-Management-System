const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');

// Helper: check if a Date is weekday (1 = Mon, 5 = Fri)
function isWeekday(d) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

// Helper: format Date to MySQL TIMESTAMP string 'YYYY-MM-DD HH:mm:ss'
function formatTimestamp(d, hour = 9, minute = 0, second = 0) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  const s = String(second).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// Generate an array of all weekdays in a given year and month (1-indexed month)
// with optional maxDay limit for current month
function getWeekdaysInMonth(year, month, maxDay = null) {
  const weekdays = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const limit = maxDay ? Math.min(daysInMonth, maxDay) : daysInMonth;
  for (let d = 1; d <= limit; d++) {
    const dateObj = new Date(year, month - 1, d);
    if (isWeekday(dateObj)) {
      weekdays.push(dateObj);
    }
  }
  return weekdays;
}

async function generate() {
  try {
    // 1. Fetch all employees
    const [employees] = await pool.query(`
      SELECT e.id, e.name, e.status, e.deleted_at, e.created_at
      FROM employees e
      ORDER BY e.id ASC
    `);

    // 2. Fetch employees with leave requests (must be hired before their first leave)
    const [empLeaves] = await pool.query(`
      SELECT employee_id, MIN(start_date) as min_leave
      FROM leave_requests
      GROUP BY employee_id
    `);
    const leaveEmpMap = new Map();
    empLeaves.forEach(r => leaveEmpMap.set(r.employee_id, new Date(r.min_leave)));

    // 3. Separate deleted employees and active employees
    const deletedEmps = employees.filter(e => e.deleted_at !== null);
    const activeEmps = employees.filter(e => e.deleted_at === null);

    console.log(`Total employees: ${employees.length}`);
    console.log(`Active employees: ${activeEmps.length}`);
    console.log(`Deleted employees: ${deletedEmps.length}`);
    console.log(`Employees with leave requests: ${leaveEmpMap.size}`);

    // Monthly targets for the last 6 months (June 2026 to November 2026):
    // June: 11, July: 17, August: 24, September: 15, October: 26, November: 18 -> Total = 111 active employees (~71.2%)
    // Remaining active: 156 - 111 = 45 employees hired between 6 and 36 months ago (Nov 2023 - May 2026).
    const monthlyTargets = [
      { year: 2026, month: 6, count: 11 },
      { year: 2026, month: 7, count: 17 },
      { year: 2026, month: 8, count: 24 },
      { year: 2026, month: 9, count: 15 },
      { year: 2026, month: 10, count: 26 },
      { year: 2026, month: 11, count: 18, maxDay: 11 }, // Up to Nov 11, 2026
    ];

    // Build assignment map: empId -> timestamp string
    const assignments = new Map();

    // Priority 1: Handle employees with leave requests
    // Their first leave is between Sept 4 and Oct 2026.
    // Assign them hire dates in 2024, 2025, or early 2026 (prior to August 2026) so they have full tenure.
    const activeWithLeaves = activeEmps.filter(e => leaveEmpMap.has(e.id));
    const activeWithoutLeaves = activeEmps.filter(e => !leaveEmpMap.has(e.id));

    console.log(`Active with leaves: ${activeWithLeaves.length}`);
    console.log(`Active without leaves: ${activeWithoutLeaves.length}`);

    // Older months pool (6 to 36 months ago: from Nov 2023 to May 2026)
    // We need 45 active older employees + 5 deleted older employees = 50 older dates
    const olderMonths = [];
    // 2024: 12 months
    for (let m = 1; m <= 12; m++) olderMonths.push({ year: 2024, month: m });
    // 2025: 12 months
    for (let m = 1; m <= 12; m++) olderMonths.push({ year: 2025, month: m });
    // 2026: Jan to May (5 months)
    for (let m = 1; m <= 5; m++) olderMonths.push({ year: 2026, month: m });

    // Assign all 28 employees with leave requests to older dates (e.g. 2024, 2025, early 2026)
    // plus 17 more active employees to make 45 total older active employees
    const olderActiveEmps = [
      ...activeWithLeaves,
      ...activeWithoutLeaves.slice(0, 45 - activeWithLeaves.length),
    ];
    const recentActiveEmps = activeWithoutLeaves.slice(45 - activeWithLeaves.length);

    console.log(`Assigned to older cohort: ${olderActiveEmps.length}`);
    console.log(`Assigned to last 6 months cohort: ${recentActiveEmps.length}`);

    // Assign older active employees
    olderActiveEmps.forEach((emp, idx) => {
      const monthSpec = olderMonths[idx % olderMonths.length];
      const weekdays = getWeekdaysInMonth(monthSpec.year, monthSpec.month);
      const chosenDay = weekdays[(idx * 3 + 2) % weekdays.length];
      const hour = 9 + (idx % 8);
      const min = (idx * 13) % 60;
      assignments.set(emp.id, formatTimestamp(chosenDay, hour, min));
    });

    // Assign recent active employees into the 6 months: Jun, Jul, Aug, Sep, Oct, Nov 2026
    let recentIdx = 0;
    for (const target of monthlyTargets) {
      const weekdays = getWeekdaysInMonth(target.year, target.month, target.maxDay);
      for (let c = 0; c < target.count; c++) {
        const emp = recentActiveEmps[recentIdx++];
        if (!emp) break;
        const chosenDay = weekdays[(c * 2 + 1) % weekdays.length];
        const hour = 9 + (c % 8);
        const min = (c * 17) % 60;
        assignments.set(emp.id, formatTimestamp(chosenDay, hour, min));
      }
    }

    // Assign deleted employees (5 employees): hire dates in 2025 so they are earlier than deleted_at
    deletedEmps.forEach((emp, idx) => {
      const weekdays = getWeekdaysInMonth(2025, (idx * 2 + 3) % 12 + 1);
      const chosenDay = weekdays[idx % weekdays.length];
      assignments.set(emp.id, formatTimestamp(chosenDay, 10, 30));
    });

    // Validate all assignments:
    console.log(`Total assignments: ${assignments.size}`);
    let weekendCount = 0;
    let futureCount = 0;
    const now = new Date('2026-11-11T23:59:59');

    for (const [id, ts] of assignments.entries()) {
      const d = new Date(ts);
      if (!isWeekday(d)) weekendCount++;
      if (d > now) futureCount++;
    }
    console.log(`Weekend dates check: ${weekendCount} (must be 0)`);
    console.log(`Future dates check: ${futureCount} (must be 0)`);

    // Generate SQL statements
    let sqlContent = `-- ==============================================================================
-- Employee Management System - Realistic Hire Date Updates
-- Generated: 2026-11-11
-- Target: employees table in employee_db
-- ==============================================================================

USE employee_db;

-- 1. Ensure backup exists
CREATE TABLE IF NOT EXISTS employees_backup_20261111 AS SELECT * FROM employees;

-- 2. Update employee hire/join dates (created_at)
`;

    for (const [id, ts] of assignments.entries()) {
      sqlContent += `UPDATE employees SET created_at = '${ts}', updated_at = GREATEST(updated_at, '${ts}') WHERE id = ${id};\n`;
    }

    sqlContent += `
-- 3. Consistency: Remove pre-hire attendance records (cannot work before being hired)
DELETE a FROM attendance a
JOIN employees e ON a.employee_id = e.id
WHERE a.date < DATE(e.created_at);

-- 4. Consistency: Align user account creation date if it preceded the employee hire date
UPDATE users u
JOIN employees e ON u.employee_id = e.id
SET u.created_at = e.created_at
WHERE u.created_at < e.created_at;

-- 5. Consistency: Align audit log timestamps if employee creation logs were earlier
UPDATE audit_logs a
JOIN employees e ON a.entity_id = e.id AND a.entity_type = 'EMPLOYEE'
SET a.created_at = e.created_at
WHERE a.action = 'CREATE' AND a.created_at < e.created_at;

-- 6. Verification Queries:
-- SELECT YEAR(created_at) as hireYear, MONTH(created_at) as hireMonth, COUNT(*) as count
-- FROM employees WHERE deleted_at IS NULL GROUP BY hireYear, hireMonth ORDER BY hireYear DESC, hireMonth DESC;
`;

    const outputPath = path.join(__dirname, 'update_hire_dates.sql');
    fs.writeFileSync(outputPath, sqlContent, 'utf8');
    console.log(`✓ SQL written to: ${outputPath}`);

    process.exit(0);
  } catch (err) {
    console.error('Generation failed:', err);
    process.exit(1);
  }
}

generate();

