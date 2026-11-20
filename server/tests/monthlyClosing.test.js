const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const {
  assertPeriodOpen,
  isPeriodClosed,
  getClosingChecklist,
  closePeriod,
  reopenPeriod,
  getPeriodDetails,
} = require('../services/periodService');
const { approveOvertimeRequest } = require('../services/overtimeService');
const { executeMarkAbsent } = require('../jobs/markAbsent');

describe('Feature: Attendance Locking & Monthly Closing Tests', () => {
  let testDeptId;
  let testEmpId;
  let adminUserId = 1;
  let hrUserId = 2;

  // Dedicated past test month (guaranteed ended)
  const pastMonth = '2024-03';
  // Dedicated future test month (guaranteed not ended)
  const futureMonth = '2035-12';

  before(async () => {
    // 1. Create Test Department
    const [dRes] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`Closing Dept ${Date.now()}`, 5]
    );
    testDeptId = dRes.insertId;

    // 2. Create Test Employee
    const [eRes] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status, joining_date)
       VALUES (?, ?, '03001234567', ?, 'QA Engineer', 'Active', '2023-01-01')`,
      ['Closing Tester', `closing_${Date.now()}@test.com`, testDeptId]
    );
    testEmpId = eRes.insertId;

    // 3. Resolve Admin and HR user IDs or use fallbacks
    const [adminRows] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminRows.length > 0) adminUserId = adminRows[0].id;

    const [hrRows] = await pool.query("SELECT id FROM users WHERE role = 'hr_manager' LIMIT 1");
    if (hrRows.length > 0) hrUserId = hrRows[0].id;

    // Clean up any test month period data from previous runs
    await pool.query('DELETE FROM payroll_attendance_summary WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM period_history WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM attendance_periods WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM attendance WHERE date LIKE ? OR date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM overtime_requests WHERE work_date LIKE ? OR work_date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM attendance_corrections WHERE date LIKE ? OR date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM payroll_runs WHERE month IN (?, ?)', [pastMonth, futureMonth]);
  });

  after(async () => {
    // Clean up test data
    await pool.query('DELETE FROM payroll_attendance_summary WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM period_history WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM attendance_periods WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    await pool.query('DELETE FROM attendance WHERE date LIKE ? OR date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM overtime_requests WHERE work_date LIKE ? OR work_date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM attendance_corrections WHERE date LIKE ? OR date LIKE ?', [`${pastMonth}%`, `${futureMonth}%`]);
    await pool.query('DELETE FROM payroll_runs WHERE month IN (?, ?)', [pastMonth, futureMonth]);
    if (testEmpId) await pool.query('DELETE FROM employees WHERE id = ?', [testEmpId]);
    if (testDeptId) await pool.query('DELETE FROM departments WHERE id = ?', [testDeptId]);
  });

  it('1. Close before the month ends is blocked', async () => {
    await assert.rejects(
      async () => {
        await closePeriod({
          monthStr: futureMonth,
          userId: adminUserId,
          userRole: 'admin',
        });
      },
      (err) => {
        assert.match(err.message, /Cannot close a month before it has ended/i);
        return true;
      }
    );
  });

  it('2. Close blocked with pending items; Admin override works and is logged', async () => {
    // Insert a pending correction in pastMonth
    await pool.query(
      `INSERT INTO attendance_corrections (employee_id, date, requested_check_in, requested_check_out, reason, status)
       VALUES (?, '${pastMonth}-15', '${pastMonth}-15 09:00:00', '${pastMonth}-15 17:00:00', 'Forgot badge', 'PENDING')`,
      [testEmpId]
    );

    // Verify checklist reports pending items
    const checklist = await getClosingChecklist(pastMonth);
    assert.ok(checklist.totalPending > 0, 'Checklist should detect pending correction');

    // Attempt close without override -> must fail
    await assert.rejects(
      async () => {
        await closePeriod({
          monthStr: pastMonth,
          userId: hrUserId,
          userRole: 'hr_manager',
          override: false,
        });
      },
      (err) => {
        assert.match(err.message, /Cannot close month: There are pending checklist items/i);
        return true;
      }
    );

    // HR attempts override -> must fail (Admin only)
    await assert.rejects(
      async () => {
        await closePeriod({
          monthStr: pastMonth,
          userId: hrUserId,
          userRole: 'hr_manager',
          override: true,
          reason: 'HR override attempt',
        });
      },
      (err) => {
        assert.match(err.message, /Only Admin can override pending items/i);
        return true;
      }
    );

    // Admin attempts override without reason -> must fail
    await assert.rejects(
      async () => {
        await closePeriod({
          monthStr: pastMonth,
          userId: adminUserId,
          userRole: 'admin',
          override: true,
          reason: '',
        });
      },
      (err) => {
        assert.match(err.message, /mandatory reason is required/i);
        return true;
      }
    );

    // Admin override with valid reason -> succeeds!
    const closeRes = await closePeriod({
      monthStr: pastMonth,
      userId: adminUserId,
      userRole: 'admin',
      override: true,
      reason: 'Director authorized early close for payroll audit',
    });

    assert.strictEqual(closeRes.status, 'closed');
    assert.strictEqual(closeRes.action, 'override_close');

    // Verify period_history logged action override_close
    const [historyRows] = await pool.query(
      'SELECT * FROM period_history WHERE month = ? ORDER BY id DESC LIMIT 1',
      [pastMonth]
    );
    assert.strictEqual(historyRows.length, 1);
    assert.strictEqual(historyRows[0].action, 'override_close');
    assert.match(historyRows[0].reason, /Director authorized early close/i);
  });

  it('3. Summary generated correctly in one transaction', async () => {
    // Check that payroll_attendance_summary rows were generated
    const [summaries] = await pool.query(
      'SELECT * FROM payroll_attendance_summary WHERE month = ? AND employee_id = ?',
      [pastMonth, testEmpId]
    );
    assert.strictEqual(summaries.length, 1);
    const summary = summaries[0];
    assert.strictEqual(summary.month, pastMonth);
    assert.strictEqual(summary.employee_id, testEmpId);
    assert.ok(summary.working_days > 0, 'Working days should be > 0');
  });

  it('4. Write blocked in a closed month (check-in, correction, overtime approval, job)', async () => {
    // 4a. assertPeriodOpen throws on closed month
    await assert.rejects(
      async () => {
        await assertPeriodOpen(`${pastMonth}-10`);
      },
      (err) => {
        assert.match(err.message, /Month is closed/i);
        return true;
      }
    );

    // 4b. Overtime approval blocked
    // Create an overtime request in pastMonth directly
    const [otRes] = await pool.query(
      `INSERT INTO overtime_requests (employee_id, work_date, minutes, day_type, multiplier, status)
       VALUES (?, '${pastMonth}-10', 120, 'regular', 1.5, 'pending')`,
      [testEmpId]
    );
    const otId = otRes.insertId;

    await assert.rejects(
      async () => {
        await approveOvertimeRequest({
          requestId: otId,
          reviewerUser: { id: adminUserId, employee_id: null },
          approvedMinutes: 120,
        });
      },
      (err) => {
        assert.match(err.message, /Month is closed/i);
        return true;
      }
    );

    // 4c. Job blocked
    await assert.rejects(
      async () => {
        await executeMarkAbsent({ date: `${pastMonth}-10` });
      },
      (err) => {
        assert.match(err.message, /Month is closed/i);
        return true;
      }
    );
  });

  it('5. Database trigger rejects direct changes in a closed month', async () => {
    // Direct INSERT into attendance on closed month must be rejected by trigger trg_attendance_before_insert
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO attendance (employee_id, date, check_in, status)
           VALUES (?, '${pastMonth}-10', '${pastMonth}-10 09:00:00', 'Present')`,
          [testEmpId]
        );
      },
      (err) => {
        assert.match(err.message, /attendance changes blocked by trigger/i);
        return true;
      }
    );
  });

  it('6. Reopen needs a reason, is Admin only, and is blocked if payroll is approved', async () => {
    // Non-admin attempt -> blocked
    await assert.rejects(
      async () => {
        await reopenPeriod({
          monthStr: pastMonth,
          userId: hrUserId,
          userRole: 'hr_manager',
          reason: 'Valid reopen reason for testing',
        });
      },
      (err) => {
        assert.match(err.message, /Only Admin can reopen a closed month/i);
        return true;
      }
    );

    // Admin with short reason (< 10 chars) -> blocked
    await assert.rejects(
      async () => {
        await reopenPeriod({
          monthStr: pastMonth,
          userId: adminUserId,
          userRole: 'admin',
          reason: 'Too short',
        });
      },
      (err) => {
        assert.match(err.message, /minimum 10 characters/i);
        return true;
      }
    );

    // Blocked if payroll for month is Approved
    await pool.query(
      `INSERT INTO payroll_runs (month, status, working_days, total_employees, total_gross, total_deductions, total_net, created_by)
       VALUES (?, 'Approved', 22, 1, 50000, 0, 50000, ?)`,
      [pastMonth, adminUserId]
    );

    await assert.rejects(
      async () => {
        await reopenPeriod({
          monthStr: pastMonth,
          userId: adminUserId,
          userRole: 'admin',
          reason: 'Legitimate reason for reopening month',
        });
      },
      (err) => {
        assert.match(err.message, /Payroll for this month is approved or locked/i);
        return true;
      }
    );

    // Clean up dummy payroll run
    await pool.query('DELETE FROM payroll_runs WHERE month = ?', [pastMonth]);
  });

  it('7. Reopen deletes the summary and close regenerates it', async () => {
    // Admin reopens with valid reason
    const reopenRes = await reopenPeriod({
      monthStr: pastMonth,
      userId: adminUserId,
      userRole: 'admin',
      reason: 'Reopening to resolve employee attendance punch discrepancy',
    });

    assert.strictEqual(reopenRes.status, 'open');

    // Summaries deleted
    const [summariesAfterReopen] = await pool.query(
      'SELECT COUNT(*) as cnt FROM payroll_attendance_summary WHERE month = ?',
      [pastMonth]
    );
    assert.strictEqual(summariesAfterReopen[0].cnt, 0, 'Summaries should be deleted upon reopen');

    // History contains reopened entry
    const [reopenHistory] = await pool.query(
      'SELECT * FROM period_history WHERE month = ? AND action = "reopened"',
      [pastMonth]
    );
    assert.strictEqual(reopenHistory.length, 1);

    // Re-close regenerates summaries
    await closePeriod({
      monthStr: pastMonth,
      userId: adminUserId,
      userRole: 'admin',
      override: true,
      reason: 'Re-closing month after resolving discrepancy',
    });

    const [summariesRegenerated] = await pool.query(
      'SELECT COUNT(*) as cnt FROM payroll_attendance_summary WHERE month = ?',
      [pastMonth]
    );
    assert.ok(summariesRegenerated[0].cnt > 0, 'Summaries should be regenerated upon re-closing');
  });
});
