const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const {
  makeRequest,
  loginAsAdmin,
  loginAsHRManager,
  loginAsDeptManager1,
  loginAsDeptManager2,
  loginAsEmployee,
  runTestQuery
} = require('./helpers');

describe('Feature 18: Advanced Role-Based Access Control (RBAC) Security Tests', () => {
  let admin;
  let hrManager;
  let deptManager1;
  let deptManager2;
  let employee;

  let dept1EmpId;
  let dept2EmpId;
  let dept1LeaveId;
  let dept2LeaveId;
  let dept1CorrId;
  let dept2CorrId;

  before(async () => {
    admin = await loginAsAdmin();
    hrManager = await loginAsHRManager();
    deptManager1 = await loginAsDeptManager1();
    deptManager2 = await loginAsDeptManager2();
    employee = await loginAsEmployee();

    // Ensure we have an employee in Department 1
    const [emp1] = await runTestQuery(
      'SELECT id FROM employees WHERE department_id = 1 AND deleted_at IS NULL LIMIT 1'
    );
    if (emp1) {
      dept1EmpId = emp1.id;
    } else {
      const res = await makeRequest('POST', '/employees', {
        name: 'Dept 1 Test Employee',
        email: `dept1_emp_${Date.now()}@test.com`,
        phone: '+1-555-111-0001',
        department_id: 1,
        designation: 'Backend Dev',
        status: 'Active'
      }, admin.cookies, admin.headers);
      dept1EmpId = res.data.employeeId;
    }

    // Ensure we have an employee in Department 2
    const [emp2] = await runTestQuery(
      'SELECT id FROM employees WHERE department_id = 2 AND deleted_at IS NULL LIMIT 1'
    );
    if (emp2) {
      dept2EmpId = emp2.id;
    } else {
      const res = await makeRequest('POST', '/employees', {
        name: 'Dept 2 Test Employee',
        email: `dept2_emp_${Date.now()}@test.com`,
        phone: '+1-555-222-0002',
        department_id: 2,
        designation: 'HR Specialist',
        status: 'Active'
      }, admin.cookies, admin.headers);
      dept2EmpId = res.data.employeeId;
    }

    // Create a pending leave request for Dept 1 employee
    const leave1 = await runTestQuery(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES (?, 'Casual', '2027-01-10', '2027-01-11', 2, 'Dept 1 test leave', 'PENDING')`,
      [dept1EmpId]
    );
    dept1LeaveId = leave1.insertId;

    // Create a pending leave request for Dept 2 employee
    const leave2 = await runTestQuery(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES (?, 'Casual', '2027-02-10', '2027-02-11', 2, 'Dept 2 test leave', 'PENDING')`,
      [dept2EmpId]
    );
    dept2LeaveId = leave2.insertId;

    // Create a pending attendance correction for Dept 1 employee
    const corr1 = await runTestQuery(
      `INSERT INTO attendance_corrections (employee_id, date, requested_check_in, requested_check_out, reason, status)
       VALUES (?, '2026-10-15', '2026-10-15 09:00:00', '2026-10-15 17:00:00', 'Dept 1 correction test', 'PENDING')`,
      [dept1EmpId]
    );
    dept1CorrId = corr1.insertId;

    // Create a pending attendance correction for Dept 2 employee
    const corr2 = await runTestQuery(
      `INSERT INTO attendance_corrections (employee_id, date, requested_check_in, requested_check_out, reason, status)
       VALUES (?, '2026-10-16', '2026-10-16 09:00:00', '2026-10-16 17:00:00', 'Dept 2 correction test', 'PENDING')`,
      [dept2EmpId]
    );
    dept2CorrId = corr2.insertId;
  });

  // ==========================================
  // 1. Authentication & Role Identifiers
  // ==========================================
  it('should authenticate all 4 roles with correct role & permissions attributes', async () => {
    assert.strictEqual(admin.user.role, 'admin');
    assert.strictEqual(hrManager.user.role, 'hr_manager');
    assert.strictEqual(deptManager1.user.role, 'department_manager');
    assert.strictEqual(deptManager1.user.department_id, 1);
    assert.strictEqual(deptManager2.user.role, 'department_manager');
    assert.strictEqual(deptManager2.user.department_id, 2);
    assert.strictEqual(employee.user.role, 'employee');

    assert.ok(Array.isArray(hrManager.user.permissions));
    assert.ok(hrManager.user.permissions.includes('employee.create'));
    assert.ok(hrManager.user.permissions.includes('employee.view'));
    assert.ok(hrManager.user.permissions.includes('employee.update'));
    assert.ok(hrManager.user.permissions.includes('employee.export'));
    assert.ok(!hrManager.user.permissions.includes('employee.delete'));
  });

  // ==========================================
  // 2. Admin Privileges
  // ==========================================
  it('Admin: has unrestricted full access across all operations', async () => {
    const listRes = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.strictEqual(listRes.statusCode, 200);

    const auditRes = await makeRequest('GET', '/audit-logs', null, admin.cookies);
    assert.strictEqual(auditRes.statusCode, 200);

    const exportRes = await makeRequest('GET', '/employees/export/csv', null, admin.cookies);
    assert.strictEqual(exportRes.statusCode, 200);
  });

  // ==========================================
  // 3. HR Manager Privileges & Restrictions
  // ==========================================
  it('HR Manager: CAN view employees across all departments', async () => {
    const listRes = await makeRequest('GET', '/employees', null, hrManager.cookies);
    assert.strictEqual(listRes.statusCode, 200);

    const d1Res = await makeRequest('GET', `/employees/${dept1EmpId}`, null, hrManager.cookies);
    assert.strictEqual(d1Res.statusCode, 200);

    const d2Res = await makeRequest('GET', `/employees/${dept2EmpId}`, null, hrManager.cookies);
    assert.strictEqual(d2Res.statusCode, 200);
  });

  it('HR Manager: CAN create new employees and export directory', async () => {
    const uniqueEmail = `hr_created_${Date.now()}@test.com`;
    const createRes = await makeRequest('POST', '/employees', {
      name: 'HR Created Employee',
      email: uniqueEmail,
      phone: '+1-555-444-3333',
      department_id: 1,
      designation: 'Recruiter',
      status: 'Active'
    }, hrManager.cookies, hrManager.headers);
    assert.strictEqual(createRes.statusCode, 201);
    assert.ok(createRes.data.employeeId);

    const exportRes = await makeRequest('GET', '/employees/export/csv', null, hrManager.cookies);
    assert.strictEqual(exportRes.statusCode, 200);
  });

  it('HR Manager: CAN view audit logs', async () => {
    const auditRes = await makeRequest('GET', '/audit-logs', null, hrManager.cookies);
    assert.strictEqual(auditRes.statusCode, 200);
  });

  it('HR Manager: FORBIDDEN from deleting employees (403)', async () => {
    const delRes = await makeRequest('DELETE', `/employees/${dept1EmpId}`, null, hrManager.cookies, hrManager.headers);
    assert.strictEqual(delRes.statusCode, 403);
    assert.match(delRes.data.message, /Access denied/i);
  });

  it('HR Manager: FORBIDDEN from creating or managing departments (403)', async () => {
    const createDeptRes = await makeRequest('POST', '/departments', { name: 'HR Rogue Dept' }, hrManager.cookies, hrManager.headers);
    assert.strictEqual(createDeptRes.statusCode, 403);
  });

  // ==========================================
  // 4. Department Manager Scoping & Security
  // ==========================================
  it('Department Manager 1: GET /employees directory is strictly scoped to Department 1', async () => {
    const listRes = await makeRequest('GET', '/employees', null, deptManager1.cookies);
    assert.strictEqual(listRes.statusCode, 200);
    assert.ok(Array.isArray(listRes.data));
    assert.ok(listRes.data.length > 0);
    for (const emp of listRes.data) {
      assert.strictEqual(emp.department_id, 1, `Expected department_id 1 but got ${emp.department_id}`);
    }
  });

  it('Department Manager 1: CAN view employee in own department (Dept 1)', async () => {
    const res = await makeRequest('GET', `/employees/${dept1EmpId}`, null, deptManager1.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.id, dept1EmpId);
  });

  it('Department Manager 1: FORBIDDEN from viewing employee outside department (Dept 2) (403)', async () => {
    const res = await makeRequest('GET', `/employees/${dept2EmpId}`, null, deptManager1.cookies);
    assert.strictEqual(res.statusCode, 403);
    assert.match(res.data.message, /Department managers can only access employees in their own department/i);
  });

  it('Department Manager 1: CAN update employee in own department (Dept 1)', async () => {
    const [emp] = await runTestQuery('SELECT * FROM employees WHERE id = ?', [dept1EmpId]);
    const updateRes = await makeRequest('PUT', `/employees/${dept1EmpId}`, {
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department_id: 1,
      designation: 'Senior Lead Engineer',
      status: 'Active'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(updateRes.statusCode, 200);
  });

  it('Department Manager 1: FORBIDDEN from updating employee in Dept 2 (403)', async () => {
    const [emp] = await runTestQuery('SELECT * FROM employees WHERE id = ?', [dept2EmpId]);
    const updateRes = await makeRequest('PUT', `/employees/${dept2EmpId}`, {
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department_id: 2,
      designation: 'Hacked',
      status: 'Active'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(updateRes.statusCode, 403);
    assert.match(updateRes.data.message, /Department managers can only modify employees in their own department/i);
  });

  it('Department Manager 1: FORBIDDEN from transferring employee out of Department 1 (403)', async () => {
    const [emp] = await runTestQuery('SELECT * FROM employees WHERE id = ?', [dept1EmpId]);
    const transferRes = await makeRequest('PUT', `/employees/${dept1EmpId}`, {
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      department_id: 2, // Attempt transfer to Dept 2
      designation: emp.designation,
      status: 'Active'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(transferRes.statusCode, 403);
    assert.match(transferRes.data.message, /Department managers cannot transfer employees out of their department/i);
  });

  it('Department Manager 1: FORBIDDEN from creating employees, deleting employees, and exporting directory (403)', async () => {
    const createRes = await makeRequest('POST', '/employees', {
      name: 'Dept Manager Created',
      email: 'dm_created@test.com',
      phone: '+1-555-999-0000',
      department_id: 1,
      designation: 'Junior Dev',
      status: 'Active'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(createRes.statusCode, 403);

    const deleteRes = await makeRequest('DELETE', `/employees/${dept1EmpId}`, null, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(deleteRes.statusCode, 403);

    const exportRes = await makeRequest('GET', '/employees/export/csv', null, deptManager1.cookies);
    assert.strictEqual(exportRes.statusCode, 403);

    const auditRes = await makeRequest('GET', '/audit-logs', null, deptManager1.cookies);
    assert.strictEqual(auditRes.statusCode, 403);
  });

  // ==========================================
  // 5. Manager Leave Workflow Scoping
  // ==========================================
  it('Department Manager 1: CAN approve leave request for employee in Dept 1', async () => {
    const approveRes = await makeRequest('PATCH', `/leaves/requests/${dept1LeaveId}/approve`, null, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(approveRes.statusCode, 200);
    assert.strictEqual(approveRes.data.status, 'APPROVED');
  });

  it('Department Manager 1: FORBIDDEN from approving leave request for employee in Dept 2 (403)', async () => {
    const approveRes = await makeRequest('PATCH', `/leaves/requests/${dept2LeaveId}/approve`, null, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(approveRes.statusCode, 403);
    assert.match(approveRes.data.message, /Department managers can only manage leave requests for employees in their own department/i);
  });

  it('Department Manager 1: FORBIDDEN from rejecting leave request for employee in Dept 2 (403)', async () => {
    const rejectRes = await makeRequest('PATCH', `/leaves/requests/${dept2LeaveId}/reject`, {
      rejection_reason: 'Rogue manager rejection attempt'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(rejectRes.statusCode, 403);
    assert.match(rejectRes.data.message, /Department managers can only manage leave requests for employees in their own department/i);
  });

  it('Department Manager 2: CAN reject leave request for employee in Dept 2', async () => {
    const rejectRes = await makeRequest('PATCH', `/leaves/requests/${dept2LeaveId}/reject`, {
      rejection_reason: 'Legitimate Dept 2 rejection'
    }, deptManager2.cookies, deptManager2.headers);
    assert.strictEqual(rejectRes.statusCode, 200);
    assert.strictEqual(rejectRes.data.status, 'REJECTED');
  });

  // ==========================================
  // 6. Manager Attendance Workflow Scoping
  // ==========================================
  it('Department Manager 1: CAN approve attendance correction for employee in Dept 1', async () => {
    const approveRes = await makeRequest('PATCH', `/attendance/corrections/${dept1CorrId}/approve`, null, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(approveRes.statusCode, 200);
  });

  it('Department Manager 1: FORBIDDEN from approving attendance correction for employee in Dept 2 (403)', async () => {
    const approveRes = await makeRequest('PATCH', `/attendance/corrections/${dept2CorrId}/approve`, null, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(approveRes.statusCode, 403);
    assert.match(approveRes.data.message, /Department managers can only manage attendance for employees in their own department/i);
  });

  it('Department Manager 1: FORBIDDEN from rejecting attendance correction for employee in Dept 2 (403)', async () => {
    const rejectRes = await makeRequest('PATCH', `/attendance/corrections/${dept2CorrId}/reject`, {
      rejection_reason: 'Rogue attendance reject attempt'
    }, deptManager1.cookies, deptManager1.headers);
    assert.strictEqual(rejectRes.statusCode, 403);
    assert.match(rejectRes.data.message, /Department managers can only manage attendance for employees in their own department/i);
  });

  // ==========================================
  // 7. Regular Employee Strict Isolation
  // ==========================================
  it('Employee: directory GET is strictly limited to self', async () => {
    const res = await makeRequest('GET', '/employees', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.length, 1);
    assert.strictEqual(res.data[0].id, employee.user.employee_id);
  });

  it('Employee: FORBIDDEN from viewing other profiles, creating, deleting, or managing (403)', async () => {
    const otherRes = await makeRequest('GET', `/employees/${dept2EmpId}`, null, employee.cookies);
    assert.strictEqual(otherRes.statusCode, 403);

    const createRes = await makeRequest('POST', '/employees', {
      name: 'Hacker',
      email: 'hacker@test.com',
      phone: '+1-555',
      department_id: 1,
      designation: 'Dev'
    }, employee.cookies, employee.headers);
    assert.strictEqual(createRes.statusCode, 403);

    const deleteRes = await makeRequest('DELETE', `/employees/${dept1EmpId}`, null, employee.cookies, employee.headers);
    assert.strictEqual(deleteRes.statusCode, 403);
  });
});
