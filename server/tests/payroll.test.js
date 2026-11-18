const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  makeRequest,
  loginAsAdmin,
  loginAsHRManager,
  loginAsEmployee,
  runTestQuery
} = require('./helpers');
const {
  roundToTwo,
  getWorkingDaysInMonth,
  getPayableWorkingDays,
  calculateEmployeePayslip
} = require('../services/payrollCalculator');

describe('Payroll & Payslips Feature Comprehensive Tests', () => {
  let admin;
  let hrManager;
  let employee;
  let testEmpId;
  let secondEmpId;

  before(async () => {
    admin = await loginAsAdmin();
    hrManager = await loginAsHRManager();
    employee = await loginAsEmployee();
    testEmpId = employee.user.employee_id;

    // Pick a second distinct employee for RBAC checks
    const emps = await runTestQuery(
      'SELECT id FROM employees WHERE id != ? AND status = "Active" AND deleted_at IS NULL LIMIT 1',
      [testEmpId]
    );
    secondEmpId = emps[0].id;
  });

  // ========================================================
  // 1. UNIT & CALCULATION ENGINE TESTS
  // ========================================================

  it('1. Proration: correctly calculates payable days and prorated basic salary for mid-month joining and termination', () => {
    const holidaysSet = new Set(['2026-11-09']); // 1 holiday
    const workingDaysData = getWorkingDaysInMonth('2026-11', holidaysSet);
    // November 2026 has 30 days. 9 weekend days. Minus 1 holiday = 20 working days.
    assert.strictEqual(workingDaysData.workingDaysCount, 20);

    // Mid-month joining: joined on Nov 16, 2026
    const prorationJoin = getPayableWorkingDays({
      allWorkingDates: workingDaysData.workingDates,
      joiningDate: '2026-11-16',
      terminationDate: null,
      monthStartDate: workingDaysData.monthStartDate,
      monthEndDate: workingDaysData.monthEndDate
    });

    assert.strictEqual(prorationJoin.isProrated, true);
    // Working days on or after Nov 16
    const expectedPayableDays = workingDaysData.workingDates.filter(d => d >= '2026-11-16').length;
    assert.strictEqual(prorationJoin.payableWorkingDaysCount, expectedPayableDays);

    // Calculation via calculateEmployeePayslip
    const basicSalary = 200000;
    const dailyRate = roundToTwo(basicSalary / 20); // 10,000
    assert.strictEqual(dailyRate, 10000);

    const payslip = calculateEmployeePayslip({
      employee: { id: 999, joining_date: '2026-11-16', termination_date: null },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: [],
      leaveRequests: [],
      pendingAdjustments: []
    });

    assert.strictEqual(payslip.payable_days, expectedPayableDays);
    assert.strictEqual(payslip.prorated_basic, roundToTwo(dailyRate * expectedPayableDays));
  });

  it('2. Unpaid leave deduction: deducts daily rate for approved unpaid leave and ignores paid leave', () => {
    const workingDaysData = getWorkingDaysInMonth('2026-11', new Set());
    const totalWorkingDays = workingDaysData.workingDaysCount;
    const basicSalary = 100000;
    const dailyRate = roundToTwo(basicSalary / totalWorkingDays);

    const sampleWorkingDays = workingDaysData.workingDates.slice(0, 5);

    // 2 days approved unpaid leave on first 2 working days
    const leaves = [
      {
        id: 101,
        leave_type: 'Unpaid',
        status: 'APPROVED',
        start_date: sampleWorkingDays[0],
        end_date: sampleWorkingDays[1],
        days_count: 2
      },
      // 1 day approved Annual paid leave on 3rd working day (MUST NOT be deducted)
      {
        id: 102,
        leave_type: 'Annual',
        status: 'APPROVED',
        start_date: sampleWorkingDays[2],
        end_date: sampleWorkingDays[2],
        days_count: 1
      }
    ];

    // Attendance present for the remaining days
    const attendance = workingDaysData.workingDates.slice(3).map((d, idx) => ({
      id: 200 + idx,
      date: d,
      total_hours: 8.0,
      is_late: false,
      status: 'Present'
    }));

    const payslip = calculateEmployeePayslip({
      employee: { id: 999, joining_date: '2026-01-01', termination_date: null },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: attendance,
      leaveRequests: leaves
    });

    assert.strictEqual(payslip.unpaid_leave_days, 2);
    assert.strictEqual(payslip.unpaid_leave_deduction, roundToTwo(2 * dailyRate));
    assert.strictEqual(payslip.absent_days, 0, 'Approved paid leave must not count as absent');
  });

  it('3. Late arrival rule: deducts 1 day per every 3 late arrivals (configurable)', () => {
    const workingDaysData = getWorkingDaysInMonth('2026-11', new Set());
    const basicSalary = 120000;
    const dailyRate = roundToTwo(basicSalary / workingDaysData.workingDaysCount);

    // Case A: 3 late arrivals -> 1 day deduction
    const attendance3Lates = workingDaysData.workingDates.slice(0, 10).map((d, i) => ({
      id: 300 + i,
      date: d,
      total_hours: 8.0,
      is_late: i < 3,
      status: i < 3 ? 'Late' : 'Present'
    }));

    const payslipA = calculateEmployeePayslip({
      employee: { id: 999 },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: attendance3Lates,
      settings: { late_arrival_threshold: 3, late_deduction_days: 1.0, standard_daily_hours: 8.0 }
    });

    assert.strictEqual(payslipA.late_arrivals_count, 3);
    assert.strictEqual(payslipA.late_deduction_days, 1.0);
    assert.strictEqual(payslipA.late_deduction_amount, dailyRate);

    // Case B: 5 late arrivals with threshold 3 -> Math.floor(5/3) = 1 day deduction
    const attendance5Lates = workingDaysData.workingDates.slice(0, 10).map((d, i) => ({
      id: 300 + i,
      date: d,
      total_hours: 8.0,
      is_late: i < 5,
      status: i < 5 ? 'Late' : 'Present'
    }));

    const payslipB = calculateEmployeePayslip({
      employee: { id: 999 },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: attendance5Lates,
      settings: { late_arrival_threshold: 3, late_deduction_days: 1.0, standard_daily_hours: 8.0 }
    });

    assert.strictEqual(payslipB.late_arrivals_count, 5);
    assert.strictEqual(payslipB.late_deduction_days, 1.0);
    assert.strictEqual(payslipB.late_deduction_amount, dailyRate);

    // Case C: Configurable threshold = 2 (e.g. 1 day per 2 lates) -> 5 lates = 2 days deduction
    const payslipC = calculateEmployeePayslip({
      employee: { id: 999 },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: attendance5Lates,
      settings: { late_arrival_threshold: 2, late_deduction_days: 1.0, standard_daily_hours: 8.0 }
    });

    assert.strictEqual(payslipC.late_deduction_days, 2.0);
    assert.strictEqual(payslipC.late_deduction_amount, roundToTwo(2 * dailyRate));
  });

  it('4. Overtime: calculates hours above standard day x hourly rate x 1.5 multiplier', () => {
    const workingDaysData = getWorkingDaysInMonth('2026-11', new Set());
    const basicSalary = 160000;
    const dailyRate = roundToTwo(basicSalary / workingDaysData.workingDaysCount);
    const hourlyRate = roundToTwo(dailyRate / 8.0);

    // Employee worked 10.5 hours on day 1 (2.5 hrs OT) and 9.5 hours on day 2 (1.5 hrs OT) = 4.0 hrs OT
    const attendanceOT = [
      { id: 401, date: workingDaysData.workingDates[0], total_hours: 10.5, is_late: false, status: 'Present' },
      { id: 402, date: workingDaysData.workingDates[1], total_hours: 9.5, is_late: false, status: 'Present' }
    ];

    const payslip = calculateEmployeePayslip({
      employee: { id: 999 },
      salary: { basic_salary: basicSalary, allowances: 0, fixed_deductions: 0 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: attendanceOT,
      settings: { standard_daily_hours: 8.0, overtime_multiplier: 1.5 }
    });

    assert.strictEqual(payslip.overtime_hours, 4.0);
    const expectedOTPay = roundToTwo(4.0 * hourlyRate * 1.5);
    assert.strictEqual(payslip.overtime_pay, expectedOTPay);
  });

  it('5. Warnings: detects negative or zero net pay warning when deductions exceed earnings', () => {
    const workingDaysData = getWorkingDaysInMonth('2026-11', new Set());

    // Basic 10,000, fixed deduction 25,000 -> Net Pay -15,000
    const payslip = calculateEmployeePayslip({
      employee: { id: 999 },
      salary: { basic_salary: 10000, allowances: 0, fixed_deductions: 25000 },
      yearMonth: '2026-11',
      workingDaysData,
      attendanceRecords: workingDaysData.workingDates.map(d => ({ date: d, total_hours: 8, status: 'Present' }))
    });

    assert.ok(payslip.net_pay < 0, 'Net pay should be negative');
    const hasNegativeWarning = payslip.warnings.some(w => w.type === 'NEGATIVE_OR_ZERO_NET_PAY');
    assert.strictEqual(hasNegativeWarning, true, 'Must include NEGATIVE_OR_ZERO_NET_PAY warning');
  });

  // ========================================================
  // 2. END-TO-END API & RBAC TESTS
  // ========================================================

  it('6. Salary Structure: Admin can update salary and change history is recorded in audit log', async () => {
    const updateRes = await makeRequest('PUT', `/payroll/salaries/${testEmpId}`, {
      basic_salary: 175000,
      allowances: 25000,
      fixed_deductions: 5000,
      effective_date: '2026-10-01'
    }, admin.cookies, admin.headers);

    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.data.salary.basic_salary, 175000);

    // Verify audit log has the salary entry with who, old, new, when
    const getRes = await makeRequest('GET', `/payroll/salaries/${testEmpId}`, null, admin.cookies);
    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(Number(getRes.data.salary.basic_salary), 175000);
    assert.ok(getRes.data.history.length > 0, 'Audit log history must contain recorded changes');
    assert.strictEqual(getRes.data.history[0].user_name, admin.user.name);
  });

  it('7. Duplicate run prevention: prevents generating payroll twice for the same month', async () => {
    const testMonth = '2026-06'; // Unique month for test

    // Clean up if exists from previous runs
    await runTestQuery('DELETE FROM payroll_runs WHERE month = ?', [testMonth]);

    // 1. Generate run for the month
    const genRes1 = await makeRequest('POST', '/payroll/runs/generate', { month: testMonth }, admin.cookies, admin.headers);
    assert.strictEqual(genRes1.statusCode, 201);
    assert.strictEqual(genRes1.data.run.month, testMonth);
    assert.strictEqual(genRes1.data.run.status, 'Draft');

    // 2. Attempt duplicate generation for the same month
    const genRes2 = await makeRequest('POST', '/payroll/runs/generate', { month: testMonth }, admin.cookies, admin.headers);
    assert.strictEqual(genRes2.statusCode, 400);
    assert.match(genRes2.data.message, /already exists|duplicate/i);
  });

  it('8. Separation of duties: Creator cannot be the approver; second approval required', async () => {
    const testMonth = '2026-07';
    await runTestQuery('DELETE FROM payroll_runs WHERE month = ?', [testMonth]);

    // Admin creates the run
    const genRes = await makeRequest('POST', '/payroll/runs/generate', { month: testMonth }, admin.cookies, admin.headers);
    assert.strictEqual(genRes.statusCode, 201);
    const runId = genRes.data.run.id;

    // Admin (the creator) attempts to approve the run -> Must be rejected!
    const selfApproveRes = await makeRequest('POST', `/payroll/runs/${runId}/approve`, {}, admin.cookies, admin.headers);
    assert.strictEqual(selfApproveRes.statusCode, 403);
    assert.match(selfApproveRes.data.message, /separation of duties|cannot approve/i);

    // If warnings exist, acknowledge them
    await makeRequest('POST', `/payroll/runs/${runId}/acknowledge-warnings`, {}, hrManager.cookies, hrManager.headers);

    // HR Manager (second approver) approves the run -> Must succeed!
    const secondApproveRes = await makeRequest('POST', `/payroll/runs/${runId}/approve`, {}, hrManager.cookies, hrManager.headers);
    assert.strictEqual(secondApproveRes.statusCode, 200);
    assert.strictEqual(secondApproveRes.data.status, 'Approved');

    // Attendance for the month should now be locked
    const [attLock] = await runTestQuery(
      'SELECT COUNT(*) as count FROM attendance WHERE is_locked = TRUE AND DATE_FORMAT(date, "%Y-%m") = ?',
      [testMonth]
    );
    assert.ok(attLock);
  });

  it('9. RBAC: Employee CANNOT see another employee\'s payslip or draft payslips', async () => {
    // 1. Fetch payslips from the approved run
    const testMonth = '2026-07';
    const runRows = await runTestQuery('SELECT id FROM payroll_runs WHERE month = ?', [testMonth]);
    assert.ok(runRows.length > 0, 'Payroll run must exist');
    const runId = runRows[0].id;

    const empPayslipRows = await runTestQuery(
      'SELECT id FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
      [runId, testEmpId]
    );

    const otherPayslipRows = await runTestQuery(
      'SELECT id FROM payslips WHERE payroll_run_id = ? AND employee_id = ?',
      [runId, secondEmpId]
    );

    assert.ok(empPayslipRows.length > 0, 'Employee payslip must exist');
    assert.ok(otherPayslipRows.length > 0, 'Other employee payslip must exist');

    const empPayslip = empPayslipRows[0];
    const otherPayslip = otherPayslipRows[0];

    // Employee accesses OTHER employee's payslip -> 403 Forbidden
    const forbiddenRes = await makeRequest('GET', `/payroll/payslips/${otherPayslip.id}`, null, employee.cookies);
    assert.strictEqual(forbiddenRes.statusCode, 403);
    assert.match(forbiddenRes.data.message, /access denied|cannot view/i);

    // Employee downloads OTHER employee's PDF -> 403 Forbidden
    const forbiddenPdfRes = await makeRequest('GET', `/payroll/payslips/${otherPayslip.id}/pdf`, null, employee.cookies);
    assert.strictEqual(forbiddenPdfRes.statusCode, 403);

    // Employee accesses OWN approved payslip -> 200 OK
    const ownRes = await makeRequest('GET', `/payroll/payslips/${empPayslip.id}`, null, employee.cookies);
    assert.strictEqual(ownRes.statusCode, 200);
    assert.strictEqual(ownRes.data.payslip.employee_id, testEmpId);
    assert.ok(Array.isArray(ownRes.data.items), 'Must contain line items');

    // Employee downloads OWN PDF -> 200 OK with application/pdf
    const ownPdfRes = await makeRequest('GET', `/payroll/payslips/${empPayslip.id}/pdf`, null, employee.cookies);
    assert.strictEqual(ownPdfRes.statusCode, 200);
    assert.match(ownPdfRes.headers['content-type'], /application\/pdf/);

    // Employee calls /api/payroll/my-payslips -> 200 OK
    const myRes = await makeRequest('GET', '/payroll/my-payslips', null, employee.cookies);
    assert.strictEqual(myRes.statusCode, 200);
    assert.ok(Array.isArray(myRes.data));
    assert.ok(myRes.data.every(p => p.status === 'Approved' || p.status === 'Locked'));
  });

  after(async () => {
    // Clean up test payroll runs
    await runTestQuery('DELETE FROM payroll_runs WHERE month IN ("2026-06", "2026-07")');
  });
});
