const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const { runJob, getKarachiDate, getKarachiTime } = require('../jobs/runner');
const { executeMarkAbsent, hasShiftEnded } = require('../jobs/markAbsent');
const { executeMissingCheckout, isMissingCheckout } = require('../jobs/missingCheckout');
const { catchUpOnStartup } = require('../jobs/scheduler');

describe('Automated Background Jobs & Runner Tests', () => {
  let deptId;
  let dept2Id;
  let emp1Id; // regular employee
  let emp2HolidayId; // employee with holiday
  let emp3LeaveId; // employee with leave
  let emp4PresentId; // employee with check-in
  let empNightId; // night shift employee
  let morningShiftId;
  let nightShiftId;
  let testHolidayId;
  let testLeaveId;

  const testDate = '2025-05-12'; // Monday
  const nextDate = '2025-05-13'; // Tuesday

  before(async () => {
    // 1. Create Departments
    const [dRes1] = await pool.query(
      "INSERT INTO departments (name) VALUES ('Background Jobs Test Dept 1')"
    );
    deptId = dRes1.insertId;

    const [dRes2] = await pool.query(
      "INSERT INTO departments (name) VALUES ('Background Jobs Test Dept 2')"
    );
    dept2Id = dRes2.insertId;

    // 2. Create Employees
    const [e1] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES ('Job Worker Regular', ?, '03009990001', ?, 'Dev', 'Active', '2024-01-01')`,
      [`job_reg_${Date.now()}@example.com`, deptId]
    );
    emp1Id = e1.insertId;

    const [e2] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES ('Job Worker Holiday', ?, '03009990002', ?, 'Dev', 'Active', '2024-01-01')`,
      [`job_hol_${Date.now()}@example.com`, dept2Id]
    );
    emp2HolidayId = e2.insertId;

    const [e3] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES ('Job Worker Leave', ?, '03009990003', ?, 'Dev', 'Active', '2024-01-01')`,
      [`job_lev_${Date.now()}@example.com`, deptId]
    );
    emp3LeaveId = e3.insertId;

    const [e4] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES ('Job Worker Present', ?, '03009990004', ?, 'Dev', 'Active', '2024-01-01')`,
      [`job_prs_${Date.now()}@example.com`, deptId]
    );
    emp4PresentId = e4.insertId;

    const [eNight] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES ('Job Worker Night', ?, '03009990005', ?, 'Night Guard', 'Active', '2024-01-01')`,
      [`job_ngt_${Date.now()}@example.com`, deptId]
    );
    empNightId = eNight.insertId;

    // 3. Create Morning & Night Shifts
    const [s1] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active)
       VALUES ('Jobs Morning Shift', 'morning', '09:00:00', '17:00:00', 15, 60, 480, 1)`
    );
    morningShiftId = s1.insertId;

    const [s2] = await pool.query(
      `INSERT INTO shifts (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active)
       VALUES ('Jobs Night Shift', 'night', '22:00:00', '06:00:00', 15, 60, 480, 1)`
    );
    nightShiftId = s2.insertId;

    // Assign morning shift to emp1, emp2, emp3, emp4
    for (const eid of [emp1Id, emp2HolidayId, emp3LeaveId, emp4PresentId]) {
      await pool.query(
        `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
         VALUES (?, ?, '2025-01-01', '2025-12-31')`,
        [eid, morningShiftId]
      );
    }

    // Assign night shift to empNightId
    await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_id, start_date, end_date)
       VALUES (?, ?, '2025-01-01', '2025-12-31')`,
      [empNightId, nightShiftId]
    );

    // 4. Create Holiday for emp2 on testDate (scoped to dept2Id only)
    const [hRes] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('Jobs Test Holiday', ?, NULL, 'department', ?)`,
      [testDate, dept2Id]
    );
    testHolidayId = hRes.insertId;

    // 5. Create Approved Leave for emp3 on testDate
    const [lRes] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, status, reason)
       VALUES (?, 'Annual', ?, ?, 1.0, 'APPROVED', 'Doctor Appointment')`,
      [emp3LeaveId, testDate, testDate]
    );
    testLeaveId = lRes.insertId;

    // 6. Create existing Attendance record for emp4 on testDate
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, status, total_hours)
       VALUES (?, ?, '2025-05-12 09:05:00', '2025-05-12 17:10:00', 'Present', 8.08)`,
      [emp4PresentId, testDate]
    );
  });

  after(async () => {
    // Cleanup
    await pool.query('DELETE FROM job_runs WHERE run_key LIKE "%test_%" OR run_key LIKE "%2025-05-%"');
    await pool.query('DELETE FROM daily_summaries WHERE date = ?', [testDate]);
    await pool.query('DELETE FROM attendance WHERE employee_id IN (?, ?, ?, ?, ?)', [
      emp1Id,
      emp2HolidayId,
      emp3LeaveId,
      emp4PresentId,
      empNightId
    ]);
    await pool.query('DELETE FROM leave_requests WHERE id = ?', [testLeaveId]);
    await pool.query('DELETE FROM holidays WHERE id = ?', [testHolidayId]);
    await pool.query('DELETE FROM employee_shift_assignments WHERE employee_id IN (?, ?, ?, ?, ?)', [
      emp1Id,
      emp2HolidayId,
      emp3LeaveId,
      emp4PresentId,
      empNightId
    ]);
    await pool.query('DELETE FROM shifts WHERE id IN (?, ?)', [morningShiftId, nightShiftId]);
    await pool.query('DELETE FROM employees WHERE id IN (?, ?, ?, ?, ?)', [
      emp1Id,
      emp2HolidayId,
      emp3LeaveId,
      emp4PresentId,
      empNightId
    ]);
    await pool.query('DELETE FROM departments WHERE id IN (?, ?)', [deptId, dept2Id]);
  });

  // Test 1: Duplicate run skipped
  it('1. duplicate run skipped: skips if run with same key already succeeded', async () => {
    const testKey = `test_dup:${Date.now()}`;
    let executionCount = 0;

    const mockJobFn = async () => {
      executionCount++;
      return 1;
    };

    // First run: should execute
    const res1 = await runJob({
      jobName: 'test_job_dup',
      runKey: testKey,
      jobFn: mockJobFn
    });

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.skipped, false);
    assert.strictEqual(executionCount, 1);

    // Second run with same key: should be skipped
    const res2 = await runJob({
      jobName: 'test_job_dup',
      runKey: testKey,
      jobFn: mockJobFn,
      force: false
    });

    assert.strictEqual(res2.skipped, true);
    assert.strictEqual(res2.status, 'success');
    assert.strictEqual(executionCount, 1, 'Job function must not execute again on duplicate key');
  });

  // Test 2: Retry after failure
  it('2. retry after failure: retries up to 3 times on transient failures', async () => {
    const testKey = `test_retry:${Date.now()}`;
    let attemptsCount = 0;

    const flakyJobFn = async () => {
      attemptsCount++;
      if (attemptsCount < 3) {
        throw new Error(`Simulated transient error on attempt ${attemptsCount}`);
      }
      return 5;
    };

    const res = await runJob({
      jobName: 'test_flaky_job',
      runKey: testKey,
      jobFn: flakyJobFn,
      maxAttempts: 3,
      retryDelayMs: 20
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.attempts, 3);
    assert.strictEqual(res.processedCount, 5);

    // Verify logged in job_runs table
    const [rows] = await pool.query('SELECT * FROM job_runs WHERE run_key = ?', [testKey]);
    assert.strictEqual(rows[0].status, 'success');
    assert.strictEqual(rows[0].attempts, 3);
  });

  // Test 3: mark_absent skips holiday, leave, and already-marked records
  it('3. mark_absent skips holiday/leave/already-marked: marks only eligible absent employee', async () => {
    // Run mark absent for testDate
    const markedCount = await executeMarkAbsent({ date: testDate });

    // Verify employee 1 (regular working, no checkin, no leave, no holiday) is marked Absent
    const [att1] = await pool.query(
      'SELECT status FROM attendance WHERE employee_id = ? AND date = ?',
      [emp1Id, testDate]
    );
    assert.strictEqual(att1.length, 1);
    assert.strictEqual(att1[0].status, 'Absent');

    // Verify employee 2 (on public holiday) is NOT marked absent
    const [att2] = await pool.query(
      'SELECT status FROM attendance WHERE employee_id = ? AND date = ?',
      [emp2HolidayId, testDate]
    );
    assert.strictEqual(att2.length, 0, 'Holiday employee must not have an Absent record');

    // Verify employee 3 (on approved leave) is NOT marked absent
    const [att3] = await pool.query(
      'SELECT status FROM attendance WHERE employee_id = ? AND date = ?',
      [emp3LeaveId, testDate]
    );
    assert.strictEqual(att3.length, 0, 'Approved leave employee must not have an Absent record');

    // Verify employee 4 (already Present) remains Present without duplicate row
    const [att4] = await pool.query(
      'SELECT status FROM attendance WHERE employee_id = ? AND date = ?',
      [emp4PresentId, testDate]
    );
    assert.strictEqual(att4.length, 1);
    assert.strictEqual(att4[0].status, 'Present', 'Already present employee must remain Present');
  });

  // Test 4: Night shift mark_absent
  it('4. night shift mark_absent: night shift belongs to shift start date and ends next morning', () => {
    const nightShift = {
      type: 'night',
      crosses_midnight: true,
      start_time: '22:00:00',
      end_time: '06:00:00'
    };

    // When evaluated on the night the shift starts ('2025-05-12' at 23:30), shift has NOT ended yet
    const endedTonight = hasShiftEnded(nightShift, '2025-05-12', '2025-05-12', '23:30:00');
    assert.strictEqual(endedTonight, false, 'Night shift must not be marked absent on the night it starts');

    // When evaluated next morning before end time ('2025-05-13' at 05:30), shift has NOT ended yet
    const endedEarlyMorning = hasShiftEnded(nightShift, '2025-05-12', '2025-05-13', '05:30:00');
    assert.strictEqual(endedEarlyMorning, false, 'Night shift must not be marked absent before next morning end time');

    // When evaluated next morning AFTER end time ('2025-05-13' at 06:15), shift HAS ended
    const endedAfterMorning = hasShiftEnded(nightShift, '2025-05-12', '2025-05-13', '06:15:00');
    assert.strictEqual(endedAfterMorning, true, 'Night shift has ended after 06:00 on the following morning');
  });

  // Test 5: missing checkout detected
  it('5. missing checkout detected: detects and flags check-ins with no check-out past shift end + buffer', async () => {
    // Create attendance record with check-in at 09:00 but no check-out
    const checkinDate = '2025-05-14';
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, status, total_hours)
       VALUES (?, ?, '2025-05-14 09:00:00', NULL, 'Present', 0)
       ON DUPLICATE KEY UPDATE check_out = NULL`,
      [emp1Id, checkinDate]
    );

    // Shift is 09:00 - 17:00, buffer is 60m. For a past date, shift end + buffer has passed.
    const flaggedCount = await executeMissingCheckout({
      date: checkinDate,
      bufferMinutes: 60
    });

    assert.ok(flaggedCount >= 1, 'Should flag at least 1 missing checkout record');

    const [rows] = await pool.query(
      'SELECT is_missing_checkout, is_flagged_suspicious, suspicious_reason FROM attendance WHERE employee_id = ? AND date = ?',
      [emp1Id, checkinDate]
    );
    assert.strictEqual(rows[0].is_missing_checkout, 1);
    assert.strictEqual(rows[0].is_flagged_suspicious, 1);
    assert.match(rows[0].suspicious_reason, /Missing check-out/i);

    // Clean up
    await pool.query('DELETE FROM attendance WHERE employee_id = ? AND date = ?', [emp1Id, checkinDate]);
  });

  // Test 6: Catch-up after downtime
  it('6. catch-up after downtime: catches up missed scheduled jobs on server boot', async () => {
    // Call catchUpOnStartup()
    await catchUpOnStartup();

    // Verify job_runs contains entries for catch-up jobs
    const [runs] = await pool.query(
      "SELECT job_name, status FROM job_runs WHERE job_name IN ('daily_summary', 'mark_absent', 'missing_checkout', 'cleanup')"
    );

    assert.ok(runs.length >= 1, 'Catch-up should record executed jobs in job_runs');
    assert.ok(runs.some((r) => r.status === 'success' || r.status === 'running'));
  });
});
