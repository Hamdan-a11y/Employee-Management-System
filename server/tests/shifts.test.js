const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const {
  formatDate,
  getEmployeeShift,
  getDefaultShift,
  checkAssignmentOverlap,
  calculateLateStatus,
  calculateWorkingHoursAndShortDay,
  calculateRotationShift,
  assignShiftToEmployee,
  assignShiftToDepartment,
  closeAssignment
} = require('../services/shiftService');

describe('Feature: Advanced Shift Management & Attendance Integration Tests', () => {
  let testDeptId;
  let testEmp1Id;
  let testEmp2Id;
  let morningShiftId;
  let eveningShiftId;
  let nightShiftId;
  let flexibleShiftId;
  let rotationId;

  before(async () => {
    // 1. Create a test department
    const [deptRes] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`Test Shift Dept ${Date.now()}`, 5]
    );
    testDeptId = deptRes.insertId;

    // 2. Create test employees in that department
    const [emp1Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      ['Shift Tester One', `shift.tester1.${Date.now()}@example.com`, '1234567890', testDeptId, 'Engineer']
    );
    testEmp1Id = emp1Res.insertId;

    const [emp2Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status)
       VALUES (?, ?, ?, ?, ?, 'Active')`,
      ['Shift Tester Two', `shift.tester2.${Date.now()}@example.com`, '0987654321', testDeptId, 'Technician']
    );
    testEmp2Id = emp2Res.insertId;

    // 3. Create test shifts
    const [mRes] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
       VALUES ('Test Morning Shift', 'morning', '09:00:00', '17:00:00', 15, 60, 480, TRUE, FALSE)`
    );
    morningShiftId = mRes.insertId;

    const [eRes] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
       VALUES ('Test Evening Shift', 'evening', '16:00:00', '00:00:00', 15, 45, 480, TRUE, FALSE)`
    );
    eveningShiftId = eRes.insertId;

    const [nRes] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
       VALUES ('Test Night Shift', 'night', '22:00:00', '06:00:00', 15, 30, 480, TRUE, FALSE)`
    );
    nightShiftId = nRes.insertId;

    const [fRes] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
       VALUES ('Test Flexible Shift', 'flexible', NULL, NULL, 0, 60, 480, TRUE, FALSE)`
    );
    flexibleShiftId = fRes.insertId;

    // 4. Create a 3-week rotation pattern
    const [rotRes] = await pool.query(
      'INSERT INTO shift_rotations (name, description) VALUES (?, ?)',
      ['Test 3-Week Cycle', 'Morning -> Evening -> Night rotation']
    );
    rotationId = rotRes.insertId;

    await pool.query(
      `INSERT INTO shift_rotation_steps (rotation_id, week_number, shift_id)
       VALUES (?, 1, ?), (?, 2, ?), (?, 3, ?)`,
      [rotationId, morningShiftId, rotationId, eveningShiftId, rotationId, nightShiftId]
    );
  });

  after(async () => {
    // Cleanup test data
    if (testEmp1Id) {
      await pool.query('DELETE FROM attendance WHERE employee_id IN (?, ?)', [testEmp1Id, testEmp2Id]);
      await pool.query('DELETE FROM employee_shift_assignments WHERE employee_id IN (?, ?)', [testEmp1Id, testEmp2Id]);
      await pool.query('DELETE FROM employees WHERE id IN (?, ?)', [testEmp1Id, testEmp2Id]);
    }
    if (rotationId) {
      await pool.query('DELETE FROM shift_rotation_steps WHERE rotation_id = ?', [rotationId]);
      await pool.query('DELETE FROM shift_rotations WHERE id = ?', [rotationId]);
    }
    if (morningShiftId) {
      await pool.query('DELETE FROM shifts WHERE id IN (?, ?, ?, ?)', [
        morningShiftId,
        eveningShiftId,
        nightShiftId,
        flexibleShiftId
      ]);
    }
    if (testDeptId) {
      await pool.query('DELETE FROM departments WHERE id = ?', [testDeptId]);
    }
    await pool.end();
  });

  // TEST 1: No-shift default
  it('1. No-shift default: should return configurable default shift when employee has no assignment', async () => {
    const shift = await getEmployeeShift(testEmp1Id, '2026-11-20');
    assert.ok(shift, 'Shift should be resolved');
    assert.strictEqual(shift.source, 'default', 'Source should be default');
    assert.ok(shift.name, 'Shift should have a name');
  });

  // TEST 2: Late with grace period
  it('2. Late with grace period: check-in within grace is on-time; after grace is marked late with accurate minutes', async () => {
    const morningShift = {
      type: 'morning',
      start_time: '09:00:00',
      grace_minutes: 15
    };

    // Case A: 09:10 (within 15m grace)
    const onTimeCheckIn = new Date('2026-11-20T09:10:00');
    const resA = calculateLateStatus(onTimeCheckIn, morningShift);
    assert.strictEqual(resA.isLate, false, 'Check-in at 09:10 should not be late');
    assert.strictEqual(resA.lateMinutes, 0);
    assert.strictEqual(resA.status, 'Present');

    // Case B: Exactly at grace limit 09:15:00
    const exactGraceCheckIn = new Date('2026-11-20T09:15:00');
    const resB = calculateLateStatus(exactGraceCheckIn, morningShift);
    assert.strictEqual(resB.isLate, false, 'Check-in at 09:15:00 should not be late');

    // Case C: 09:25:00 (10 minutes after grace, 25 minutes after shift start)
    const lateCheckIn = new Date('2026-11-20T09:25:00');
    const resC = calculateLateStatus(lateCheckIn, morningShift);
    assert.strictEqual(resC.isLate, true, 'Check-in at 09:25 should be late');
    assert.strictEqual(resC.lateMinutes, 25, 'Late minutes should be calculated from shift start');
    assert.strictEqual(resC.status, 'Late');
  });

  // TEST 3: Night shift crossing midnight
  it('3. Night shift crossing midnight: end time earlier than start time, crosses_midnight is true, hours calculate across midnight', async () => {
    const [nightRows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [nightShiftId]);
    const nightShift = nightRows[0];
    const crossesMidnight = nightShift.type === 'night' || (nightShift.end_time < nightShift.start_time);
    assert.strictEqual(crossesMidnight, true, 'Night shift must cross midnight');

    // Check-in at 22:00 on Day 1, Check-out at 06:15 on Day 2 (8h 15m total, 30 min break -> 7.75h = 465 mins < 480m min)
    const checkIn = new Date('2026-11-20T22:00:00');
    const checkOut = new Date('2026-11-21T06:15:00');
    const { totalHours, breakMinutes, isShortDay } = calculateWorkingHoursAndShortDay(checkIn, checkOut, nightShift);

    assert.strictEqual(breakMinutes, 30, 'Break minutes should be deducted');
    assert.strictEqual(totalHours, 7.75, 'Total working hours should be 7.75');
    assert.strictEqual(isShortDay, true, '465 mins is under 480 min minimum, so isShortDay must be true');

    // When working full 8 hours (check-out at 06:30 -> 8.5h - 0.5h break = 8.0h = 480 mins)
    const fullCheckOut = new Date('2026-11-21T06:30:00');
    const fullWork = calculateWorkingHoursAndShortDay(checkIn, fullCheckOut, nightShift);
    assert.strictEqual(fullWork.totalHours, 8.0);
    assert.strictEqual(fullWork.isShortDay, false, 'Full 8 hours meets minimum');
  });

  // TEST 4: Flexible shift
  it('4. Flexible shift: never marked late on check-in, only minimum working hours apply', async () => {
    const flexibleShift = {
      type: 'flexible',
      start_time: null,
      end_time: null,
      break_minutes: 60,
      min_working_minutes: 480 // 8 hours
    };

    // Even if check-in is at 14:00, flexible shift is never late
    const lateCheckIn = new Date('2026-11-20T14:00:00');
    const lateStatus = calculateLateStatus(lateCheckIn, flexibleShift);
    assert.strictEqual(lateStatus.isLate, false, 'Flexible shifts are never late on check-in');
    assert.strictEqual(lateStatus.lateMinutes, 0);

    // Short day check: 5 hours total - 1 hour break = 4 hours effective (240 mins < 480 mins min working)
    const checkIn = new Date('2026-11-20T09:00:00');
    const earlyCheckOut = new Date('2026-11-20T14:00:00');
    const workStats = calculateWorkingHoursAndShortDay(checkIn, earlyCheckOut, flexibleShift);
    assert.strictEqual(workStats.totalHours, 4.0, '5h - 1h break = 4h working time');
    assert.strictEqual(workStats.isShortDay, true, '4 hours is under 480 min minimum, should flag short day');
  });

  // TEST 5: Overlapping assignment blocked
  it('5. Overlapping assignment blocked: rejects overlapping date ranges for the same employee', async () => {
    // Assign shift from 2026-12-01 to 2026-12-15
    await assignShiftToEmployee({
      employeeId: testEmp1Id,
      shiftId: morningShiftId,
      startDate: '2026-12-01',
      endDate: '2026-12-15',
      notes: 'Initial assignment'
    });

    // Try to assign overlapping shift from 2026-12-10 to 2026-12-20
    await assert.rejects(
      async () => {
        await assignShiftToEmployee({
          employeeId: testEmp1Id,
          shiftId: eveningShiftId,
          startDate: '2026-12-10',
          endDate: '2026-12-20'
        });
      },
      /overlapping assignment exists/i,
      'Should reject overlapping shift assignment'
    );

    // Try to assign open-ended shift starting inside existing assignment
    await assert.rejects(
      async () => {
        await assignShiftToEmployee({
          employeeId: testEmp1Id,
          shiftId: eveningShiftId,
          startDate: '2026-12-05'
        });
      },
      /overlapping assignment exists/i,
      'Should reject open-ended overlap'
    );

    // Non-overlapping assignment (2026-12-16 to 2026-12-31) should SUCCEED
    const nonOverlap = await assignShiftToEmployee({
      employeeId: testEmp1Id,
      shiftId: eveningShiftId,
      startDate: '2026-12-16',
      endDate: '2026-12-31'
    });
    assert.ok(nonOverlap.assignmentId, 'Non-overlapping assignment should succeed');
  });

  // TEST 6: Rotation calculation
  it('6. Rotation calculation: calculates exact weekly shift across repeating cycles', async () => {
    // 3-Week Cycle: Week 1 Morning, Week 2 Evening, Week 3 Night
    const rotStartDate = '2026-12-01'; // Tuesday

    // Day 0 to 6 (Week 1)
    const week1Shift = await calculateRotationShift(rotationId, rotStartDate, '2026-12-03');
    assert.strictEqual(week1Shift.id, morningShiftId, 'Week 1 should be Morning Shift');
    assert.strictEqual(week1Shift.rotation_week, 1);

    // Day 7 to 13 (Week 2)
    const week2Shift = await calculateRotationShift(rotationId, rotStartDate, '2026-12-09');
    assert.strictEqual(week2Shift.id, eveningShiftId, 'Week 2 should be Evening Shift');
    assert.strictEqual(week2Shift.rotation_week, 2);

    // Day 14 to 20 (Week 3)
    const week3Shift = await calculateRotationShift(rotationId, rotStartDate, '2026-12-16');
    assert.strictEqual(week3Shift.id, nightShiftId, 'Week 3 should be Night Shift');
    assert.strictEqual(week3Shift.rotation_week, 3);

    // Day 21 (Week 4 -> repeats Week 1!)
    const week4Shift = await calculateRotationShift(rotationId, rotStartDate, '2026-12-22');
    assert.strictEqual(week4Shift.id, morningShiftId, 'Week 4 should cycle back to Week 1 Morning Shift');
    assert.strictEqual(week4Shift.rotation_week, 1);
  });

  // TEST 7: Department assignment
  it('7. Department assignment: creates separate assignment row per active employee inside a transaction', async () => {
    // Assign department shift from 2027-01-01 to 2027-01-31
    const resDept = await assignShiftToDepartment({
      departmentId: testDeptId,
      shiftId: morningShiftId,
      startDate: '2027-01-01',
      endDate: '2027-01-31'
    });

    assert.strictEqual(resDept.totalAssigned, 2, 'Should assign to both active employees in department');

    // Verify both employees now have their own individual assignment row
    const [emp1Assign] = await pool.query(
      'SELECT * FROM employee_shift_assignments WHERE employee_id = ? AND start_date = "2027-01-01"',
      [testEmp1Id]
    );
    assert.strictEqual(emp1Assign.length, 1, 'Employee 1 should have their own assignment row');
    assert.strictEqual(emp1Assign[0].shift_id, morningShiftId);

    const [emp2Assign] = await pool.query(
      'SELECT * FROM employee_shift_assignments WHERE employee_id = ? AND start_date = "2027-01-01"',
      [testEmp2Id]
    );
    assert.strictEqual(emp2Assign.length, 1, 'Employee 2 should have their own assignment row');
    assert.strictEqual(emp2Assign[0].shift_id, morningShiftId);

    // Verify closing an assignment (Requirement 2: Never edit or delete, close it)
    const closed = await closeAssignment({
      assignmentId: emp1Assign[0].id,
      endDate: '2027-01-15'
    });
    assert.strictEqual(closed.end_date, '2027-01-15', 'End date should be updated to 2027-01-15');

    // Verify getEmployeeShift on 2027-01-10 returns morning shift
    const midShift = await getEmployeeShift(testEmp1Id, '2027-01-10');
    assert.strictEqual(midShift.id, morningShiftId);

    // Verify getEmployeeShift on 2027-01-20 (after closed end date) falls back to default
    const afterClosedShift = await getEmployeeShift(testEmp1Id, '2027-01-20');
    assert.strictEqual(afterClosedShift.source, 'default');
  });
});
