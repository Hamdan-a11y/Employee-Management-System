const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

function makeRequest(method, path, body = null, cookies = [], headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (cookies.length > 0) {
      options.headers['Cookie'] = cookies.join('; ');
    }

    const req = http.request(options, (res) => {
      let data = '';
      const setCookieHeaders = res.headers['set-cookie'] || [];
      const newCookies = setCookieHeaders.map(c => c.split(';')[0]);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          cookies: newCookies
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function extractXsrfToken(cookies) {
  for (const c of cookies) {
    if (c.startsWith('XSRF-TOKEN=')) {
      return decodeURIComponent(c.substring('XSRF-TOKEN='.length));
    }
  }
  return '';
}

async function runTests() {
  console.log('====================================================');
  console.log('       STARTING SOFT DELETE & RESTORE TESTS         ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Admin
    console.log('--- 1. Authenticate Admin ---');
    const adminLogin = await makeRequest('POST', '/auth/login', {
      email: 'admin@example.com',
      password: 'Password123!'
    });
    assert(adminLogin.statusCode === 200, 'Admin login succeeded (200)');
    const adminCookies = adminLogin.cookies;
    const adminCsrf = extractXsrfToken(adminCookies);
    const adminHeaders = { 'x-csrf-token': adminCsrf };

    // 2. Authenticate Non-Admin Employee
    console.log('\n--- 2. Authenticate Non-Admin Employee ---');
    const empLogin = await makeRequest('POST', '/auth/login', {
      email: 'muhammadhumdan43@gmail.com',
      password: 'Password123!'
    });
    assert(empLogin.statusCode === 200, 'Employee login succeeded (200)');
    const empCookies = empLogin.cookies;
    const empCsrf = extractXsrfToken(empCookies);
    const empHeaders = { 'x-csrf-token': empCsrf };

    // 3. Create a dedicated test employee to test soft-delete and restore
    console.log('\n--- 3. Create Test Employee ---');
    const testEmail = `softdel.test.${Date.now()}@example.com`;
    const createEmpRes = await makeRequest('POST', '/employees', {
      name: 'Soft Delete Tester',
      email: testEmail,
      phone: '+1-555-888-9999',
      department_id: 1, // Engineering
      designation: 'QA Specialist',
      status: 'Active'
    }, adminCookies, adminHeaders);
    assert(createEmpRes.statusCode === 201, 'Created test employee (201)');
    const testEmpId = createEmpRes.data.employeeId;

    // 4. Check initial dashboard stats
    console.log('\n--- 4. Verify Initial Dashboard & Directory State ---');
    const initialStats = await makeRequest('GET', '/dashboard/stats', null, adminCookies);
    assert(initialStats.statusCode === 200, 'Fetched dashboard stats (200)');
    const initialTotal = initialStats.data.totalEmployees;

    const initialDir = await makeRequest('GET', '/employees', null, adminCookies);
    const inActiveDirInitially = initialDir.data.some(e => e.id === testEmpId);
    assert(inActiveDirInitially, 'Test employee is present in active employee directory');

    // 5. Test Soft Deletion
    console.log('\n--- 5. Perform Soft Deletion ---');
    const deleteRes = await makeRequest('DELETE', `/employees/${testEmpId}`, null, adminCookies, adminHeaders);
    assert(deleteRes.statusCode === 200, 'Soft-delete DELETE /api/employees/:id returned 200');

    // 6. Verify employee is excluded from normal directory
    console.log('\n--- 6. Verify Exclusion from Active Directory & Exports ---');
    const afterDeleteDir = await makeRequest('GET', '/employees', null, adminCookies);
    const inActiveDirAfter = afterDeleteDir.data.some(e => e.id === testEmpId);
    assert(!inActiveDirAfter, 'Soft-deleted employee is EXCLUDED from active directory');

    const csvExport = await makeRequest('GET', '/employees/export/csv', null, adminCookies);
    assert(!csvExport.data.includes(testEmail), 'Soft-deleted employee is EXCLUDED from CSV export');

    // 7. Verify employee is excluded from dashboard stats
    console.log('\n--- 7. Verify Exclusion from Dashboard Statistics ---');
    const afterDeleteStats = await makeRequest('GET', '/dashboard/stats', null, adminCookies);
    assert(afterDeleteStats.data.totalEmployees === initialTotal - 1, 
      `Dashboard totalEmployees decremented by 1 (expected: ${initialTotal - 1}, actual: ${afterDeleteStats.data.totalEmployees})`);

    // 8. Verify employee appears in Deleted Archive
    console.log('\n--- 8. Verify Deleted Archive Listing ---');
    const deletedList = await makeRequest('GET', '/employees/deleted', null, adminCookies);
    assert(deletedList.statusCode === 200, 'GET /api/employees/deleted returned 200');
    const foundInDeleted = deletedList.data.find(e => e.id === testEmpId);
    assert(Boolean(foundInDeleted), 'Soft-deleted employee is found in Deleted Archive');
    assert(Boolean(foundInDeleted?.deleted_at), 'Archived record contains deleted_at timestamp');

    // 9. RBAC Security: Verify Non-Admin Access Restrictions
    console.log('\n--- 9. Verify Non-Admin Security Restrictions ---');
    const empDeletedList = await makeRequest('GET', '/employees/deleted', null, empCookies);
    assert(empDeletedList.statusCode === 403, 'Employee is DENIED access to /employees/deleted (403)');

    const empDeleteAction = await makeRequest('DELETE', `/employees/${testEmpId}`, null, empCookies, empHeaders);
    assert(empDeleteAction.statusCode === 403, 'Employee is DENIED delete permission (403)');

    const empRestoreAction = await makeRequest('PATCH', `/employees/${testEmpId}/restore`, null, empCookies, empHeaders);
    assert(empRestoreAction.statusCode === 403, 'Employee is DENIED restore permission (403)');

    const empViewArchived = await makeRequest('GET', `/employees/${testEmpId}`, null, empCookies);
    assert(empViewArchived.statusCode === 403 || empViewArchived.statusCode === 404, 'Employee is DENIED viewing archived employee profile (403 or 404)');

    // 10. Audit Log Verification for DELETE
    console.log('\n--- 10. Verify Audit Log for Soft-Delete ---');
    const auditLogs1 = await makeRequest('GET', '/audit-logs', null, adminCookies);
    const deleteAudit = auditLogs1.data.logs.find(
      l => l.action === 'DELETE' && l.details && l.details.includes(`Soft-deleted employee #${testEmpId}`)
    );
    assert(Boolean(deleteAudit), 'Audit log recorded soft deletion with exact employee ID and name');

    // 11. Test Restore
    console.log('\n--- 11. Perform Restore Action ---');
    const restoreRes = await makeRequest('PATCH', `/employees/${testEmpId}/restore`, null, adminCookies, adminHeaders);
    assert(restoreRes.statusCode === 200, 'Restore PATCH /api/employees/:id/restore returned 200');

    // 12. Verify employee restored to active directory
    console.log('\n--- 12. Verify Restoration in Directory & Dashboard ---');
    const afterRestoreDir = await makeRequest('GET', '/employees', null, adminCookies);
    const inActiveDirRestored = afterRestoreDir.data.some(e => e.id === testEmpId);
    assert(inActiveDirRestored, 'Restored employee is present in active directory again');

    const afterRestoreStats = await makeRequest('GET', '/dashboard/stats', null, adminCookies);
    assert(afterRestoreStats.data.totalEmployees === initialTotal,
      `Dashboard totalEmployees restored to initial total (${initialTotal})`);

    const deletedListAfterRestore = await makeRequest('GET', '/employees/deleted', null, adminCookies);
    const stillInDeleted = deletedListAfterRestore.data.some(e => e.id === testEmpId);
    assert(!stillInDeleted, 'Restored employee is NO LONGER in Deleted Archive');

    // 13. Audit Log Verification for RESTORE
    console.log('\n--- 13. Verify Audit Log for Restore ---');
    const auditLogs2 = await makeRequest('GET', '/audit-logs', null, adminCookies);
    const restoreAudit = auditLogs2.data.logs.find(
      l => l.action === 'RESTORE' && l.details && l.details.includes(`Restored employee #${testEmpId}`)
    );
    assert(Boolean(restoreAudit), 'Audit log recorded RESTORE action with employee details');

    // 14. Clean up test employee
    console.log('\n--- 14. Cleanup Test Employee ---');
    // Soft-delete test record so it is archived
    await makeRequest('DELETE', `/employees/${testEmpId}`, null, adminCookies, adminHeaders);
    console.log('   Test employee cleaned up.');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
