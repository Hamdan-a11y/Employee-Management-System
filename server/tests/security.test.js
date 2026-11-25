process.env.NODE_ENV = 'test';
process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';
process.env.RATE_LIMIT_DISABLED = 'false';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../index');
const pool = require('../db');
const { resetRateLimiters } = require('../middleware/rateLimiter');

let server;
let baseUrl;

const testUsers = {
  admin: null,
  emp1: null,
  emp2: null,
};
const createdEmployeeIds = [];
const createdUserIds = [];

function req(method, path, body = null, cookies = [], headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (cookies.length > 0) {
      options.headers.Cookie = cookies.join('; ');
    }

    const r = http.request(options, (res) => {
      let data = '';
      const setCookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          cookies: setCookies,
        });
      });
    });
    r.on('error', reject);
    if (body !== null) {
      r.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    r.end();
  });
}

function mergeCookies(oldCookies, newCookies) {
  const map = new Map();
  for (const c of [...oldCookies, ...newCookies]) {
    const eq = c.indexOf('=');
    if (eq > 0) map.set(c.slice(0, eq), c);
  }
  return Array.from(map.values());
}

function getCookieVal(cookies, name) {
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) return c.slice(name.length + 1);
  }
  return null;
}

describe('Security & Hardening Tests', () => {
  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}/api`;

    const ts = Date.now();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create 2 test employees and 3 test users (admin, emp1, emp2)
    const [e1] = await pool.query(
      "INSERT INTO employees (name, email, phone, designation, status) VALUES (?, ?, ?, 'Engineer', 'Active')",
      [`Sec Emp1 ${ts}`, `sec_emp1_${ts}@example.com`, '03001234561']
    );
    const [e2] = await pool.query(
      "INSERT INTO employees (name, email, phone, designation, status) VALUES (?, ?, ?, 'Engineer', 'Active')",
      [`Sec Emp2 ${ts}`, `sec_emp2_${ts}@example.com`, '03001234562']
    );
    createdEmployeeIds.push(e1.insertId, e2.insertId);

    const [uAdmin] = await pool.query(
      "INSERT INTO users (name, email, password, role, token_version, is_active) VALUES (?, ?, ?, 'admin', 1, TRUE)",
      [`Sec Admin ${ts}`, `sec_admin_${ts}@example.com`, passwordHash]
    );
    const [uEmp1] = await pool.query(
      "INSERT INTO users (name, email, password, role, employee_id, token_version, is_active) VALUES (?, ?, ?, 'employee', ?, 1, TRUE)",
      [`Sec Emp1 ${ts}`, `sec_emp1_${ts}@example.com`, passwordHash, e1.insertId]
    );
    const [uEmp2] = await pool.query(
      "INSERT INTO users (name, email, password, role, employee_id, token_version, is_active) VALUES (?, ?, ?, 'employee', ?, 1, TRUE)",
      [`Sec Emp2 ${ts}`, `sec_emp2_${ts}@example.com`, passwordHash, e2.insertId]
    );
    createdUserIds.push(uAdmin.insertId, uEmp1.insertId, uEmp2.insertId);

    testUsers.admin = { id: uAdmin.insertId, email: `sec_admin_${ts}@example.com`, password: 'Password123!' };
    testUsers.emp1 = { id: uEmp1.insertId, employeeId: e1.insertId, email: `sec_emp1_${ts}@example.com`, password: 'Password123!' };
    testUsers.emp2 = { id: uEmp2.insertId, employeeId: e2.insertId, email: `sec_emp2_${ts}@example.com`, password: 'Password123!' };
  });

  after(async () => {
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM security_events WHERE user_id IN (?)', [createdUserIds]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [createdUserIds]);
      await pool.query('DELETE FROM notifications WHERE user_id IN (?)', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id IN (?)', [createdUserIds]);
    }
    if (createdEmployeeIds.length > 0) {
      await pool.query('DELETE FROM leave_requests WHERE employee_id IN (?)', [createdEmployeeIds]);
      await pool.query('DELETE FROM attendance WHERE employee_id IN (?)', [createdEmployeeIds]);
      await pool.query('DELETE FROM employees WHERE id IN (?)', [createdEmployeeIds]);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  it('1. refresh rotation issues new token and revokes old one', async () => {
    resetRateLimiters();
    const loginRes = await req('POST', '/auth/login', {
      email: testUsers.emp1.email,
      password: testUsers.emp1.password,
    });
    assert.strictEqual(loginRes.statusCode, 200);
    assert.ok(loginRes.data.accessToken);
    const oldRefresh = getCookieVal(loginRes.cookies, 'refresh_token');
    assert.ok(oldRefresh);

    const refreshRes = await req('POST', '/auth/refresh', null, loginRes.cookies);
    assert.strictEqual(refreshRes.statusCode, 200);
    assert.ok(refreshRes.data.accessToken);
    const newRefresh = getCookieVal(refreshRes.cookies, 'refresh_token');
    assert.ok(newRefresh && newRefresh !== oldRefresh);

    // Verify old token is marked revoked in DB
    const oldHash = crypto.createHash('sha256').update(oldRefresh).digest('hex');
    const [rows] = await pool.query('SELECT revoked_at, replaced_by FROM refresh_tokens WHERE token_hash = ?', [oldHash]);
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].revoked_at !== null);
    assert.ok(rows[0].replaced_by !== null);
  });

  it('2. reuse of revoked refresh token revokes whole family and logs security event', async () => {
    resetRateLimiters();
    const loginRes = await req('POST', '/auth/login', {
      email: testUsers.emp1.email,
      password: testUsers.emp1.password,
    });
    const oldCookies = loginRes.cookies;

    // Rotate once
    const rotRes = await req('POST', '/auth/refresh', null, oldCookies);
    assert.strictEqual(rotRes.statusCode, 200);
    const newCookies = mergeCookies(oldCookies, rotRes.cookies);

    // Reuse old revoked token
    const reuseRes = await req('POST', '/auth/refresh', null, oldCookies);
    assert.strictEqual(reuseRes.statusCode, 401);
    assert.strictEqual(reuseRes.data.code, 'TOKEN_REUSE_DETECTED');

    // New token in the same family must now also be revoked
    const afterReuseRes = await req('POST', '/auth/refresh', null, newCookies);
    assert.strictEqual(afterReuseRes.statusCode, 401);

    const [events] = await pool.query(
      "SELECT id FROM security_events WHERE user_id = ? AND type = 'token_reuse'",
      [testUsers.emp1.id]
    );
    assert.ok(events.length >= 1);
  });

  it('3. expired access token and expired refresh token are rejected', async () => {
    const expiredJwt = jwt.sign(
      { id: testUsers.emp1.id, email: testUsers.emp1.email, role: 'employee', token_version: 1 },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const apiRes = await req('GET', '/auth/me', null, [], { Authorization: `Bearer ${expiredJwt}` });
    assert.strictEqual(apiRes.statusCode, 401);

    const rawExpiredRefresh = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawExpiredRefresh).digest('hex');
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY))',
      [testUsers.emp1.id, hash, crypto.randomUUID()]
    );
    const refRes = await req('POST', '/auth/refresh', null, [`refresh_token=${rawExpiredRefresh}`]);
    assert.strictEqual(refRes.statusCode, 401);
  });

  it('4. logout revokes current refresh token', async () => {
    resetRateLimiters();
    const loginRes = await req('POST', '/auth/login', {
      email: testUsers.emp1.email,
      password: testUsers.emp1.password,
    });
    const refreshVal = getCookieVal(loginRes.cookies, 'refresh_token');

    const logoutRes = await req('POST', '/auth/logout', null, loginRes.cookies);
    assert.strictEqual(logoutRes.statusCode, 200);

    const refRes = await req('POST', '/auth/refresh', null, [`refresh_token=${refreshVal}`]);
    assert.strictEqual(refRes.statusCode, 401);
  });

  it('5. password change revokes all tokens', async () => {
    resetRateLimiters();
    const login1 = await req('POST', '/auth/login', { email: testUsers.emp2.email, password: testUsers.emp2.password });
    const login2 = await req('POST', '/auth/login', { email: testUsers.emp2.email, password: testUsers.emp2.password });
    const r1 = getCookieVal(login1.cookies, 'refresh_token');
    const r2 = getCookieVal(login2.cookies, 'refresh_token');

    const cpRes = await req(
      'POST',
      '/auth/change-password',
      { currentPassword: 'Password123!', newPassword: 'NewPassword123!' },
      login1.cookies,
      { Authorization: `Bearer ${login1.data.accessToken}` }
    );
    assert.strictEqual(cpRes.statusCode, 200);

    const ref1 = await req('POST', '/auth/refresh', null, [`refresh_token=${r1}`]);
    const ref2 = await req('POST', '/auth/refresh', null, [`refresh_token=${r2}`]);
    assert.strictEqual(ref1.statusCode, 401);
    assert.strictEqual(ref2.statusCode, 401);

    // Old access token should also be rejected due to token_version bump
    const meRes = await req('GET', '/auth/me', null, [], { Authorization: `Bearer ${login2.data.accessToken}` });
    assert.strictEqual(meRes.statusCode, 401);
  });

  it('6. login lockout after 5 failures returns 429 with Retry-After and logs lockout event', async () => {
    resetRateLimiters();
    const lockEmail = `lockout_${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/auth/login', { email: lockEmail, password: 'WrongPassword1!' });
      assert.strictEqual(r.statusCode, 400);
    }
    const lockedRes = await req('POST', '/auth/login', { email: lockEmail, password: 'WrongPassword1!' });
    assert.strictEqual(lockedRes.statusCode, 429);
    assert.ok(lockedRes.headers['retry-after']);
    assert.match(lockedRes.data.message, /locked|too many/i);

    const [events] = await pool.query("SELECT id FROM security_events WHERE type = 'lockout'");
    assert.ok(events.length >= 1);
  });

  it('7. check-in rate limit returns 429 after 10 requests per minute per user', async () => {
    resetRateLimiters();
    const loginRes = await req('POST', '/auth/login', { email: testUsers.emp1.email, password: testUsers.emp1.password });
    const headers = { Authorization: `Bearer ${loginRes.data.accessToken}` };

    for (let i = 0; i < 10; i++) {
      await req('POST', '/attendance/check-in', {}, loginRes.cookies, headers);
    }
    const limited = await req('POST', '/attendance/check-in', {}, loginRes.cookies, headers);
    assert.strictEqual(limited.statusCode, 429);
    assert.ok(limited.headers['retry-after']);
  });

  it('8 & 9 & 10. anti-manipulation: body employeeId, client timestamp, and unknown fields rejected', async () => {
    resetRateLimiters();
    const loginRes = await req('POST', '/auth/login', { email: testUsers.emp1.email, password: testUsers.emp1.password });
    const headers = { Authorization: `Bearer ${loginRes.data.accessToken}` };

    // Client-supplied timestamp on check-in rejected
    const tsRes = await req('POST', '/attendance/check-in', { timestamp: '2020-01-01T00:00:00Z' }, loginRes.cookies, headers);
    assert.strictEqual(tsRes.statusCode, 400);

    // Body employee_id on leave request rejected (strict schema)
    const empIdRes = await req(
      'POST',
      '/leaves/requests',
      {
        leave_type: 'Annual',
        start_date: '2026-12-01',
        end_date: '2026-12-02',
        reason: 'Vacation',
        employee_id: testUsers.emp2.employeeId,
      },
      loginRes.cookies,
      headers
    );
    assert.strictEqual(empIdRes.statusCode, 400);

    // Unknown fields rejected
    const unkRes = await req(
      'POST',
      '/attendance/corrections',
      {
        date: '2026-11-20',
        requested_check_in: '2026-11-20 09:00:00',
        requested_check_out: '2026-11-20 17:00:00',
        reason: 'Forgot',
        status: 'APPROVED',
      },
      loginRes.cookies,
      headers
    );
    assert.strictEqual(unkRes.statusCode, 400);
  });

  it('11. no access to another user record (leave cancel & sessions)', async () => {
    resetRateLimiters();
    const login1 = await req('POST', '/auth/login', { email: testUsers.emp1.email, password: testUsers.emp1.password });
    const login2 = await req('POST', '/auth/login', { email: testUsers.emp2.email, password: 'NewPassword123!' });

    // Create a leave request as emp2 directly in DB to test object-level check
    const [lr] = await pool.query(
      "INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status) VALUES (?, 'Annual', '2026-12-10', '2026-12-11', 2, 'Test', 'PENDING')",
      [testUsers.emp2.employeeId]
    );

    // emp1 tries to cancel emp2's leave
    const delRes = await req('DELETE', `/leaves/requests/${lr.insertId}`, null, login1.cookies, {
      Authorization: `Bearer ${login1.data.accessToken}`,
    });
    assert.strictEqual(delRes.statusCode, 403);

    // emp1 tries to revoke emp2's session
    const sess2 = await req('GET', '/auth/sessions', null, login2.cookies, {
      Authorization: `Bearer ${login2.data.accessToken}`,
    });
    assert.strictEqual(sess2.statusCode, 200);
    const targetSessionId = sess2.data.sessions[0].id;

    const revRes = await req('DELETE', `/auth/sessions/${targetSessionId}`, null, login1.cookies, {
      Authorization: `Bearer ${login1.data.accessToken}`,
    });
    assert.strictEqual(revRes.statusCode, 404);
  });

  it('12. employee cannot open security events or force-logout another user (Admin only)', async () => {
    resetRateLimiters();
    const empLogin = await req('POST', '/auth/login', { email: testUsers.emp1.email, password: testUsers.emp1.password });
    const empHeaders = { Authorization: `Bearer ${empLogin.data.accessToken}` };

    const seRes = await req('GET', '/security-events', null, empLogin.cookies, empHeaders);
    assert.strictEqual(seRes.statusCode, 403);

    const flRes = await req('POST', `/auth/users/${testUsers.emp2.id}/force-logout`, {}, empLogin.cookies, empHeaders);
    assert.strictEqual(flRes.statusCode, 403);

    // Admin can open security events
    const adminLogin = await req('POST', '/auth/login', { email: testUsers.admin.email, password: testUsers.admin.password });
    const adminSeRes = await req('GET', '/security-events', null, adminLogin.cookies, {
      Authorization: `Bearer ${adminLogin.data.accessToken}`,
    });
    assert.strictEqual(adminSeRes.statusCode, 200);
    assert.ok(Array.isArray(adminSeRes.data.events));
  });

  it('13. new device sign-in creates new_device security event', async () => {
    resetRateLimiters();
    // First login with device A
    const l1 = await req(
      'POST',
      '/auth/login',
      { email: testUsers.emp1.email, password: testUsers.emp1.password },
      ['device_id=device-alpha-1']
    );
    assert.strictEqual(l1.statusCode, 200);

    // Second login with different device B
    const l2 = await req(
      'POST',
      '/auth/login',
      { email: testUsers.emp1.email, password: testUsers.emp1.password },
      ['device_id=device-beta-2']
    );
    assert.strictEqual(l2.statusCode, 200);

    const [events] = await pool.query(
      "SELECT id FROM security_events WHERE user_id = ? AND type = 'new_device'",
      [testUsers.emp1.id]
    );
    assert.ok(events.length >= 1);
  });
});
