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
  console.log('       STARTING NOTIFICATIONS INTEGRATION TESTS     ');
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

    // 2. Initial Notifications fetch
    console.log('\n--- 2. Fetch Notifications ---');
    const notifRes1 = await makeRequest('GET', '/notifications', null, adminCookies);
    assert(notifRes1.statusCode === 200, 'GET /api/notifications returns 200');
    assert(Array.isArray(notifRes1.data.notifications), 'Notifications array returned');
    assert(typeof notifRes1.data.unreadCount === 'number', 'unreadCount is a number');
    console.log(`   Initial notifications: ${notifRes1.data.notifications.length}, unread: ${notifRes1.data.unreadCount}`);

    // 3. Trigger system notification via department creation
    console.log('\n--- 3. Trigger System Notification via Department Creation ---');
    const deptName = `Automated Dept ${Date.now()}`;
    const createDept = await makeRequest('POST', '/departments', { name: deptName }, adminCookies, adminHeaders);
    assert(createDept.statusCode === 201, 'Created test department (201)');
    const deptId = createDept.data.department?.id || createDept.data.departmentId;

    // 4. Verify notification was created and delivered to admin
    console.log('\n--- 4. Verify Notification In-App Delivery ---');
    const notifRes2 = await makeRequest('GET', '/notifications', null, adminCookies);
    const foundNotif = notifRes2.data.notifications.find(
      (n) => n.title === 'Department Created' && n.message.includes(deptName)
    );
    assert(Boolean(foundNotif), 'Admin received "Department Created" in-app notification', `Notif not found for "${deptName}"`);
    assert(foundNotif && foundNotif.is_read === 0, 'New notification has is_read = 0');

    // 5. Mark single notification as read
    console.log('\n--- 5. Mark Single Notification as Read ---');
    const markReadRes = await makeRequest('PATCH', `/notifications/${foundNotif.id}/read`, {}, adminCookies, adminHeaders);
    assert(markReadRes.statusCode === 200, 'PATCH /api/notifications/:id/read returned 200');

    const notifRes3 = await makeRequest('GET', '/notifications', null, adminCookies);
    const updatedNotif = notifRes3.data.notifications.find((n) => n.id === foundNotif.id);
    assert(updatedNotif && updatedNotif.is_read === 1, 'Notification is now marked as read');

    // 6. Test Mark All as Read
    console.log('\n--- 6. Mark All Notifications as Read ---');
    const markAllRes = await makeRequest('PATCH', '/notifications/read-all', {}, adminCookies, adminHeaders);
    assert(markAllRes.statusCode === 200, 'PATCH /api/notifications/read-all returned 200');

    const notifRes4 = await makeRequest('GET', '/notifications', null, adminCookies);
    assert(notifRes4.data.unreadCount === 0, 'unreadCount is 0 after mark-all');

    // 7. Delete single notification
    console.log('\n--- 7. Delete Single Notification ---');
    const delSingleRes = await makeRequest('DELETE', `/notifications/${foundNotif.id}`, null, adminCookies, adminHeaders);
    assert(delSingleRes.statusCode === 200, 'DELETE /api/notifications/:id returned 200');

    const notifRes5 = await makeRequest('GET', '/notifications', null, adminCookies);
    const stillExists = notifRes5.data.notifications.some((n) => n.id === foundNotif.id);
    assert(!stillExists, 'Deleted notification is no longer in list');

    // 8. Test Employee Account/Profile Notification Trigger
    console.log('\n--- 8. Employee Profile & Account Change Notification Trigger ---');
    const empLogin = await makeRequest('POST', '/auth/login', {
      email: 'muhammadhumdan43@gmail.com',
      password: 'Password123!'
    });
    assert(empLogin.statusCode === 200, 'Employee login succeeded (200)');
    const empCookies = empLogin.cookies;
    const empCsrf = extractXsrfToken(empCookies);
    const empHeaders = { 'x-csrf-token': empCsrf };
    const empId = empLogin.data.user.employee_id;

    // Update employee contact information (triggers employee profile notification + email alert fallback)
    const updateContactRes = await makeRequest('PATCH', `/employees/${empId}/contact`, {
      email: 'muhammadhumdan43@gmail.com',
      phone: `+1-555-${Math.floor(1000 + Math.random() * 9000)}`
    }, empCookies, empHeaders);
    assert(updateContactRes.statusCode === 200, 'Employee contact update succeeded (200)');

    // Verify employee received profile change notification
    const empNotifRes = await makeRequest('GET', '/notifications', null, empCookies);
    const profileNotif = empNotifRes.data.notifications.find(
      (n) => n.title === 'Contact Information Updated'
    );
    assert(Boolean(profileNotif), 'Employee received "Contact Information Updated" in-app notification');

    // 9. Clear read notifications
    console.log('\n--- 9. Clear Read Notifications ---');
    const clearRes = await makeRequest('DELETE', '/notifications', null, adminCookies, adminHeaders);
    assert(clearRes.statusCode === 200, 'DELETE /api/notifications (clear read) returned 200');

    // 10. Clean up test department
    console.log('\n--- 10. Clean Up Test Department ---');
    const deleteDept = await makeRequest('DELETE', `/departments/${deptId}`, null, adminCookies, adminHeaders);
    assert(deleteDept.statusCode === 200, 'Cleaned up test department (200)');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
