const http = require('http');

const BASE_URL = 'http://localhost:5000/api';

// Helper to make requests with cookie management
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
  console.log('       STARTING RBAC BACKEND SECURITY TESTS         ');
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
    console.log('--- 1. Testing Admin Authentication ---');
    const adminLogin = await makeRequest('POST', '/auth/login', {
      email: 'admin@example.com',
      password: 'Password123!'
    });
    assert(adminLogin.statusCode === 200, 'Admin login succeeded (200)', `Got status ${adminLogin.statusCode}`);
    assert(adminLogin.data?.user?.role === 'admin', 'Admin user has role: "admin"', `Role was ${adminLogin.data?.user?.role}`);

    const adminCookies = adminLogin.cookies;
    const adminCsrf = extractXsrfToken(adminCookies);
    const adminHeaders = { 'x-csrf-token': adminCsrf };

    // 2. Admin Permissions Verification
    console.log('\n--- 2. Testing Admin Allowed Permissions ---');
    const adminEmployees = await makeRequest('GET', '/employees', null, adminCookies);
    assert(adminEmployees.statusCode === 200 && Array.isArray(adminEmployees.data) && adminEmployees.data.length > 1, 
      'Admin can list all employees directory (200, multiple records returned)', `Length: ${adminEmployees.data?.length}`);

    const adminAuditLogs = await makeRequest('GET', '/audit-logs', null, adminCookies);
    assert(adminAuditLogs.statusCode === 200 && adminAuditLogs.data?.logs,
      'Admin can view audit logs (200)');

    const adminExport = await makeRequest('GET', '/employees/export/csv', null, adminCookies);
    assert(adminExport.statusCode === 200, 'Admin can export employee records to CSV (200)');

    // 3. Authenticate Employee
    console.log('\n--- 3. Testing Employee Authentication ---');
    const empLogin = await makeRequest('POST', '/auth/login', {
      email: 'muhammadhumdan43@gmail.com',
      password: 'Password123!'
    });
    assert(empLogin.statusCode === 200, 'Employee login succeeded (200)', `Got status ${empLogin.statusCode}`);
    assert(empLogin.data?.user?.role === 'employee', 'Employee user has role: "employee"', `Role was ${empLogin.data?.user?.role}`);
    const employeeId = empLogin.data?.user?.employee_id;
    assert(Boolean(employeeId), `Employee user has linked employee_id: ${employeeId}`);

    const empCookies = empLogin.cookies;
    const empCsrf = extractXsrfToken(empCookies);
    const empHeaders = { 'x-csrf-token': empCsrf };

    // 4. Employee Scoped & Allowed Access
    console.log('\n--- 4. Testing Employee Permitted Actions on Own Account ---');
    const empListOwn = await makeRequest('GET', '/employees', null, empCookies);
    assert(empListOwn.statusCode === 200 && empListOwn.data.length === 1 && empListOwn.data[0].id === employeeId,
      `Employee GET /api/employees is scoped strictly to own record (length 1, ID ${employeeId})`);

    const empOwnProfile = await makeRequest('GET', `/employees/${employeeId}`, null, empCookies);
    assert(empOwnProfile.statusCode === 200 && empOwnProfile.data.id === employeeId,
      'Employee can view their own profile details (200)');

    const empMeProfile = await makeRequest('GET', '/employees/me', null, empCookies);
    assert(empMeProfile.statusCode === 200 && empMeProfile.data.id === employeeId,
      'Employee can access profile via /employees/me alias (200)');

    const empUpdateOwnContact = await makeRequest('PATCH', `/employees/${employeeId}/contact`, {
      email: 'muhammadhumdan43@gmail.com',
      phone: '123-456-7890'
    }, empCookies, empHeaders);
    assert(empUpdateOwnContact.statusCode === 200, 'Employee can update their own contact information (200)');

    const empOwnDocs = await makeRequest('GET', `/employees/${employeeId}/documents`, null, empCookies);
    assert(empOwnDocs.statusCode === 200 && Array.isArray(empOwnDocs.data),
      'Employee can access their own document list (200)');

    // 5. Employee Forbidden Actions (RBAC Security Enforcement)
    console.log('\n--- 5. Testing Employee Security Enforcement (HTTP 403 Forbidden) ---');

    // Attempt to access another employee's profile
    const targetOtherId = 1; // Admin employee ID
    const empAccessOther = await makeRequest('GET', `/employees/${targetOtherId}`, null, empCookies);
    assert(empAccessOther.statusCode === 403, 
      'BLOCK: Employee cannot access other employee profile (403 Forbidden)', `Got status ${empAccessOther.statusCode}`);

    // Attempt to update another employee's contact info
    const empUpdateOtherContact = await makeRequest('PATCH', `/employees/${targetOtherId}/contact`, {
      email: 'hacker@test.com',
      phone: '999-999-9999'
    }, empCookies, empHeaders);
    assert(empUpdateOtherContact.statusCode === 403,
      'BLOCK: Employee cannot update other employee contact info (403 Forbidden)', `Got status ${empUpdateOtherContact.statusCode}`);

    // Attempt to access another employee's documents
    const empAccessOtherDocs = await makeRequest('GET', `/employees/${targetOtherId}/documents`, null, empCookies);
    assert(empAccessOtherDocs.statusCode === 403,
      'BLOCK: Employee cannot access other employee documents (403 Forbidden)', `Got status ${empAccessOtherDocs.statusCode}`);

    // Attempt to create an employee
    const empCreateEmployee = await makeRequest('POST', '/employees', {
      name: 'Unauthorized User',
      email: 'unauth@test.com',
      phone: '111-222-3333',
      department_id: 1,
      designation: 'Staff'
    }, empCookies, empHeaders);
    assert(empCreateEmployee.statusCode === 403,
      'BLOCK: Employee cannot create new employees (403 Forbidden)', `Got status ${empCreateEmployee.statusCode}`);

    // Attempt to edit full employee record
    const empEditEmployee = await makeRequest('PUT', `/employees/${employeeId}`, {
      name: 'Modified Name',
      email: 'muhammadhumdan43@gmail.com',
      phone: '123-456-7890',
      department_id: 1,
      designation: 'CEO',
      status: 'Active'
    }, empCookies, empHeaders);
    assert(empEditEmployee.statusCode === 403,
      'BLOCK: Employee cannot edit designation/status via PUT /employees/:id (403 Forbidden)', `Got status ${empEditEmployee.statusCode}`);

    // Attempt to delete an employee
    const empDeleteEmployee = await makeRequest('DELETE', `/employees/${employeeId}`, null, empCookies, empHeaders);
    assert(empDeleteEmployee.statusCode === 403,
      'BLOCK: Employee cannot delete employee records (403 Forbidden)', `Got status ${empDeleteEmployee.statusCode}`);

    // Attempt to create a department
    const empCreateDept = await makeRequest('POST', '/departments', {
      name: 'Unauthorized Dept'
    }, empCookies, empHeaders);
    assert(empCreateDept.statusCode === 403,
      'BLOCK: Employee cannot create departments (403 Forbidden)', `Got status ${empCreateDept.statusCode}`);

    // Attempt to access audit logs
    const empAuditLogs = await makeRequest('GET', '/audit-logs', null, empCookies);
    assert(empAuditLogs.statusCode === 403,
      'BLOCK: Employee cannot view audit logs (403 Forbidden)', `Got status ${empAuditLogs.statusCode}`);

    // Attempt to export CSV
    const empExport = await makeRequest('GET', '/employees/export/csv', null, empCookies);
    assert(empExport.statusCode === 403,
      'BLOCK: Employee cannot export employee data (403 Forbidden)', `Got status ${empExport.statusCode}`);

    // Attempt to import CSV
    const empImport = await makeRequest('POST', '/employees/import/validate', {}, empCookies, empHeaders);
    assert(empImport.statusCode === 403,
      'BLOCK: Employee cannot import employee data (403 Forbidden)', `Got status ${empImport.statusCode}`);

    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${passed + failed}`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
