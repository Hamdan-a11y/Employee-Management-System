const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin } = require('./helpers');

describe('Authentication & Session API Tests', () => {
  it('should reject registration when required fields are missing', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: '',
      email: '',
      password: ''
    });
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /required/i);
  });

  it('should reject registration with invalid email format', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Test Invalid Email',
      email: 'not-an-email',
      password: 'Password123!'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /valid email/i);
  });

  it('should successfully register a new employee user', async () => {
    const uniqueEmail = `testuser_${Date.now()}@example.com`;
    const res = await makeRequest('POST', '/auth/register', {
      name: 'New Registered User',
      email: uniqueEmail,
      password: 'Password123!'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.user);
    assert.strictEqual(res.data.user.role, 'employee');
    assert.strictEqual(res.data.user.email, uniqueEmail);
  });

  it('should reject registration when email already exists', async () => {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Duplicate Admin',
      email: 'admin@example.com',
      password: 'Password123!'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already exists/i);
  });

  it('should fail login with incorrect password', async () => {
    const res = await makeRequest('POST', '/auth/login', {
      email: 'admin@example.com',
      password: 'WrongPassword999!'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /invalid/i);
  });

  it('should fail login with non-existent email', async () => {
    const res = await makeRequest('POST', '/auth/login', {
      email: 'nonexistent_user_9999@example.com',
      password: 'Password123!'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /invalid/i);
  });

  it('should login successfully as admin and set session cookies', async () => {
    const admin = await loginAsAdmin();
    assert.strictEqual(admin.user.role, 'admin');
    assert.ok(admin.cookies.some(c => c.startsWith('access_token=') || c.startsWith('__Host-access_token=')));
    assert.ok(admin.cookies.some(c => c.startsWith('XSRF-TOKEN=')));
  });

  it('should verify active session via GET /api/auth/me', async () => {
    const admin = await loginAsAdmin();
    const res = await makeRequest('GET', '/auth/me', null, admin.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.user.email, 'admin@example.com');
    assert.strictEqual(res.data.user.role, 'admin');
  });

  it('should reject state-changing requests without CSRF token in csrfProtection middleware', () => {
    const { csrfProtection } = require('../middleware/csrf');
    let statusCode = null;
    let jsonMessage = null;
    const req = {
      method: 'POST',
      cookies: { 'XSRF-TOKEN': 'valid-csrf-token' },
      headers: {},
      body: {}
    };
    const res = {
      cookie: () => {},
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { jsonMessage = data; }
        };
      }
    };
    csrfProtection(req, res, () => {});
    assert.strictEqual(statusCode, 403);
    assert.match(jsonMessage.message, /csrf/i);
  });

  it('should successfully logout and clear session cookies', async () => {
    const admin = await loginAsAdmin();
    const res = await makeRequest('POST', '/auth/logout', {}, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);
  });
});
