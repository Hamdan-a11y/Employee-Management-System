const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin } = require('./helpers');

describe('Notifications API & Unread Counters Tests', () => {
  let admin;
  let testNotifId;

  it('should fetch notifications for user with unreadCount', async () => {
    admin = await loginAsAdmin();
    const res = await makeRequest('GET', '/notifications', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.notifications));
    assert.strictEqual(typeof res.data.unreadCount, 'number');
  });

  it('should trigger system notification on department creation', async () => {
    const tempDeptName = `Notif Test Dept ${Date.now()}`;
    const createRes = await makeRequest('POST', '/departments', { name: tempDeptName }, admin.cookies, admin.headers);
    assert.strictEqual(createRes.statusCode, 201);
    const deptId = createRes.data.department?.id || createRes.data.departmentId;

    // Fetch notifications
    const notifs = await makeRequest('GET', '/notifications', null, admin.cookies);
    const found = notifs.data.notifications.find(
      n => n.title === 'Department Created' && n.message.includes(tempDeptName)
    );
    assert.ok(found);
    testNotifId = found.id;
    assert.strictEqual(found.is_read, 0);

    // Clean up temp department
    await makeRequest('DELETE', `/departments/${deptId}`, null, admin.cookies, admin.headers);
  });

  it('should mark single notification as read', async () => {
    if (!testNotifId) return;
    const res = await makeRequest('PATCH', `/notifications/${testNotifId}/read`, {}, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', '/notifications', null, admin.cookies);
    const updated = check.data.notifications.find(n => n.id === testNotifId);
    assert.strictEqual(updated.is_read, 1);
  });

  it('should mark all notifications as read', async () => {
    const res = await makeRequest('PATCH', '/notifications/read-all', {}, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', '/notifications', null, admin.cookies);
    assert.strictEqual(check.data.unreadCount, 0);
  });

  it('should delete a notification', async () => {
    if (!testNotifId) return;
    const res = await makeRequest('DELETE', `/notifications/${testNotifId}`, null, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);

    const check = await makeRequest('GET', '/notifications', null, admin.cookies);
    assert.ok(!check.data.notifications.some(n => n.id === testNotifId));
  });

  it('should clear read notifications via DELETE /api/notifications', async () => {
    const res = await makeRequest('DELETE', '/notifications', null, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);
  });
});
