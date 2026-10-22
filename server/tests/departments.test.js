const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin } = require('./helpers');

describe('Department Management API Tests', () => {
  let admin;
  let testDeptId;
  const uniqueDeptName = `Test Dept ${Date.now()}`;

  it('should list all departments', async () => {
    admin = await loginAsAdmin();
    const res = await makeRequest('GET', '/departments', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
  });

  it('should validate department name when creating', async () => {
    const res = await makeRequest('POST', '/departments', { name: '' }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /name is required/i);
  });

  it('should create new department successfully', async () => {
    const res = await makeRequest('POST', '/departments', { name: uniqueDeptName }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 201);
    testDeptId = res.data.department?.id || res.data.departmentId;
    assert.ok(testDeptId);
  });

  it('should reject creating duplicate department name', async () => {
    const res = await makeRequest('POST', '/departments', { name: uniqueDeptName }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already exists/i);
  });

  it('should get department by ID with assigned employee count', async () => {
    const res = await makeRequest('GET', `/departments/${testDeptId}`, null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.name, uniqueDeptName);
    assert.ok('employee_count' in res.data);
  });

  it('should update department name', async () => {
    const updatedName = `${uniqueDeptName} Updated`;
    const res = await makeRequest('PUT', `/departments/${testDeptId}`, { name: updatedName }, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', `/departments/${testDeptId}`, null, admin.cookies);
    assert.strictEqual(check.data.name, updatedName);
  });

  it('should delete department successfully', async () => {
    const res = await makeRequest('DELETE', `/departments/${testDeptId}`, null, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', `/departments/${testDeptId}`, null, admin.cookies);
    assert.strictEqual(check.statusCode, 404);
  });
});
