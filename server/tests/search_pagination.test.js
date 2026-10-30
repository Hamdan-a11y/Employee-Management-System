const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin } = require('./helpers');

describe('Feature 15: Advanced Search, Filtering & Pagination Tests', () => {
  let admin;

  it('should authenticate admin for feature testing', async () => {
    admin = await loginAsAdmin();
    assert.ok(admin.cookies);
  });

  it('should fetch distinct designations via GET /api/employees/designations', async () => {
    const res = await makeRequest('GET', '/employees/designations', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length > 0);
  });

  it('should support server-side pagination with page and limit parameters', async () => {
    const res = await makeRequest('GET', '/employees?page=1&limit=3', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.pagination, 'Should return pagination object');
    assert.strictEqual(res.data.pagination.page, 1);
    assert.strictEqual(res.data.pagination.limit, 3);
    assert.ok(res.data.pagination.total >= 0);
    assert.ok(res.data.pagination.totalPages >= 1);
    assert.ok(Array.isArray(res.data.employees));
    assert.ok(res.data.employees.length <= 3);
  });

  it('should navigate to page 2 and preserve page size', async () => {
    const res = await makeRequest('GET', '/employees?page=2&limit=3', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.pagination.page, 2);
    assert.strictEqual(res.data.pagination.limit, 3);
    assert.ok(Array.isArray(res.data.employees));
  });

  it('should search employees by Name', async () => {
    const res = await makeRequest('GET', '/employees?search=Hamdan&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.employees.length > 0);
    res.data.employees.forEach(emp => {
      const match = emp.name.toLowerCase().includes('hamdan') ||
                    emp.email.toLowerCase().includes('hamdan');
      assert.ok(match, `Expected search match for ${emp.name}`);
    });
  });

  it('should search employees by Email', async () => {
    const res = await makeRequest('GET', '/employees?search=muhammadhumdan43@gmail.com&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.employees.length >= 1);
    assert.strictEqual(res.data.employees[0].email, 'muhammadhumdan43@gmail.com');
  });

  it('should search employees by Phone number', async () => {
    const res = await makeRequest('GET', '/employees?search=123-456-7890&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.employees.length >= 1);
    assert.ok(res.data.employees.some(e => e.phone.includes('123-456-7890')));
  });

  it('should search employees by Employee ID', async () => {
    const res = await makeRequest('GET', '/employees?search=2&limit=50', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.employees.length >= 1);
    assert.ok(res.data.employees.some(e => e.id === 2));
  });

  it('should filter employees by Department', async () => {
    const res = await makeRequest('GET', '/employees?department_id=1&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    res.data.employees.forEach(emp => {
      assert.strictEqual(emp.department_id, 1);
    });
  });

  it('should filter employees by Status (Active vs Inactive)', async () => {
    const activeRes = await makeRequest('GET', '/employees?status=Active&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(activeRes.statusCode, 200);
    activeRes.data.employees.forEach(emp => {
      assert.strictEqual(emp.status, 'Active');
    });

    const inactiveRes = await makeRequest('GET', '/employees?status=Inactive&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(inactiveRes.statusCode, 200);
    inactiveRes.data.employees.forEach(emp => {
      assert.strictEqual(emp.status, 'Inactive');
    });
  });

  it('should filter employees by Designation', async () => {
    const res = await makeRequest('GET', '/employees?designation=react developer&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    res.data.employees.forEach(emp => {
      assert.strictEqual(emp.designation.toLowerCase(), 'react developer');
    });
  });

  it('should filter employees by Joining Date range (startDate and endDate)', async () => {
    const res = await makeRequest('GET', '/employees?startDate=2026-10-01&endDate=2026-10-31&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    res.data.employees.forEach(emp => {
      const created = new Date(emp.created_at);
      assert.ok(created >= new Date('2026-10-01T00:00:00.000Z'));
      assert.ok(created <= new Date('2026-10-31T23:59:59.999Z'));
    });
  });

  it('should dynamically sort employees by column (e.g., name ASC and DESC)', async () => {
    const ascRes = await makeRequest('GET', '/employees?sortBy=name&sortOrder=ASC&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(ascRes.statusCode, 200);
    const ascNames = ascRes.data.employees.map(e => e.name.toLowerCase());
    
    const descRes = await makeRequest('GET', '/employees?sortBy=name&sortOrder=DESC&page=1&limit=10', null, admin.cookies);
    assert.strictEqual(descRes.statusCode, 200);
    const descNames = descRes.data.employees.map(e => e.name.toLowerCase());

    assert.deepStrictEqual(ascNames, [...ascNames].sort((a, b) => a.localeCompare(b)));
    assert.deepStrictEqual(descNames, [...descNames].sort((a, b) => b.localeCompare(a)));
  });

  it('should dynamically sort by ID ascending and descending', async () => {
    const ascRes = await makeRequest('GET', '/employees?sortBy=id&sortOrder=ASC&page=1&limit=5', null, admin.cookies);
    const descRes = await makeRequest('GET', '/employees?sortBy=id&sortOrder=DESC&page=1&limit=5', null, admin.cookies);
    assert.strictEqual(ascRes.statusCode, 200);
    assert.strictEqual(descRes.statusCode, 200);

    const ascIds = ascRes.data.employees.map(e => e.id);
    const descIds = descRes.data.employees.map(e => e.id);
    for (let i = 0; i < ascIds.length - 1; i++) {
      assert.ok(ascIds[i] <= ascIds[i + 1]);
    }
    for (let i = 0; i < descIds.length - 1; i++) {
      assert.ok(descIds[i] >= descIds[i + 1]);
    }
  });

  it('should maintain backward compatibility when no pagination params are sent', async () => {
    const res = await makeRequest('GET', '/employees', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data), 'Returns an array when no pagination params are sent');
  });
});
