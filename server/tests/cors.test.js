const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isAllowedOrigin, allowedOrigins } = require('../utils/corsOrigins');

describe('CORS Multi-Domain Allowlist Tests', () => {
  it('should allow new Vercel domain explicitly', () => {
    assert.strictEqual(
      isAllowedOrigin('https://ivy-employee-management-system.vercel.app'),
      true
    );
  });

  it('should allow origin with trailing slash', () => {
    assert.strictEqual(
      isAllowedOrigin('https://ivy-employee-management-system.vercel.app/'),
      true
    );
  });

  it('should allow alternate/previous vercel.app domains', () => {
    assert.strictEqual(
      isAllowedOrigin('https://employee-system-client.vercel.app'),
      true
    );
    assert.strictEqual(
      isAllowedOrigin('https://ivy-employee-management-system-git-main.vercel.app'),
      true
    );
  });

  it('should allow requests with no origin (mobile or server-to-server)', () => {
    assert.strictEqual(isAllowedOrigin(undefined), true);
    assert.strictEqual(isAllowedOrigin(''), true);
  });

  it('should allow localhost development ports', () => {
    assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
    assert.strictEqual(isAllowedOrigin('http://127.0.0.1:5173'), true);
  });

  it('should reject unlisted untrusted third-party domains', () => {
    assert.strictEqual(isAllowedOrigin('https://malicious-attacker.com'), false);
    assert.strictEqual(isAllowedOrigin('https://phishing-site.org'), false);
  });
});

