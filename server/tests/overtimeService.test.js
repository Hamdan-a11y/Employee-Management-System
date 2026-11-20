const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const {
  calculateOvertime,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  recalculateOvertimeOnCorrection,
  getOvertimePolicy
} = require('../services/overtimeService');

describe('Feature: Overtime Management Core Service Tests', () => {
  let deptAId;
  let deptBId;
  let emp1Id;
  let emp2DeptBId;
  let managerEmpId;
  let managerUserId;

  let morningShiftId;
  let nightShiftId;
  let flexibleShiftId;
  let holidayId;

  // Dedicated test period in future: 2031-03
  // 2031-03-03 is Monday (Regular day)
  // 2031-03-08 is Saturday (Weekend)
  // 2031-03-09 is Sunday (Weekend)
  // 2031-03-10 is Monday (Night shift start)
  // 2031-03-12 is Wednesday (Holiday)
  const testMonth = '2031-03';

  before(async () => {
    try {
    // 1. Create Test Departments
    const [dResA] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`OT Test Dept A ${Date.now()}`, 10]
    );
    deptAId = dResA.insertId;

    const [dResB] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`OT Test Dept B ${Date.now()}`, 5]
    );
    deptBId = dResB.insertId;

    // 2. Create Employees
    const [eRes1] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES (?, ?, '03001234567', ?, 'Staff Developer', 'Active', '2030-01-01')`,
      ['OT Worker One', `ot1_${Date.now()}@example.com`, deptAId]
    );
    emp1Id = eRes1.insertId;

    const [eRes2] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES (?, ?, '03001234568', ?, 'Staff Designer', 'Active', '2030-01-01')`,
      ['OT Worker Two', `ot2_${Date.now()}@example.com`, deptBId]
    );
    emp2DeptBId = eRes2.insertId;

    const [eResM] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES (?, ?, '03001234569', ?, 'Department Lead', 'Active', '2030-01-01')`,
      ['OT Dept Manager', `otm_${Date.now()}@example.com`, deptAId]
    );
    managerEmpId = eResM.insertId;

    // Create Manager User
    const [uRes] = await pool.query(
      `INSERT INTO users (name, email, password, role, employee_id, department_id)
       VALUES (?, ?, 'hash123', 'department_manager', ?, ?)`,
      ['OT Dept Manager', `otm_user_${Date.now()}@example.com`, managerEmpId, deptAId]
    );
    managerUserId = uRes.insertId;

    // 3. Create Shifts
    const [s1] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active)
       VALUES ('OT Morning Shift', 'morning', '09:00:00', '17:00:00', 15, 0, 480, 1)`
    );
    morningShiftId = s1.insertId;

    const [s2] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active)
       VALUES ('OT Night Shift', 'night', '22:00:00', '06:00:00', 15, 0, 480, 1)`
    );
    nightShiftId = s2.insertId;

    const [s3] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active)
       VALUES ('OT Flexible Shift', 'flexible', NULL, NULL, 0, 0, 480, 1)`
    );
    flexibleShiftId = s3.insertId;

    // Assign morning shift to emp1 and emp2 by default for 2031
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
       VALUES (?, ?, '2031-01-01', '2031-12-31')`,
      [emp1Id, morningShiftId]
    );
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
       VALUES (?, ?, '2031-01-01', '2031-12-31')`,
      [emp2DeptBId, morningShiftId]
    );

    // 4. Create Public Holiday on 2031-03-12 (Wednesday)
    const [hRes] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('OT Test Holiday', '2031-03-12', NULL, 'all', NULL)`
    );
    holidayId = hRes.insertId;

    // 5. Seed Department-specific policy for Dept A
    await pool.query(
      `INSERT INTO overtime_policies (
        department_id,
        threshold_minutes,
        rounding_minutes,
        regular_multiplier,
        weekend_multiplier,
        holiday_multiplier,
        daily_cap_hours,
        monthly_cap_hours,
        approval_required,
        effective_date
      ) VALUES (?, 15, 15, 1.50, 2.00, 2.50, 4.00, 40.00, FALSE, '2031-01-01')`,
      [deptAId]
    );
    } catch (err) {
      console.error('ERROR IN BEFORE BLOCK:', err);
      throw err;
    }
  });

  after(async () => {
    // Cleanup
    await pool.query('DELETE FROM overtime_requests WHERE employee_id IN (?, ?, ?)', [emp1Id, emp2DeptBId, managerEmpId]);
    await pool.query('DELETE FROM overtime_policies WHERE department_id IN (?, ?)', [deptAId, deptBId]);
    await pool.query('DELETE FROM attendance WHERE employee_id IN (?, ?, ?)', [emp1Id, emp2DeptBId, managerEmpId]);
    await pool.query('DELETE FROM employee_shift_assignments WHERE employee_id IN (?, ?, ?)', [emp1Id, emp2DeptBId, managerEmpId]);
    await pool.query('DELETE FROM shifts WHERE id IN (?, ?, ?)', [morningShiftId, nightShiftId, flexibleShiftId]);
    await pool.query('DELETE FROM holidays WHERE id = ?', [holidayId]);
    await pool.query('DELETE FROM users WHERE id = ?', [managerUserId]);
    await pool.query('DELETE FROM employees WHERE id IN (?, ?, ?)', [emp1Id, emp2DeptBId, managerEmpId]);
    await pool.query('DELETE FROM departments WHERE id IN (?, ?)', [deptAId, deptBId]);
    await pool.query('DELETE FROM payroll_runs WHERE month = ?', [testMonth]);
  });

  // 1. Regular Day Overtime
  it('1. regular: calculates minutes worked beyond shift end on a regular day', async () => {
    const workDate = '2031-03-03'; // Monday
    // Shift is 09:00 - 17:00. Employee checks in 09:00 and checks out 19:00 (2 hrs / 120 mins overtime)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-03 09:00:00', '2031-03-03 19:00:00', 10.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 120);
    assert.strictEqual(result.day_type, 'regular');
    assert.strictEqual(result.multiplier, 1.50);
    assert.strictEqual(result.over_cap, false);
    assert.strictEqual(result.status, 'approved'); // policy has approval_required = false
  });

  // 2. Threshold
  it('2. threshold: rejects overtime when extra minutes are below threshold', async () => {
    const workDate = '2031-03-04'; // Tuesday
    // Checks out at 17:10 (10 mins beyond shift end, below 15 mins threshold)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-04 09:00:00', '2031-03-04 17:10:00', 8.17, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.minutes, 0);
  });

  // 3. Rounding
  it('3. rounding: rounds down overtime minutes to policy interval (15 mins)', async () => {
    const workDate = '2031-03-05'; // Wednesday
    // Checks out at 17:50 (50 mins extra; 50 rounded down to 15m intervals = 45 mins)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-05 09:00:00', '2031-03-05 17:50:00', 8.83, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 45);
  });

  // 4. Weekend
  it('4. weekend: all worked time on weekends is counted as overtime with weekend multiplier', async () => {
    const workDate = '2031-03-08'; // Saturday
    // Checks in 09:00, checks out 13:00 (4 hours = 240 minutes)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-08 09:00:00', '2031-03-08 13:00:00', 4.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 240);
    assert.strictEqual(result.day_type, 'weekend');
    assert.strictEqual(result.multiplier, 2.00);
  });

  // 5. Holiday
  it('5. holiday: all worked time on a public holiday is counted as overtime with holiday multiplier', async () => {
    const workDate = '2031-03-12'; // Wednesday (configured holiday)
    // Checks in 10:00, checks out 14:00 (4 hours = 240 minutes)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-12 10:00:00', '2031-03-12 14:00:00', 4.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 240);
    assert.strictEqual(result.day_type, 'holiday');
    assert.strictEqual(result.multiplier, 2.50);
  });

  // 6. Night Shift Crossing Midnight
  it('6. night shift: calculates overtime beyond next morning shift end for night shifts crossing midnight', async () => {
    const workDate = '2031-03-10'; // Monday night shift (22:00 -> 06:00 next day)
    // Override assignment for this date to nightShiftId
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
       VALUES (?, ?, '2031-03-10', '2031-03-10')`,
      [emp1Id, nightShiftId]
    );

    // Checked in 22:00, checked out next morning 08:30 (2.5 hours / 150 mins past 06:00)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-10 22:00:00', '2031-03-11 08:30:00', 10.50, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 150);
    assert.strictEqual(result.day_type, 'regular');
  });

  // 7. Flexible Shift
  it('7. flexible: calculates overtime beyond minimum working hours for flexible shifts', async () => {
    const workDate = '2031-03-14'; // Friday
    // Assign flexible shift
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
       VALUES (?, ?, '2031-03-14', '2031-03-14')`,
      [emp1Id, flexibleShiftId]
    );

    // Worked 600 minutes (10.0 hours). Flexible min is 480 mins (8 hours) -> 120 mins overtime
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-14 08:00:00', '2031-03-14 18:00:00', 10.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 120);
  });

  // 8. Daily Cap
  it('8. daily cap: sets over_cap = true when overtime minutes exceed daily cap (4h / 240 mins)', async () => {
    const workDate = '2031-03-17'; // Monday
    // Checks out 6 hours past 17:00 (at 23:00 = 360 mins overtime)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-17 09:00:00', '2031-03-17 23:00:00', 14.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 360);
    assert.strictEqual(Boolean(result.over_cap), true);
  });

  // 9. Monthly Cap
  it('9. monthly cap: sets over_cap = true when monthly overtime exceeds monthly cap (40h / 2400 mins)', async () => {
    const workDate = '2031-03-18'; // Tuesday
    // Seed 2300 minutes of prior overtime in this month
    await pool.query(
      `INSERT INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status, over_cap)
       VALUES (?, '2031-03-01', 2300, 'regular', 1.50, 'approved', 0)
       ON DUPLICATE KEY UPDATE minutes = 2300, status = 'approved'`,
      [emp1Id]
    );

    // New overtime: 3 hours = 180 mins. 2300 + 180 = 2480 mins > 2400 mins (40h)
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-18 09:00:00', '2031-03-18 20:00:00', 11.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    const result = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(result.eligible, true);
    assert.strictEqual(result.minutes, 180);
    assert.strictEqual(Boolean(result.over_cap), true);
  });

  // 10. Duplicate Handling
  it('10. duplicate: duplicate overtime calculations on same work date update row without crashing', async () => {
    const workDate = '2031-03-19';
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, ?, '2031-03-19 09:00:00', '2031-03-19 18:00:00', 9.00, 'Present')
       ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
      [emp1Id, workDate]
    );

    // First calculation: 60 mins
    const res1 = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(res1.minutes, 60);

    // Change attendance checkout to 19:00 (120 mins)
    await pool.query(
      `UPDATE attendance SET check_out = '2031-03-19 19:00:00', total_hours = 10.00 WHERE employee_id = ? AND date = ?`,
      [emp1Id, workDate]
    );

    // Second calculation: must succeed and update row to 120 mins without duplicate key error
    const res2 = await calculateOvertime(emp1Id, workDate);
    assert.strictEqual(res2.minutes, 120);

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt, minutes FROM overtime_requests WHERE employee_id = ? AND work_date = ? GROUP BY minutes',
      [emp1Id, workDate]
    );
    assert.strictEqual(rows[0].cnt, 1);
    assert.strictEqual(rows[0].minutes, 120);
  });

  // 11. Self-Approval
  it('11. self-approval: rejects manager approving their own overtime request', async () => {
    // Create an overtime request for managerEmpId
    const [reqRes] = await pool.query(
      `INSERT INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status, over_cap)
       VALUES (?, '2031-03-21', 120, 'regular', 1.50, 'pending', 0)
       ON DUPLICATE KEY UPDATE status = 'pending'`,
      [managerEmpId]
    );
    const otReqId = reqRes.insertId || (await pool.query('SELECT id FROM overtime_requests WHERE employee_id = ? AND work_date = "2031-03-21"', [managerEmpId]))[0][0].id;

    // Manager user attempts to approve their own request
    const reviewerUser = {
      id: managerUserId,
      employee_id: managerEmpId,
      role: 'department_manager',
      department_id: deptAId
    };

    await assert.rejects(
      async () => {
        await approveOvertimeRequest({
          requestId: otReqId,
          reviewerUser
        });
      },
      /Self-approval is strictly forbidden/i
    );
  });

  // 12. Department Restriction
  it('12. department restriction: rejects manager approving overtime for an employee outside their department', async () => {
    // Create a pending overtime request for emp2DeptBId (in Dept B)
    const [reqRes] = await pool.query(
      `INSERT INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status, over_cap)
       VALUES (?, '2031-03-22', 120, 'regular', 1.50, 'pending', 0)
       ON DUPLICATE KEY UPDATE status = 'pending'`,
      [emp2DeptBId]
    );
    const otReqId = reqRes.insertId || (await pool.query('SELECT id FROM overtime_requests WHERE employee_id = ? AND work_date = "2031-03-22"', [emp2DeptBId]))[0][0].id;

    // Manager of Dept A attempts to approve Dept B employee request
    const reviewerUser = {
      id: managerUserId,
      employee_id: managerEmpId,
      role: 'department_manager',
      department_id: deptAId // Dept A, not Dept B
    };

    await assert.rejects(
      async () => {
        await approveOvertimeRequest({
          requestId: otReqId,
          reviewerUser
        });
      },
      /Access denied: Department managers can only approve overtime for employees in their own department/i
    );
  });

  // 13. Closed Month
  it('13. closed month: prevents modifying or approving overtime in a closed payroll month', async () => {
    const workDate = '2031-03-25';
    // Create a pending overtime request in 2031-03
    const [reqRes] = await pool.query(
      `INSERT INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status, over_cap)
       VALUES (?, ?, 120, 'regular', 1.50, 'pending', 0)
       ON DUPLICATE KEY UPDATE status = 'pending'`,
      [emp1Id, workDate]
    );
    const otReqId = reqRes.insertId || (await pool.query('SELECT id FROM overtime_requests WHERE employee_id = ? AND work_date = ?', [emp1Id, workDate]))[0][0].id;

    // Close the payroll month 2031-03 by inserting a Locked payroll run
    await pool.query(
      `INSERT INTO payroll_runs (month, status, working_days, created_by)
       VALUES ('2031-03', 'Locked', 22, 1)
       ON DUPLICATE KEY UPDATE status = 'Locked'`
    );

    const adminUser = {
      id: 1,
      role: 'admin',
      employee_id: null,
      department_id: null
    };

    // Approval must be rejected due to closed month
    await assert.rejects(
      async () => {
        await approveOvertimeRequest({
          requestId: otReqId,
          reviewerUser: adminUser
        });
      },
      /Cannot modify overtime for a closed\/locked payroll month/i
    );

    // Recalculation on correction must also reject due to closed month
    await assert.rejects(
      async () => {
        await recalculateOvertimeOnCorrection(emp1Id, workDate);
      },
      /closed\/locked payroll month/i
    );
  });
});
