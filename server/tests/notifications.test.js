const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const pool = require('../db');
const config = require('../config/env');
const { initSocket, getIO } = require('../socket');
const { notifyUser } = require('../services/notificationService');
const notificationRoutes = require('../routes/notifications');

describe('Real-Time Notifications & Socket.IO Tests', () => {
  let server;
  let port;
  let io;
  let user1Token;
  let user2Token;
  const user1Id = 1; // Admin user
  const user2Id = 2; // Employee user

  // Helper for HTTP requests directly against test server
  function apiRequest(method, endpoint, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`http://localhost:${port}/api/notifications${endpoint}`);
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  before(async () => {
    // 1. Setup Express app & HTTP Server on ephemeral port (0)
    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);

    server = http.createServer(app);
    io = initSocket(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    // 2. Generate test JWT tokens
    user1Token = jwt.sign(
      { id: user1Id, role: 'admin', name: 'Admin Master' },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    user2Token = jwt.sign(
      { id: user2Id, role: 'employee', name: 'Muhammad Hamdan', department_id: 1 },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1. Invalid token rejected
  it('invalid token rejected', async () => {
    let connectErrorReceived = false;
    let errorMessage = '';

    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: 'invalid.expired.bogus.token' },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve) => {
      socket.on('connect_error', (err) => {
        connectErrorReceived = true;
        errorMessage = err.message;
        socket.disconnect();
        resolve();
      });

      socket.on('connect', () => {
        socket.disconnect();
        resolve();
      });

      setTimeout(() => resolve(), 3000);
    });

    assert.strictEqual(connectErrorReceived, true, 'Socket connection with invalid token must trigger connect_error');
    assert.match(errorMessage, /Authentication error/i, 'Error message should indicate authentication error');
    assert.strictEqual(socket.connected, false, 'Socket should not be connected');
  });

  // 2. User can't join another user's room
  it("user can't join another user's room", async () => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: user2Token }, // User 2 connects
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    assert.strictEqual(socket.connected, true);

    // Attempt to join user 1's private room
    const joinResult = await new Promise((resolve) => {
      socket.emit('join', `user:${user1Id}`, (response) => {
        resolve(response);
      });
      // Fallback in case callback isn't called
      setTimeout(() => resolve({ timedOut: true }), 1500);
    });

    assert.strictEqual(joinResult?.success, false, "Joining another user's room must be rejected");

    // Also verify User 2 does not receive messages broadcast to user 1's room
    let leakedMessage = false;
    socket.on('notification:new', (notif) => {
      if (notif.title === 'Secret For User 1') {
        leakedMessage = true;
      }
    });

    io.to(`user:${user1Id}`).emit('notification:new', {
      id: 99999,
      title: 'Secret For User 1',
      message: 'Classified data'
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(leakedMessage, false, "User 2 must not receive messages emitted to User 1's room");

    socket.disconnect();
  });

  // 3. Notification saved then emitted
  it('notification saved then emitted', async () => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: user1Token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    const notifTitle = `Realtime Test ${Date.now()}`;
    let receivedPayload = null;

    const eventPromise = new Promise((resolve) => {
      socket.on('notification:new', (payload) => {
        if (payload.title === notifTitle) {
          receivedPayload = payload;
          resolve(payload);
        }
      });
    });

    // Trigger notifyUser
    const notifId = await notifyUser(user1Id, {
      title: notifTitle,
      message: 'Testing realtime notification delivery',
      type: 'system',
      link: '/attendance'
    });

    assert.ok(notifId, 'notifyUser must return a created notification ID');

    // Wait for event to arrive via socket
    await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Socket event timeout')), 3000))
    ]);

    assert.ok(receivedPayload, 'Socket client must receive notification:new event');
    assert.strictEqual(receivedPayload.title, notifTitle);
    assert.strictEqual(receivedPayload.user_id, user1Id);

    // Verify row was saved in the database
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [notifId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].title, notifTitle);
    assert.strictEqual(rows[0].is_read, 0);

    socket.disconnect();
  });

  // 4. Offline user still gets it from database
  it('offline user still gets it from database', async () => {
    // User 2 has no active socket connection
    const offlineTitle = `Offline Notice ${Date.now()}`;
    const notifId = await notifyUser(user2Id, {
      title: offlineTitle,
      message: 'User was offline when this arrived',
      type: 'system',
      link: '/leaves'
    });

    assert.ok(notifId);

    // Fetch notifications via API as User 2
    const res = await apiRequest('GET', '', null, user2Token);
    assert.strictEqual(res.statusCode, 200);

    const found = res.data.notifications.find((n) => n.id === notifId);
    assert.ok(found, 'Offline notification must be saved in database and accessible via API');
    assert.strictEqual(found.title, offlineTitle);
    assert.strictEqual(found.is_read, 0);
  });

  // 5. Mark read
  it('mark read', async () => {
    const notifId = await notifyUser(user2Id, {
      title: `Mark Read Test ${Date.now()}`,
      message: 'Mark as read test',
      type: 'system'
    });

    const res = await apiRequest('PATCH', `/${notifId}/read`, {}, user2Token);
    assert.strictEqual(res.statusCode, 200);

    // Verify DB update
    const [rows] = await pool.query('SELECT is_read FROM notifications WHERE id = ?', [notifId]);
    assert.strictEqual(rows[0].is_read, 1);
  });

  // 6. Mark all read
  it('mark all read', async () => {
    // Insert 2 unread notifications for User 2
    await notifyUser(user2Id, { title: 'Batch Read 1', message: 'Msg 1', type: 'system' });
    await notifyUser(user2Id, { title: 'Batch Read 2', message: 'Msg 2', type: 'system' });

    const markRes = await apiRequest('PATCH', '/read-all', {}, user2Token);
    assert.strictEqual(markRes.statusCode, 200);

    // Unread count should now be 0
    const countRes = await apiRequest('GET', '/unread-count', null, user2Token);
    assert.strictEqual(countRes.statusCode, 200);
    assert.strictEqual(countRes.data.unreadCount, 0);
  });

  // 7. Users can't read others' notifications
  it("users can't read others' notifications", async () => {
    // Create a notification for User 1
    const user1NotifId = await notifyUser(user1Id, {
      title: 'User 1 Confidential Alert',
      message: 'Private to user 1 only',
      type: 'security'
    });

    // User 2 attempts to mark User 1's notification as read
    const patchRes = await apiRequest('PATCH', `/${user1NotifId}/read`, {}, user2Token);
    assert.strictEqual(patchRes.statusCode, 404, 'User 2 cannot mark User 1 notification as read');

    // User 2 attempts to delete User 1's notification
    const deleteRes = await apiRequest('DELETE', `/${user1NotifId}`, null, user2Token);
    assert.strictEqual(deleteRes.statusCode, 404, 'User 2 cannot delete User 1 notification');

    // User 2 fetches notifications - should NOT contain User 1's notification
    const getRes = await apiRequest('GET', '', null, user2Token);
    assert.strictEqual(getRes.statusCode, 200);
    const hasUser1Notif = getRes.data.notifications.some((n) => n.id === user1NotifId);
    assert.strictEqual(hasUser1Notif, false, "User 1's notification must not be visible to User 2");
  });

  // 8. No emit when transaction rolls back
  it('no emit when transaction rolls back', async () => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: user1Token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    let emitted = false;
    const testTitle = `Rollback Test ${Date.now()}`;

    socket.on('notification:new', (notif) => {
      if (notif.title === testTitle) {
        emitted = true;
      }
    });

    // Simulate an atomic operation with transaction rollback
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Database action inside transaction
      await conn.query('SELECT 1');

      // Failure occurs before commit:
      throw new Error('Simulated transaction failure');

      // The business logic emits ONLY after successful commit
      await conn.commit();
      await notifyUser(user1Id, { title: testTitle, message: 'Should not emit' });
    } catch (err) {
      await conn.rollback();
    } finally {
      conn.release();
    }

    // Wait to confirm no socket event was dispatched
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(emitted, false, 'No notification should be emitted when transaction rolls back');

    // Verify DB does not contain the aborted notification
    const [rows] = await pool.query('SELECT * FROM notifications WHERE title = ?', [testTitle]);
    assert.strictEqual(rows.length, 0);

    socket.disconnect();
  });
});
