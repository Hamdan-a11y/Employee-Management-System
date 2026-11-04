const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  calculateHeadcountStatus,
  formatHeadcountRow,
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
});
