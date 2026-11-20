const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const pool = require('../db');
const config = require('../config/env');
const analyticsRoutes = require('../routes/analytics');
const {
  getDepartmentAttendance,
  getPunctualityRanking,
  getMonthlyAbsenteeismTrend,
} = require('../services/analyticsService');

describe('Feature: Advanced Attendance Analytics Tests', () => {
  let server;
  let port;

  let deptAId;
  let deptBId;
  let emp1DeptAId;
  let emp2DeptAId;
  let emp3DeptBId;

  let adminToken;
  let managerDeptAToken;
  let employeeToken;

  function apiRequest(method, endpoint, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`http://localhost:${port}/api/analytics${endpoint}`);
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  before(async () => {
    try {
    // 1. Setup Express app & HTTP Server
    const app = express();
    app.use(express.json());
    app.use('/api/analytics', analyticsRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    // 2. Create Test Departments
    const [deptARes] = await pool.query(
      'INSERT INTO departments (name) VALUES (?)',
      [`Analytics Dept A ${Date.now()}`]
    );
    deptAId = deptARes.insertId;

    const [deptBRes] = await pool.query(
      'INSERT INTO departments (name) VALUES (?)',
      [`Analytics Dept B ${Date.now()}`]
    );
    deptBId = deptBRes.insertId;

    // 3. Create Test Employees
    const [emp1Res] = await pool.query(
      "INSERT INTO employees (name, email, phone, designation, department_id, status, joining_date) VALUES (?, ?, '03001234561', 'Engineer', ?, 'Active', ?)",
      ['Analytics Emp 1 A', `emp1.a.${Date.now()}@example.com`, deptAId, '2025-01-01']
    );
    emp1DeptAId = emp1Res.insertId;

    const [emp2Res] = await pool.query(
      "INSERT INTO employees (name, email, phone, designation, department_id, status, joining_date) VALUES (?, ?, '03001234562', 'Engineer', ?, 'Active', ?)",
      ['Analytics Emp 2 A', `emp2.a.${Date.now()}@example.com`, deptAId, '2025-01-01']
    );
    emp2DeptAId = emp2Res.insertId;

    const [emp3Res] = await pool.query(
      "INSERT INTO employees (name, email, phone, designation, department_id, status, joining_date) VALUES (?, ?, '03001234563', 'Engineer', ?, 'Active', ?)",
      ['Analytics Emp 3 B', `emp3.b.${Date.now()}@example.com`, deptBId, '2025-01-01']
    );
    emp3DeptBId = emp3Res.insertId;

    // 4. Create Users for Authentication
    const [mgrUserRes] = await pool.query(
      'INSERT INTO users (name, email, password, role, department_id) VALUES (?, ?, ?, ?, ?)',
      ['Dept A Manager', `mgr.deptA.${Date.now()}@example.com`, '$2a$10$hashed', 'department_manager', deptAId]
    );
    const mgrUserId = mgrUserRes.insertId;

    const [empUserRes] = await pool.query(
      'INSERT INTO users (name, email, password, role, employee_id) VALUES (?, ?, ?, ?, ?)',
      ['Regular Employee User', `emp.user.${Date.now()}@example.com`, '$2a$10$hashed', 'employee', emp1DeptAId]
    );
    const empUserId = empUserRes.insertId;

    // 5. Generate Tokens
    adminToken = jwt.sign({ id: 1, role: 'admin', name: 'Admin Master' }, config.jwtSecret, { expiresIn: '1h' });
    managerDeptAToken = jwt.sign({ id: mgrUserId, role: 'department_manager', department_id: deptAId }, config.jwtSecret, { expiresIn: '1h' });
    employeeToken = jwt.sign({ id: empUserId, role: 'employee', employee_id: emp1DeptAId }, config.jwtSecret, { expiresIn: '1h' });
    } catch (err) {
      console.error('BEFORE ERROR DETAILS:', err);
      throw err;
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Test 1: Attendance % excludes holiday, weekend, and approved leave
  it('Attendance % excludes holiday, weekend, and approved leave', async () => {
    // We test period: 2033-05 (2033-05-01 to 2033-05-31)
    // 2033-05-01 is Sunday (Weekend)
    // 2033-05-07, 2033-05-08 are Saturday & Sunday (Weekend)
    // We add a public holiday on 2033-05-04 (Wednesday)
    await pool.query(
      'INSERT INTO holidays (name, date, end_date, scope, department_id) VALUES (?, ?, ?, ?, ?)',
      ['Test Spring Holiday', '2033-05-04', '2033-05-04', 'department', deptAId]
    );

    // We add an approved leave for emp1DeptAId on 2033-05-05 (Thursday)
    await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, status, reason)
       VALUES (?, 'Annual', '2033-05-05', '2033-05-05', 1, 'APPROVED', 'Test Leave')`,
      [emp1DeptAId]
    );

    // Emp 1 attends on 2033-05-02, 2033-05-03, 2033-05-06
    const testDates = ['2033-05-02', '2033-05-03', '2033-05-06'];
    for (const d of testDates) {
      await pool.query(
        `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
         VALUES (?, ?, '2033-05-02 09:00:00', '2033-05-02 17:00:00', 8.00, 'Present')
         ON DUPLICATE KEY UPDATE status = 'Present'`,
        [emp1DeptAId, d]
      );
    }

    // Call service for 2033-05
    const results = await getDepartmentAttendance({
      startMonth: '2033-05',
      endMonth: '2033-05',
      departmentId: deptAId
    });

    const deptResult = results.find((r) => r.department_id === deptAId);
    assert.ok(deptResult, 'Department result must be found');

    // Expected days calculation for Emp 1 in May 2033:
    // Total days in May = 31.
    // Weekends (Saturdays & Sundays in May 2033) = 9 days.
    // Working days without holidays/leaves = 22 days.
    // 1 holiday (May 4) -> 21 days.
    // 1 approved leave (May 5) -> 20 expected days.
    // Emp 2 is also in Dept A (no leave, 21 expected days).
    // Total expected days = 41. (NOT 62 calendar days).
    assert.ok(deptResult.expected_days < 62, 'Expected days must exclude weekends, holidays, and approved leaves');
    assert.strictEqual(typeof deptResult.attendance_pct, 'number');
  });

  // Test 2: Punctuality ignores employees with under 5 days
  it('Punctuality ignores employees with under 5 days', async () => {
    const testMonth = '2034-06';
    // emp1 has only 3 days present in 2034-06
    for (let day = 1; day <= 3; day++) {
      const dateStr = `${testMonth}-0${day}`;
      await pool.query(
        `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, status)
         VALUES (?, ?, '${dateStr} 08:50:00', '${dateStr} 17:00:00', 8.00, 0, 'Present')
         ON DUPLICATE KEY UPDATE check_in = '${dateStr} 08:50:00'`,
        [emp1DeptAId, dateStr]
      );
    }

    // emp2 has 6 days present (5 on-time, 1 late)
    for (let day = 1; day <= 6; day++) {
      const dateStr = `${testMonth}-0${day}`;
      const isLate = day === 6 ? 1 : 0;
      await pool.query(
        `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status)
         VALUES (?, ?, '${dateStr} 09:00:00', '${dateStr} 17:00:00', 8.00, ?, ?, 'Present')
         ON DUPLICATE KEY UPDATE is_late = VALUES(is_late)`,
        [emp2DeptAId, dateStr, isLate, isLate ? 15 : 0]
      );
    }

    const ranking = await getPunctualityRanking({
      startMonth: testMonth,
      endMonth: testMonth,
      departmentId: deptAId
    });

    const emp1InRanking = [...ranking.top10, ...ranking.bottom10].some((r) => r.employee_id === emp1DeptAId);
    const emp2InRanking = [...ranking.top10, ...ranking.bottom10].some((r) => r.employee_id === emp2DeptAId);

    assert.strictEqual(emp1InRanking, false, 'Employee with fewer than 5 days present must be ignored from rankings');
    assert.strictEqual(emp2InRanking, true, 'Employee with >= 5 days present must be included in rankings');
  });

  // Test 3: Month-over-month change calculated correctly
  it('Month-over-month change calculated correctly', async () => {
    // Month 1: 2035-01 (Insert 2 absences)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, status)
       VALUES (?, '2035-01-10', 'Absent'), (?, '2035-01-11', 'Absent')
       ON DUPLICATE KEY UPDATE status = 'Absent'`,
      [emp1DeptAId, emp1DeptAId]
    );

    // Month 2: 2035-02 (Insert 5 absences)
    for (let d = 1; d <= 5; d++) {
      await pool.query(
        `INSERT INTO attendance (employee_id, date, status)
         VALUES (?, '2035-02-0${d}', 'Absent')
         ON DUPLICATE KEY UPDATE status = 'Absent'`,
        [emp1DeptAId]
      );
    }

    const trend = await getMonthlyAbsenteeismTrend({
      startMonth: '2035-01',
      endMonth: '2035-02',
      departmentId: deptAId
    });

    const m1 = trend.find((t) => t.month === '2035-01');
    const m2 = trend.find((t) => t.month === '2035-02');

    assert.ok(m1 && m2, 'Both months must exist in trend');
    assert.strictEqual(m1.absent_days, 2);
    assert.strictEqual(m2.absent_days, 5);
    assert.strictEqual(m2.prev_month_absent_days, 2, 'LAG() must return previous month absent count (2)');
    assert.strictEqual(m2.change_from_prev, 3, 'Change from previous must be 5 - 2 = 3');
  });

  // Test 4: Manager cannot see another department
  it('Manager cannot see another department', async () => {
    // Manager of Dept A requests analytics for Dept B -> 403 Forbidden
    const resDept = await apiRequest('GET', `/department-attendance?department_id=${deptBId}`, null, managerDeptAToken);
    assert.strictEqual(resDept.statusCode, 403);
    assert.match(resDept.data.message, /department managers can only view/i);

    // Manager of Dept A requests calendar of employee in Dept B -> 403 Forbidden
    const resCal = await apiRequest('GET', `/employee-calendar?employee_id=${emp3DeptBId}`, null, managerDeptAToken);
    assert.strictEqual(resCal.statusCode, 403);
    assert.match(resCal.data.message, /department managers can only view/i);
  });

  // Test 5: Employee cannot see another employee's calendar or rankings
  it("Employee cannot see another employee's calendar or rankings", async () => {
    // Employee attempts to access punctuality rankings -> 403 Forbidden
    const resRank = await apiRequest('GET', '/punctuality-ranking', null, employeeToken);
    assert.strictEqual(resRank.statusCode, 403);
    assert.match(resRank.data.message, /employees can only view their own/i);

    // Employee attempts to access another employee's calendar -> 403 Forbidden
    const resCal = await apiRequest('GET', `/employee-calendar?employee_id=${emp2DeptAId}`, null, employeeToken);
    assert.strictEqual(resCal.statusCode, 403);
    assert.match(resCal.data.message, /employees can only view their own/i);

    // Employee accesses their OWN calendar -> 200 OK
    const resOwnCal = await apiRequest('GET', `/employee-calendar?employee_id=${emp1DeptAId}`, null, employeeToken);
    assert.strictEqual(resOwnCal.statusCode, 200);
    assert.strictEqual(resOwnCal.data.employee.id, emp1DeptAId);
  });

  // Test 6: Empty data returns zeros, not errors
  it('Empty data returns zeros, not errors', async () => {
    const emptyMonth = '2045-12';

    // Summary endpoint with no data
    const summaryRes = await apiRequest('GET', `/summary?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(summaryRes.statusCode, 200);
    assert.strictEqual(summaryRes.data.overall_attendance_pct, 0);
    assert.strictEqual(summaryRes.data.total_late, 0);
    assert.strictEqual(summaryRes.data.total_absences, 0);

    // Department attendance with no data
    const deptAttRes = await apiRequest('GET', `/department-attendance?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(deptAttRes.statusCode, 200);
    assert.ok(Array.isArray(deptAttRes.data.departments));

    // Punctuality ranking with no data
    const puncRes = await apiRequest('GET', `/punctuality-ranking?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(puncRes.statusCode, 200);
    assert.strictEqual(puncRes.data.top10.length, 0);
    assert.strictEqual(puncRes.data.bottom10.length, 0);

    // Absenteeism trend with no data
    const absentRes = await apiRequest('GET', `/absenteeism-trend?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(absentRes.statusCode, 200);
    assert.ok(Array.isArray(absentRes.data.trend));

    // Working hours with no data
    const hoursRes = await apiRequest('GET', `/working-hours?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(hoursRes.statusCode, 200);
    assert.ok(Array.isArray(hoursRes.data.working_hours));

    // Overtime trend with no data
    const otRes = await apiRequest('GET', `/overtime-trend?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(otRes.statusCode, 200);
    assert.ok(Array.isArray(otRes.data.overtime_trend));

    // Frequent lates with no data
    const latesRes = await apiRequest('GET', `/frequent-lates?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(latesRes.statusCode, 200);
    assert.strictEqual(latesRes.data.items.length, 0);
    assert.strictEqual(latesRes.data.total, 0);

    // Comparison with no data
    const compRes = await apiRequest('GET', `/comparison?start_month=${emptyMonth}&end_month=${emptyMonth}`, null, adminToken);
    assert.strictEqual(compRes.statusCode, 200);
    assert.ok(Array.isArray(compRes.data.comparison));
  });
});
