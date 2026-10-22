const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin } = require('./helpers');

describe('Employee Directory CRUD & Soft-Delete Tests', () => {
  let admin;
  let createdEmpId;
  const uniqueEmail = `emp_crud_${Date.now()}@company.com`;

  it('should list all active employees for admin', async () => {
    admin = await loginAsAdmin();
    const res = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
  });

  it('should validate required fields when creating an employee', async () => {
    const res = await makeRequest('POST', '/employees', {
      name: '',
      email: '',
      phone: '',
      department_id: '',
      designation: ''
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /required/i);
  });

  it('should create a new employee successfully', async () => {
    const res = await makeRequest('POST', '/employees', {
      name: 'Integration Test Employee',
      email: uniqueEmail,
      phone: '+1-555-333-2222',
      department_id: 1,
      designation: 'Staff Engineer',
      status: 'Active'
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.employeeId);
    createdEmpId = res.data.employeeId;
  });

  it('should reject creating employee with duplicate email', async () => {
    const res = await makeRequest('POST', '/employees', {
      name: 'Duplicate Employee',
      email: uniqueEmail,
      phone: '+1-555-333-2222',
      department_id: 1,
      designation: 'Staff Engineer'
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already exists/i);
  });

  it('should get employee details by ID', async () => {
    const res = await makeRequest('GET', `/employees/${createdEmpId}`, null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.name, 'Integration Test Employee');
    assert.strictEqual(res.data.email, uniqueEmail);
  });

  it('should update employee record via PUT /api/employees/:id', async () => {
    const res = await makeRequest('PUT', `/employees/${createdEmpId}`, {
      name: 'Integration Test Employee Updated',
      email: uniqueEmail,
      phone: '+1-555-333-4444',
      department_id: 1,
      designation: 'Lead Architect',
      status: 'Active'
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', `/employees/${createdEmpId}`, null, admin.cookies);
    assert.strictEqual(check.data.designation, 'Lead Architect');
  });

  it('should update employee contact details via PATCH /api/employees/:id/contact', async () => {
    const res = await makeRequest('PATCH', `/employees/${createdEmpId}/contact`, {
      email: uniqueEmail,
      phone: '+1-555-000-1111'
    }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);
  });

  it('should soft-delete employee and verify exclusion from directory', async () => {
    const delRes = await makeRequest('DELETE', `/employees/${createdEmpId}`, null, admin.cookies, admin.headers);
    assert.strictEqual(delRes.statusCode, 200);

    // Verify excluded from active list
    const activeList = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.ok(!activeList.data.some(e => e.id === createdEmpId));

    // Verify present in deleted archive
    const deletedList = await makeRequest('GET', '/employees/deleted', null, admin.cookies);
    assert.ok(deletedList.data.some(e => e.id === createdEmpId));
  });

  it('should restore soft-deleted employee back to active directory', async () => {
    const restoreRes = await makeRequest('PATCH', `/employees/${createdEmpId}/restore`, null, admin.cookies, admin.headers);
    assert.strictEqual(restoreRes.statusCode, 200);

    // Verify reappears in active list
    const activeList = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.ok(activeList.data.some(e => e.id === createdEmpId));
  });

  it('should export active employees to CSV and Excel', async () => {
    const csvRes = await makeRequest('GET', '/employees/export/csv', null, admin.cookies);
    assert.strictEqual(csvRes.statusCode, 200);
    assert.match(csvRes.headers['content-type'], /csv/i);

    const excelRes = await makeRequest('GET', '/employees/export/excel', null, admin.cookies);
    assert.strictEqual(excelRes.statusCode, 200);
  });
});
