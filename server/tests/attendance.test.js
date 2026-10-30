const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin, loginAsEmployee, runTestQuery } = require('./helpers');

describe('Feature 16: Employee Attendance Management Tests', () => {
  let admin;
  let employee;
  let testEmpId;
  let correctionId;

  it('should authenticate Admin and Employee users', async () => {
    admin = await loginAsAdmin();
    assert.ok(admin.cookies);

    employee = await loginAsEmployee();
    assert.ok(employee.cookies);
    testEmpId = employee.user.employee_id;
    assert.ok(testEmpId, 'Employee should have linked employee_id');

    // Clean up any test attendance for this employee for today to ensure idempotent tests
    await runTestQuery('DELETE FROM attendance_corrections WHERE employee_id = ?', [testEmpId]);
    await runTestQuery('DELETE FROM attendance WHERE employee_id = ? AND date = CURDATE()', [testEmpId]);
  });

  it('GET /api/attendance/today should return not checked in initially', async () => {
    const res = await makeRequest('GET', '/attendance/today', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.hasCheckedIn, false);
    assert.strictEqual(res.data.hasCheckedOut, false);
  });

  it('POST /api/attendance/check-out should reject checkout when not checked in', async () => {
    const res = await makeRequest('POST', '/attendance/check-out', {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /check in first/i);
  });

  it('POST /api/attendance/check-in should record check-in and calculate late status', async () => {
    const res = await makeRequest('POST', '/attendance/check-in', {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.attendance);
    assert.strictEqual(res.data.attendance.employee_id, testEmpId);
    assert.strictEqual(typeof res.data.attendance.is_late, 'number'); // MySQL TINYINT (0 or 1)
    assert.ok(res.data.attendance.check_in);
  });

  it('POST /api/attendance/check-in should PREVENT duplicate check-in for the same day', async () => {
    const res = await makeRequest('POST', '/attendance/check-in', {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already checked in/i);
  });

  it('GET /api/attendance/today should confirm active check-in', async () => {
    const res = await makeRequest('GET', '/attendance/today', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.hasCheckedIn, true);
    assert.strictEqual(res.data.hasCheckedOut, false);
  });

  it('POST /api/attendance/check-out should record checkout and calculate work hours', async () => {
    const res = await makeRequest('POST', '/attendance/check-out', {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.attendance.check_out);
    assert.ok(typeof res.data.attendance.total_hours !== 'undefined');
  });

  it('POST /api/attendance/check-out should PREVENT duplicate checkout for the same day', async () => {
    const res = await makeRequest('POST', '/attendance/check-out', {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already checked out/i);
  });

  it('GET /api/attendance/today should now confirm both check-in and check-out', async () => {
    const res = await makeRequest('GET', '/attendance/today', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.hasCheckedIn, true);
    assert.strictEqual(res.data.hasCheckedOut, true);
    assert.ok(res.data.record.check_out);
  });

  it('GET /api/attendance/history should return paginated logs', async () => {
    const res = await makeRequest('GET', '/attendance/history?page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.records));
    assert.ok(res.data.pagination);
    assert.strictEqual(res.data.pagination.page, 1);
  });

  it('GET /api/attendance/report/monthly should generate monthly employee attendance statistics', async () => {
    const now = new Date();
    const res = await makeRequest('GET', `/attendance/report/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.report));
    assert.ok(res.data.summary);
    assert.ok(res.data.summary.totalEmployees >= 1);
  });

  it('should export monthly attendance report to CSV and Excel', async () => {
    const now = new Date();
    const csvRes = await makeRequest('GET', `/attendance/report/export/csv?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, null, admin.cookies);
    assert.strictEqual(csvRes.statusCode, 200);
    assert.match(csvRes.headers['content-type'], /csv/i);

    const excelRes = await makeRequest('GET', `/attendance/report/export/excel?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, null, admin.cookies);
    assert.strictEqual(excelRes.statusCode, 200);
    assert.match(excelRes.headers['content-type'], /spreadsheetml/i);
  });

  it('POST /api/attendance/corrections should reject invalid checkout before checkin', async () => {
    const res = await makeRequest('POST', '/attendance/corrections', {
      date: '2026-10-25',
      requested_check_in: '2026-10-25T17:00:00Z',
      requested_check_out: '2026-10-25T09:00:00Z',
      reason: 'Wrong times submitted'
    }, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /after requested check-in/i);
  });

  it('POST /api/attendance/corrections should submit correction request successfully', async () => {
    const res = await makeRequest('POST', '/attendance/corrections', {
      date: '2026-10-25',
      requested_check_in: '2026-10-25T09:00:00Z',
      requested_check_out: '2026-10-25T17:30:00Z',
      reason: 'Forgot to punch check-out due to client visit'
    }, employee.cookies, employee.headers);
    if (res.statusCode !== 201) {
      console.error('DEBUG CORRECTION FAILED:', res.statusCode, res.data);
    }
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.correctionId);
    correctionId = res.data.correctionId;
  });

  it('GET /api/attendance/corrections should list submitted correction requests', async () => {
    const res = await makeRequest('GET', '/attendance/corrections?status=PENDING', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.corrections));
    const item = res.data.corrections.find(c => c.id === correctionId);
    assert.ok(item, 'Submitted correction should appear in pending list');
    assert.strictEqual(item.status, 'PENDING');
  });

  it('PATCH /api/attendance/corrections/:id/approve should approve correction and update attendance', async () => {
    const res = await makeRequest('PATCH', `/attendance/corrections/${correctionId}/approve`, {}, admin.cookies, admin.headers);
    if (res.statusCode !== 200) {
      console.error('DEBUG APPROVE ERROR:', res.statusCode, res.data);
    }
    assert.strictEqual(res.statusCode, 200);

    // Verify status updated in corrections table
    const checkCorr = await runTestQuery('SELECT status, reviewed_by FROM attendance_corrections WHERE id = ?', [correctionId]);
    assert.strictEqual(checkCorr[0].status, 'APPROVED');

    // Verify attendance row updated with is_corrected = TRUE
    const checkAtt = await runTestQuery('SELECT total_hours, is_corrected, date FROM attendance WHERE employee_id = ?', [testEmpId]);
    const row = checkAtt.find(r => {
      const d = r.date instanceof Date 
        ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}-${String(r.date.getDate()).padStart(2, '0')}`
        : String(r.date);
      return d.startsWith('2026-10-25');
    });
    assert.ok(row, 'Should find attendance row for 2026-10-25');
    assert.strictEqual(row.is_corrected, 1);
    assert.ok(Number(row.total_hours) > 8);
  });

  it('PATCH /api/attendance/corrections/:id/reject should reject request with reason', async () => {
    // Submit second correction for another date
    const subRes = await makeRequest('POST', '/attendance/corrections', {
      date: '2026-10-24',
      requested_check_in: '2026-10-24T09:00:00Z',
      requested_check_out: '2026-10-24T18:00:00Z',
      reason: 'Bad timestamp entry'
    }, employee.cookies, employee.headers);
    const rejId = subRes.data.correctionId;

    const res = await makeRequest('PATCH', `/attendance/corrections/${rejId}/reject`, {
      rejection_reason: 'Timestamps could not be verified with building security logs.'
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const checkCorr = await runTestQuery('SELECT status, rejection_reason FROM attendance_corrections WHERE id = ?', [rejId]);
    assert.strictEqual(checkCorr[0].status, 'REJECTED');
    assert.match(checkCorr[0].rejection_reason, /building security/i);
  });
});
