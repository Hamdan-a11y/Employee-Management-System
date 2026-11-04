const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  calculateHeadcountStatus,
  formatHeadcountRow,
  calculateAttrition,
  formatAttritionRow,
  calculateOvertime,
  formatOvertimeRow,
} = require('../utils/headcount');
const {
  makeRequest,
  loginAsAdmin,
  loginAsHRManager,
  loginAsDeptManager1,
  loginAsEmployee,
  runTestQuery,
} = require('./helpers');

describe('Workforce Headcount vs. Approved Headcount Tests', () => {
  let admin;
  let hrManager;
  let deptManager1;
  let employee;
  let testDeptId;

  before(async () => {
    admin = await loginAsAdmin();
    hrManager = await loginAsHRManager();
    deptManager1 = await loginAsDeptManager1();
    employee = await loginAsEmployee();

    // Create a temporary department with 0 employees to test empty department behavior
    const uniqueDeptName = `Workforce Test Dept ${Date.now()}`;
    const result = await runTestQuery(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [uniqueDeptName, 0]
    );
    testDeptId = result.insertId;
  });

  after(async () => {
    if (testDeptId) {
      await runTestQuery('DELETE FROM departments WHERE id = ?', [testDeptId]);
    }
  });

  describe('1. Status & Gap Calculation Logic Unit Tests', () => {
    it('should return "Not Set" when approved headcount is 0 (current = 0)', () => {
      const status = calculateHeadcountStatus(0, 0);
      assert.strictEqual(status, 'Not Set');
    });

    it('should return "Not Set" when approved headcount is 0 regardless of current count', () => {
      const status = calculateHeadcountStatus(0, 5);
      assert.strictEqual(status, 'Not Set');
    });

    it('should return "Needs Hiring" when gap > 0 (approved > current)', () => {
      const status = calculateHeadcountStatus(10, 6);
      assert.strictEqual(status, 'Needs Hiring');
    });

    it('should return "Balanced" when gap = 0 (approved = current)', () => {
      const status = calculateHeadcountStatus(8, 8);
      assert.strictEqual(status, 'Balanced');
    });

    it('should return "Overstaffed - Review" when gap < 0 (approved < current)', () => {
      const status = calculateHeadcountStatus(5, 7);
      assert.strictEqual(status, 'Overstaffed - Review');
    });

    it('should format raw database row correctly with gap = approved - current', () => {
      const row = formatHeadcountRow({
        id: 42,
        name: 'Design Engineering',
        approved: 12,
        current: 9,
      });

      assert.strictEqual(row.id, 42);
      assert.strictEqual(row.name, 'Design Engineering');
      assert.strictEqual(row.approved, 12);
      assert.strictEqual(row.current, 9);
      assert.strictEqual(row.gap, 3);
      assert.strictEqual(row.status, 'Needs Hiring');
    });

    it('should correctly handle approved = 0 in formatHeadcountRow', () => {
      const row = formatHeadcountRow({
        id: 99,
        name: 'Brand New Dept',
        approved: 0,
        current: 0,
      });

      assert.strictEqual(row.approved, 0);
      assert.strictEqual(row.current, 0);
      assert.strictEqual(row.gap, 0);
      assert.strictEqual(row.status, 'Not Set');
    });
  });

  describe('2. GET /api/workforce/headcount API Tests', () => {
    it('Admin can fetch headcount data for all departments', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length > 0);

      // Verify each object contains required fields: name, approved, current, gap, status
      const dept = res.data[0];
      assert.ok('name' in dept);
      assert.ok('approved' in dept);
      assert.ok('current' in dept);
      assert.ok('gap' in dept);
      assert.ok('status' in dept);
      assert.strictEqual(typeof dept.name, 'string');
      assert.strictEqual(typeof dept.approved, 'number');
      assert.strictEqual(typeof dept.current, 'number');
      assert.strictEqual(typeof dept.gap, 'number');
      assert.strictEqual(typeof dept.status, 'string');
    });

    it('Departments with no employees still show in the results', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      const emptyDept = res.data.find((d) => d.id === testDeptId);
      assert.ok(emptyDept, 'Department with no employees must be included in results');
      assert.strictEqual(emptyDept.current, 0);
      assert.strictEqual(emptyDept.approved, 0);
      assert.strictEqual(emptyDept.gap, 0);
      assert.strictEqual(emptyDept.status, 'Not Set');
    });

    it('HR Manager can fetch headcount data for all departments', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, hrManager.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length > 1);
    });

    it('Department Manager views own department only', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, deptManager1.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 1);
    });

    it('Employee is denied access to workforce headcount (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, employee.cookies);
      assert.strictEqual(res.statusCode, 403);
    });

    it('Unauthenticated request is rejected (HTTP 401)', async () => {
      const res = await makeRequest('GET', '/workforce/headcount', null, []);
      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('3. PUT /api/departments/:id/approved-headcount API Tests', () => {
    it('Admin can update approved headcount to valid integer >= 0', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: 10 },
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.department.approved_headcount, 10);

      // Verify that GET /api/workforce/headcount reflects the update
      const getRes = await makeRequest('GET', '/workforce/headcount', null, admin.cookies);
      const updated = getRes.data.find((d) => d.id === testDeptId);
      assert.strictEqual(updated.approved, 10);
      assert.strictEqual(updated.current, 0);
      assert.strictEqual(updated.gap, 10);
      assert.strictEqual(updated.status, 'Needs Hiring');
    });

    it('HR Manager can update approved headcount', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: 15 },
        hrManager.cookies,
        hrManager.headers
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.department.approved_headcount, 15);
    });

    it('Rejects negative approved headcount (HTTP 400)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: -5 },
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.data.message, />= 0|greater than or equal to 0/i);
    });

    it('Rejects non-integer approved headcount (HTTP 400)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: 8.5 },
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.data.message, /integer/i);
    });

    it('Rejects non-numeric approved headcount (HTTP 400)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: 'invalid_number' },
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.data.message, /integer/i);
    });

    it('Rejects missing approved headcount (HTTP 400)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        {},
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.data.message, /required/i);
    });

    it('Returns 404 for non-existent department', async () => {
      const res = await makeRequest(
        'PUT',
        '/departments/999999/approved-headcount',
        { approved_headcount: 5 },
        admin.cookies,
        admin.headers
      );
      assert.strictEqual(res.statusCode, 404);
    });

    it('Department Manager cannot update approved headcount (HTTP 403)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/1/approved-headcount`,
        { approved_headcount: 20 },
        deptManager1.cookies,
        deptManager1.headers
      );
      assert.strictEqual(res.statusCode, 403);
    });

    it('Employee cannot update approved headcount (HTTP 403)', async () => {
      const res = await makeRequest(
        'PUT',
        `/departments/${testDeptId}/approved-headcount`,
        { approved_headcount: 20 },
        employee.cookies,
        employee.headers
      );
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('4. Attrition Rate & Status Logic Unit Tests', () => {
    it('returns 0% rate and "Low" status when active headcount is 0 (prevent divide by zero)', () => {
      const res = calculateAttrition(0, 0);
      assert.strictEqual(res.attritionRate, 0);
      assert.strictEqual(res.status, 'Low');

      const resWithLeavers = calculateAttrition(3, 0);
      assert.strictEqual(resWithLeavers.attritionRate, 0);
      assert.strictEqual(resWithLeavers.status, 'Low');
    });

    it('returns "Low" status when attrition rate is under 10%', () => {
      // 1 leaver out of 20 = 5%
      const res = calculateAttrition(1, 20);
      assert.strictEqual(res.attritionRate, 5);
      assert.strictEqual(res.status, 'Low');

      // 9 out of 100 = 9%
      const res2 = calculateAttrition(9, 100);
      assert.strictEqual(res2.attritionRate, 9);
      assert.strictEqual(res2.status, 'Low');
    });

    it('returns "Medium" status when attrition rate is between 10% and 20% (inclusive)', () => {
      // 2 leavers out of 20 = 10%
      const res10 = calculateAttrition(2, 20);
      assert.strictEqual(res10.attritionRate, 10);
      assert.strictEqual(res10.status, 'Medium');

      // 3 leavers out of 20 = 15%
      const res15 = calculateAttrition(3, 20);
      assert.strictEqual(res15.attritionRate, 15);
      assert.strictEqual(res15.status, 'Medium');

      // 4 leavers out of 20 = 20%
      const res20 = calculateAttrition(4, 20);
      assert.strictEqual(res20.attritionRate, 20);
      assert.strictEqual(res20.status, 'Medium');
    });

    it('returns "High" status when attrition rate is over 20%', () => {
      // 5 leavers out of 20 = 25%
      const res = calculateAttrition(5, 20);
      assert.strictEqual(res.attritionRate, 25);
      assert.strictEqual(res.status, 'High');

      // 1 out of 3 = 33.3%
      const res33 = calculateAttrition(1, 3);
      assert.strictEqual(res33.attritionRate, 33.3);
      assert.strictEqual(res33.status, 'High');
    });

    it('formats attrition row with leavers, current, attritionRate, and status', () => {
      const row = formatAttritionRow({
        id: 1,
        name: 'Engineering',
        leavers: 2,
        current: 30,
      });

      assert.strictEqual(row.id, 1);
      assert.strictEqual(row.name, 'Engineering');
      assert.strictEqual(row.leavers, 2);
      assert.strictEqual(row.current, 30);
      assert.strictEqual(row.attritionRate, 6.7);
      assert.strictEqual(row.status, 'Low');
    });

    it('recalculates attrition rate dynamically when approved target is set or increased', () => {
      // 1 leaver, 5 current staff:
      // With approved = 5 (or not set): 1 / 5 * 100 = 20% (Medium)
      const res5 = calculateAttrition(1, 5, 5);
      assert.strictEqual(res5.attritionRate, 20);
      assert.strictEqual(res5.status, 'Medium');

      // When target is increased to 20: 1 / 20 * 100 = 5% (Low)
      const res20 = calculateAttrition(1, 5, 20);
      assert.strictEqual(res20.attritionRate, 5);
      assert.strictEqual(res20.status, 'Low');

      // formatAttritionRow uses row.approved when present
      const row = formatAttritionRow({ id: 2, name: 'Sales', approved: 20, current: 5, leavers: 1 });
      assert.strictEqual(row.approved, 20);
      assert.strictEqual(row.attritionRate, 5);
      assert.strictEqual(row.status, 'Low');
    });
  });

  describe('5. GET /api/workforce/attrition API Tests', () => {
    it('Admin can fetch attrition data with default months=12', async () => {
      const res = await makeRequest('GET', '/workforce/attrition', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length > 0);

      const dept = res.data[0];
      assert.ok('name' in dept);
      assert.ok('leavers' in dept);
      assert.ok('attritionRate' in dept);
      assert.ok('status' in dept);
      assert.strictEqual(typeof dept.name, 'string');
      assert.strictEqual(typeof dept.leavers, 'number');
      assert.strictEqual(typeof dept.attritionRate, 'number');
      assert.strictEqual(typeof dept.status, 'string');
    });

    it('Supports months=3, months=6, and months=12 query parameters', async () => {
      for (const m of [3, 6, 12]) {
        const res = await makeRequest('GET', `/workforce/attrition?months=${m}`, null, admin.cookies);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(Array.isArray(res.data));
      }
    });

    it('Rejects invalid months parameter (HTTP 400)', async () => {
      const res1 = await makeRequest('GET', '/workforce/attrition?months=5', null, admin.cookies);
      assert.strictEqual(res1.statusCode, 400);
      assert.match(res1.data.message, /3, 6, or 12/i);

      const res2 = await makeRequest('GET', '/workforce/attrition?months=invalid', null, admin.cookies);
      assert.strictEqual(res2.statusCode, 400);
    });

    it('Departments with no leavers still show in results', async () => {
      const res = await makeRequest('GET', '/workforce/attrition?months=12', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      const emptyDept = res.data.find((d) => d.id === testDeptId);
      assert.ok(emptyDept, 'Empty department must be included in results');
      assert.strictEqual(emptyDept.leavers, 0);
      assert.strictEqual(emptyDept.attritionRate, 0);
      assert.strictEqual(emptyDept.status, 'Low');
    });

    it('Department Manager views own department only for attrition', async () => {
      const res = await makeRequest('GET', '/workforce/attrition?months=12', null, deptManager1.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 1);
    });

    it('Employee is denied access to workforce attrition (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/workforce/attrition?months=12', null, employee.cookies);
      assert.strictEqual(res.statusCode, 403);
    });

    it('Unauthenticated request is rejected for attrition (HTTP 401)', async () => {
      const res = await makeRequest('GET', '/workforce/attrition', null, []);
      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('6. Overtime Calculation Logic Unit Tests', () => {
    it('returns avgDailyHours 0, overtimePercent 0, and "No Data" when attendanceDays = 0 or hours = 0', () => {
      const res1 = calculateOvertime(0, 0);
      assert.deepStrictEqual(res1, { avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });

      const res2 = calculateOvertime(8.5, 0);
      assert.deepStrictEqual(res2, { avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });

      const res3 = calculateOvertime(0, 5);
      assert.deepStrictEqual(res3, { avgDailyHours: 0, overtimePercent: 0, status: 'No Data' });
    });

    it('returns 0% overtime and "Normal" status when working hours <= 8.0 (0 if negative)', () => {
      const resExact = calculateOvertime(8.0, 5);
      assert.strictEqual(resExact.avgDailyHours, 8.0);
      assert.strictEqual(resExact.overtimePercent, 0);
      assert.strictEqual(resExact.status, 'Normal');

      const resUnder = calculateOvertime(7.2, 5);
      assert.strictEqual(resUnder.avgDailyHours, 7.2);
      assert.strictEqual(resUnder.overtimePercent, 0);
      assert.strictEqual(resUnder.status, 'Normal');
    });

    it('returns "Normal" status when overtime is under 5%', () => {
      // (8.3 - 8) / 8 * 100 = 3.8%
      const res = calculateOvertime(8.3, 10);
      assert.strictEqual(res.avgDailyHours, 8.3);
      assert.strictEqual(res.overtimePercent, 3.8);
      assert.strictEqual(res.status, 'Normal');
    });

    it('returns "High" status when overtime is between 5% and 15% (inclusive)', () => {
      // (8.4 - 8) / 8 * 100 = 5.0%
      const res5 = calculateOvertime(8.4, 10);
      assert.strictEqual(res5.avgDailyHours, 8.4);
      assert.strictEqual(res5.overtimePercent, 5.0);
      assert.strictEqual(res5.status, 'High');

      // (9.2 - 8) / 8 * 100 = 15.0%
      const res15 = calculateOvertime(9.2, 10);
      assert.strictEqual(res15.avgDailyHours, 9.2);
      assert.strictEqual(res15.overtimePercent, 15.0);
      assert.strictEqual(res15.status, 'High');
    });

    it('returns "Very High" status when overtime is over 15%', () => {
      // (9.5 - 8) / 8 * 100 = 18.8%
      const res = calculateOvertime(9.5, 10);
      assert.strictEqual(res.avgDailyHours, 9.5);
      assert.strictEqual(res.overtimePercent, 18.8);
      assert.strictEqual(res.status, 'Very High');
    });

    it('formats raw overtime row correctly', () => {
      const row = { id: 1, name: 'Engineering', attendance_days: '15', avg_daily_hours: '8.60' };
      const formatted = formatOvertimeRow(row);
      assert.strictEqual(formatted.id, 1);
      assert.strictEqual(formatted.name, 'Engineering');
      assert.strictEqual(formatted.attendanceDays, 15);
      assert.strictEqual(formatted.avgDailyHours, 8.6);
      assert.strictEqual(formatted.overtimePercent, 7.5);
      assert.strictEqual(formatted.status, 'High');
    });
  });

  describe('7. GET /api/workforce/overtime API Tests', () => {
    it('Admin can fetch overtime data with default months=3', async () => {
      const res = await makeRequest('GET', '/workforce/overtime', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.length > 0);

      const dept = res.data[0];
      assert.ok('name' in dept);
      assert.ok('avgDailyHours' in dept);
      assert.ok('overtimePercent' in dept);
      assert.ok('status' in dept);
      assert.strictEqual(typeof dept.name, 'string');
      assert.strictEqual(typeof dept.avgDailyHours, 'number');
      assert.strictEqual(typeof dept.overtimePercent, 'number');
      assert.strictEqual(typeof dept.status, 'string');
    });

    it('Supports months=1, months=3, and months=6 query parameters', async () => {
      for (const m of [1, 3, 6]) {
        const res = await makeRequest('GET', `/workforce/overtime?months=${m}`, null, admin.cookies);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(Array.isArray(res.data));
      }
    });

    it('Rejects invalid months parameter (HTTP 400)', async () => {
      const res1 = await makeRequest('GET', '/workforce/overtime?months=12', null, admin.cookies);
      assert.strictEqual(res1.statusCode, 400);
      assert.match(res1.data.message, /1, 3, or 6/i);

      const res2 = await makeRequest('GET', '/workforce/overtime?months=invalid', null, admin.cookies);
      assert.strictEqual(res2.statusCode, 400);
    });

    it('Departments with no attendance data still show in results (as 0 / "No Data")', async () => {
      const res = await makeRequest('GET', '/workforce/overtime?months=3', null, admin.cookies);
      assert.strictEqual(res.statusCode, 200);
      const emptyDept = res.data.find((d) => d.id === testDeptId);
      assert.ok(emptyDept, 'Empty department must be included in results');
      assert.strictEqual(emptyDept.attendanceDays, 0);
      assert.strictEqual(emptyDept.avgDailyHours, 0);
      assert.strictEqual(emptyDept.overtimePercent, 0);
      assert.strictEqual(emptyDept.status, 'No Data');
    });

    it('Department Manager views own department only for overtime', async () => {
      const res = await makeRequest('GET', '/workforce/overtime?months=3', null, deptManager1.cookies);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.data));
      assert.strictEqual(res.data.length, 1);
      assert.strictEqual(res.data[0].id, 1);
    });

    it('Employee is denied access to workforce overtime (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/workforce/overtime?months=3', null, employee.cookies);
      assert.strictEqual(res.statusCode, 403);
    });

    it('Unauthenticated request is rejected for overtime (HTTP 401)', async () => {
      const res = await makeRequest('GET', '/workforce/overtime', null, []);
      assert.strictEqual(res.statusCode, 401);
    });
  });
});
