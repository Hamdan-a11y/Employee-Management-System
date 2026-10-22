const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin, loginAsEmployee } = require('./helpers');

describe('Role-Based Access Control (RBAC) Security Tests', () => {
  let admin;
  let employee;

  it('should authenticate both Admin and Employee users', async () => {
    admin = await loginAsAdmin();
    employee = await loginAsEmployee();
    assert.strictEqual(admin.user.role, 'admin');
    assert.strictEqual(employee.user.role, 'employee');
  });

  it('Admin: allowed full access to directories, audit logs, and exports', async () => {
    const employeesRes = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.strictEqual(employeesRes.statusCode, 200);

    const auditRes = await makeRequest('GET', '/audit-logs', null, admin.cookies);
    assert.strictEqual(auditRes.statusCode, 200);

    const exportRes = await makeRequest('GET', '/employees/export/csv', null, admin.cookies);
    assert.strictEqual(exportRes.statusCode, 200);
  });

  it('Employee: directory GET is scoped strictly to own record', async () => {
    const res = await makeRequest('GET', '/employees', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 1);
    assert.strictEqual(res.data[0].id, employee.user.employee_id);
  });

  it('Employee: can access own profile via /employees/me and own ID', async () => {
    const meRes = await makeRequest('GET', '/employees/me', null, employee.cookies);
    assert.strictEqual(meRes.statusCode, 200);
    assert.strictEqual(meRes.data.id, employee.user.employee_id);

    const idRes = await makeRequest('GET', `/employees/${employee.user.employee_id}`, null, employee.cookies);
    assert.strictEqual(idRes.statusCode, 200);
    assert.strictEqual(idRes.data.id, employee.user.employee_id);
  });

  it('Employee: FORBIDDEN from viewing other employee profiles (403)', async () => {
    const otherId = employee.user.employee_id === 1 ? 2 : 1;
    const res = await makeRequest('GET', `/employees/${otherId}`, null, employee.cookies);
    assert.strictEqual(res.statusCode, 403);
    assert.match(res.data.message, /access denied/i);
  });

  it('Employee: FORBIDDEN from creating employees (403)', async () => {
    const res = await makeRequest('POST', '/employees', {
      name: 'Hacker',
      email: 'hack@hack.com',
      phone: '+1-555',
      department_id: 1,
      designation: 'Staff'
    }, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 403);
  });

  it('Employee: FORBIDDEN from deleting employees (403)', async () => {
    const res = await makeRequest('DELETE', `/employees/1`, null, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 403);
  });

  it('Employee: FORBIDDEN from creating or managing departments (403)', async () => {
    const res = await makeRequest('POST', '/departments', { name: 'Illegal Dept' }, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 403);
  });

  it('Employee: FORBIDDEN from viewing audit logs (403)', async () => {
    const res = await makeRequest('GET', '/audit-logs', null, employee.cookies);
    assert.strictEqual(res.statusCode, 403);
  });

  it('Employee: FORBIDDEN from exporting employee directory (403)', async () => {
    const res = await makeRequest('GET', '/employees/export/csv', null, employee.cookies);
    assert.strictEqual(res.statusCode, 403);
  });
});
