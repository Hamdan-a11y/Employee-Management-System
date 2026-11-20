const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const {
  formatDate,
  getDayType,
  getWorkingDays,
  getAbsentDays,
  getWorkingWeekConfig,
  recalculateApprovedLeavesForHoliday
} = require('../services/calendarService');

describe('Feature: Holiday & Working Week Calendar Integration Tests', () => {
  let deptAId;
  let deptBId;
  let emp1Id;
  let emp2MidJoinerId;
  let emp3DeptBId;

  let singleHolidayId;
  let multiHolidayId;
  let deptHolidayId;
  let approvedLeaveId;
  let pendingLeaveId;
  let halfDayLeaveId;

  // Use a fixed historical/isolated month: 2029-06
  const testMonth = '2029-06';
  // 2029-06-01 is a Friday
  // 2029-06-02 is Saturday, 2029-06-03 is Sunday
  // 2029-06-04 is Monday, 2029-06-05 is Tuesday, 2029-06-06 is Wednesday

  before(async () => {
    // 1. Create two test departments
    const [dResA] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`Test Cal Dept A ${Date.now()}`, 10]
    );
    deptAId = dResA.insertId;

    const [dResB] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`Test Cal Dept B ${Date.now()}`, 5]
    );
    deptBId = dResB.insertId;

    // 2. Create employees
    // emp1: Full-time in Dept A, joined 2029-01-01
    const [e1Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date, created_at)
       VALUES (?, ?, '1112223334', ?, 'Software Engineer', 'Active', '2029-01-01', '2029-01-01')`,
      ['Cal Tester Regular', `cal.reg.${Date.now()}@example.com`, deptAId]
    );
    emp1Id = e1Res.insertId;

    // emp2: Mid-month joiner in Dept A, joined 2029-06-15
    const [e2Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date, created_at)
       VALUES (?, ?, '2223334445', ?, 'Junior Engineer', 'Active', '2029-06-15', '2029-06-15')`,
      ['Cal Tester MidJoiner', `cal.mid.${Date.now()}@example.com`, deptAId]
    );
    emp2MidJoinerId = e2Res.insertId;

    // emp3: Employee in Dept B, joined 2029-01-01
    const [e3Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date, created_at)
       VALUES (?, ?, '3334445556', ?, 'Sales Lead', 'Active', '2029-01-01', '2029-01-01')`,
      ['Cal Tester DeptB', `cal.deptb.${Date.now()}@example.com`, deptBId]
    );
    emp3DeptBId = e3Res.insertId;

    // 3. Initialize leave balances for 2029
    await pool.query(
      `INSERT INTO leave_balances (employee_id, year, annual_total, annual_used)
       VALUES (?, 2029, 20.0, 0.0), (?, 2029, 20.0, 0.0), (?, 2029, 20.0, 0.0)`,
      [emp1Id, emp2MidJoinerId, emp3DeptBId]
    );

    // 4. Create holidays in 2029-06
    // Holiday 1: Single-day company holiday on 2029-06-05 (Tuesday)
    const [h1Res] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('Mid-Year Celebration', '2029-06-05', NULL, 'all', NULL)`
    );
    singleHolidayId = h1Res.insertId;

    // Holiday 2: Multi-day holiday on 2029-06-11 to 2029-06-13 (Monday to Wednesday, 3 days)
    const [h2Res] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('Festival Holidays', '2029-06-11', '2029-06-13', 'all', NULL)`
    );
    multiHolidayId = h2Res.insertId;

    // Holiday 3: Department B only holiday on 2029-06-18 (Monday)
    const [h3Res] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('Sales Summit Day', '2029-06-18', NULL, 'department', ?)`,
      [deptBId]
    );
    deptHolidayId = h3Res.insertId;

    // 5. Create Leave Requests for emp1
    // Approved leave on 2029-06-07 (Thursday)
    const [l1Res] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, is_half_day, reason, status)
       VALUES (?, 'Annual', '2029-06-07', '2029-06-07', 1.0, FALSE, 'Personal Errands', 'APPROVED')`,
      [emp1Id]
    );
    approvedLeaveId = l1Res.insertId;

    // Pending leave on 2029-06-08 (Friday) - NOT yet approved
    const [l2Res] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, is_half_day, reason, status)
       VALUES (?, 'Annual', '2029-06-08', '2029-06-08', 1.0, FALSE, 'Trip', 'PENDING')`,
      [emp1Id]
    );
    pendingLeaveId = l2Res.insertId;

    // Half-day approved leave on 2029-06-20 (Wednesday)
    const [l3Res] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, is_half_day, half_day_type, reason, status)
       VALUES (?, 'Annual', '2029-06-20', '2029-06-20', 0.5, TRUE, 'first_half', 'Doctor Visit', 'APPROVED')`,
      [emp1Id]
    );
    halfDayLeaveId = l3Res.insertId;

    // 6. Attendance punch: emp1 worked on holiday 2029-06-05
    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, status)
       VALUES (?, '2029-06-05', '2029-06-05 09:00:00', '2029-06-05 17:00:00', 8.0, 'Present')`,
      [emp1Id]
    );
  });

  after(async () => {
    try {
      if (approvedLeaveId) await pool.query('DELETE FROM leave_requests WHERE id IN (?, ?, ?)', [approvedLeaveId, pendingLeaveId, halfDayLeaveId]);
      await pool.query('DELETE FROM attendance WHERE employee_id IN (?, ?, ?)', [emp1Id, emp2MidJoinerId, emp3DeptBId]);
      await pool.query('DELETE FROM leave_balances WHERE employee_id IN (?, ?, ?)', [emp1Id, emp2MidJoinerId, emp3DeptBId]);
      await pool.query('DELETE FROM holidays WHERE id IN (?, ?, ?)', [singleHolidayId, multiHolidayId, deptHolidayId]);
      await pool.query('DELETE FROM employees WHERE id IN (?, ?, ?)', [emp1Id, emp2MidJoinerId, emp3DeptBId]);
      await pool.query('DELETE FROM departments WHERE id IN (?, ?)', [deptAId, deptBId]);
    } catch (err) {
      console.error('Error during cleanup:', err);
    } finally {
      await pool.end();
    }
  });

  // TEST 1: Holiday excluded from absence
  it('1. Holiday is excluded from absence calculation', async () => {
    // 2029-06-11 is a holiday (Festival Holidays). Emp1 did not punch in.
    const dayType = await getDayType(emp1Id, '2029-06-11');
    assert.strictEqual(dayType.dayType, 'holiday', 'Day must be classified as holiday');
    assert.strictEqual(dayType.isWorkingDay, false, 'Holiday is not a working day');
    assert.strictEqual(dayType.holiday.name, 'Festival Holidays');
  });

  // TEST 2: Weekend excluded from absence
  it('2. Weekend days (Saturday, Sunday) are excluded from absence calculation', async () => {
    // 2029-06-02 is Saturday, 2029-06-03 is Sunday
    const satDay = await getDayType(emp1Id, '2029-06-02');
    const sunDay = await getDayType(emp1Id, '2029-06-03');

    assert.strictEqual(satDay.dayType, 'weekend', 'Saturday must be classified as weekend');
    assert.strictEqual(satDay.isWorkingDay, false, 'Weekend is not a working day');
    assert.strictEqual(sunDay.dayType, 'weekend', 'Sunday must be classified as weekend');
    assert.strictEqual(sunDay.isWorkingDay, false, 'Weekend is not a working day');
  });

  // TEST 3: Approved leave excluded from absence
  it('3. Approved leave is excluded from absence calculation', async () => {
    // 2029-06-07 is Thursday, emp1 has APPROVED annual leave
    const dayType = await getDayType(emp1Id, '2029-06-07');
    assert.strictEqual(dayType.dayType, 'on_leave', 'Approved leave day must be classified as on_leave');
    assert.strictEqual(dayType.isWorkingDay, false, 'Full day on_leave is not counted as working/absence');
    assert.strictEqual(dayType.leave.id, approvedLeaveId);
  });

  // TEST 4: Pending leave NOT excluded from absence
  it('4. Pending leave request does NOT exclude day from working/absence', async () => {
    // 2029-06-08 is Friday, emp1 has PENDING annual leave (not approved)
    const dayType = await getDayType(emp1Id, '2029-06-08');
    assert.strictEqual(dayType.dayType, 'working', 'Pending leave must NOT classify day as on_leave');
    assert.strictEqual(dayType.isWorkingDay, true, 'Pending leave day remains a scheduled working day');
    assert.strictEqual(dayType.leave, null, 'Pending leave must not be treated as active leave');
  });

  // TEST 5: Leave day counting across a holiday
  it('5. Leave day counting skips weekends and public holidays accurately', async () => {
    // Request spanning 2029-06-01 (Fri) to 2029-06-06 (Wed):
    // Fri (working), Sat (weekend), Sun (weekend), Mon (working), Tue (holiday 06-05), Wed (working)
    // Total calendar days = 6.
    // Weekends = 2 (Sat, Sun).
    // Holidays = 1 (Tue 06-05).
    // Working days to deduct = 3 (Fri, Mon, Wed).
    const result = await getWorkingDays(emp1Id, '2029-06-01', '2029-06-06');
    assert.strictEqual(result.totalCalendarDays, 6, 'Total calendar span should be 6');
    assert.strictEqual(result.weekendDaysCount, 2, 'Weekend count should be 2');
    assert.strictEqual(result.holidaysCount, 1, 'Holidays count should be 1');
    assert.strictEqual(result.workingDaysCount, 3, 'Only 3 working days should be deducted');
    assert.ok(result.warnings.length > 0, 'Warnings should be surfaced explaining skipped days');
  });

  // TEST 6: Multi-day holiday coverage
  it('6. Multi-day holiday correctly covers every date in the span', async () => {
    // Festival Holidays spans 2029-06-11 to 2029-06-13 (Mon, Tue, Wed)
    const day1 = await getDayType(emp1Id, '2029-06-11');
    const day2 = await getDayType(emp1Id, '2029-06-12');
    const day3 = await getDayType(emp1Id, '2029-06-13');

    assert.strictEqual(day1.dayType, 'holiday', 'Day 1 of multi-day holiday must be holiday');
    assert.strictEqual(day2.dayType, 'holiday', 'Day 2 of multi-day holiday must be holiday');
    assert.strictEqual(day3.dayType, 'holiday', 'Day 3 of multi-day holiday must be holiday');
  });

  // TEST 7: Department-specific holiday
  it('7. Department-specific holiday applies only to employees in that department', async () => {
    // 2029-06-18 (Monday) is Sales Summit Day scoped to deptB
    // Emp1 is in Dept A -> should be regular working day
    const emp1Day = await getDayType(emp1Id, '2029-06-18');
    assert.strictEqual(emp1Day.dayType, 'working', 'Dept A staff should have regular working day');

    // Emp3 is in Dept B -> should be holiday
    const emp3Day = await getDayType(emp3DeptBId, '2029-06-18');
    assert.strictEqual(emp3Day.dayType, 'holiday', 'Dept B staff should have department holiday');
    assert.strictEqual(emp3Day.holiday.name, 'Sales Summit Day');
  });

  // TEST 8: Half-day leave
  it('8. Half-day leave counts as 0.5 days and is identified by getDayType', async () => {
    // 2029-06-20 (Wednesday) is a half-day approved leave for emp1
    const dayType = await getDayType(emp1Id, '2029-06-20');
    assert.strictEqual(dayType.dayType, 'half_day_leave', 'Day type must be half_day_leave');
    assert.strictEqual(dayType.isHalfDay, true, 'isHalfDay flag must be true');
    assert.strictEqual(dayType.halfDayType, 'first_half');
  });

  // TEST 9: Mid-month joiner active dates only
  it('9. Mid-month joiner is only counted for working/absence dates from joining date onwards', async () => {
    // Emp2 joined on 2029-06-15.
    // Days from 2029-06-01 to 2029-06-14 must NOT be counted as absent!
    const absentData = await getAbsentDays(emp2MidJoinerId, testMonth);
    assert.strictEqual(absentData.activeStartDate, '2029-06-15', 'Active start date must equal joining date');

    for (const absentDate of absentData.absentDates) {
      assert.ok(absentDate >= '2029-06-15', `Absent date ${absentDate} must be >= joining date 2029-06-15`);
    }
  });

  // TEST 10: Working on a holiday
  it('10. Employee who checks in on a holiday is marked as holiday_work, not absent', async () => {
    // Emp1 punched in on 2029-06-05 (Mid-Year Celebration holiday)
    const absentData = await getAbsentDays(emp1Id, testMonth);
    const workedHoliday = absentData.holidayWorkDates.find((h) => h.date === '2029-06-05');

    assert.ok(workedHoliday, 'Check-in on holiday must be recorded in holidayWorkDates');
    assert.strictEqual(workedHoliday.totalHours, 8.0, 'Recorded hours should match punch');
    assert.ok(!absentData.absentDates.includes('2029-06-05'), 'Holiday with punch must NOT be absent');
  });

  // TEST 11: Recalculation when a holiday is added after approval
  it('11. Adding a holiday after a leave was approved recalculates working days and restores balance', async () => {
    // Step A: Create an approved 3-day leave for emp3 from 2029-06-25 (Mon) to 2029-06-27 (Wed)
    // Currently no holidays on those dates -> 3 working days
    const [lRes] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES (?, 'Annual', '2029-06-25', '2029-06-27', 3.0, 'Pre-scheduled Retreat', 'APPROVED')`,
      [emp3DeptBId]
    );
    const leaveId = lRes.insertId;

    // Deduct 3 days from balance
    await pool.query(
      'UPDATE leave_balances SET annual_used = annual_used + 3.0 WHERE employee_id = ? AND year = 2029',
      [emp3DeptBId]
    );

    const [balBefore] = await pool.query(
      'SELECT annual_used FROM leave_balances WHERE employee_id = ? AND year = 2029',
      [emp3DeptBId]
    );
    const usedBefore = parseFloat(balBefore[0].annual_used);

    // Step B: Now a new national holiday is proclaimed on 2029-06-26 (Tuesday)
    const [newHolidayRes] = await pool.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES ('Special Foundation Day', '2029-06-26', NULL, 'all', NULL)`
    );
    const newHId = newHolidayRes.insertId;

    const holidayObj = {
      id: newHId,
      name: 'Special Foundation Day',
      date: '2029-06-26',
      end_date: null,
      scope: 'all',
      department_id: null
    };

    // Step C: Trigger recalculation
    const recResult = await recalculateApprovedLeavesForHoliday(holidayObj);
    assert.strictEqual(recResult.success, true);
    assert.ok(recResult.updatedCount >= 1, 'Should find and update the overlapping approved leave');

    // Step D: Verify leave request days_count was reduced from 3.0 to 2.0
    const [updatedLeave] = await pool.query('SELECT days_count FROM leave_requests WHERE id = ?', [leaveId]);
    assert.strictEqual(parseFloat(updatedLeave[0].days_count), 2.0, 'Days count must be reduced from 3 to 2');

    // Step E: Verify 1.0 day was restored to leave balance
    const [balAfter] = await pool.query(
      'SELECT annual_used FROM leave_balances WHERE employee_id = ? AND year = 2029',
      [emp3DeptBId]
    );
    const usedAfter = parseFloat(balAfter[0].annual_used);
    assert.strictEqual(usedAfter, usedBefore - 1.0, 'Leave balance must have 1.0 day restored');

    // Cleanup
    await pool.query('DELETE FROM leave_requests WHERE id = ?', [leaveId]);
    await pool.query('DELETE FROM holidays WHERE id = ?', [newHId]);
  });
});
