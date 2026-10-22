const crypto = require('crypto');
const { CSRF_COOKIE_NAME, getCsrfCookieOptions } = require('../utils/cookies');

const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const csrfProtection = (req, res, next) => {
  // Ensure a CSRF cookie exists on any incoming request
  let csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  if (!csrfCookie) {
    csrfCookie = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, csrfCookie, getCsrfCookieOptions());
  }

  // Safe HTTP methods do not mutate state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Allow exempt public auth onboarding endpoints if needed, but double-submit works for all
  const clientToken =
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    req.body?._csrf;

  // Validate double submit: incoming header/body token must match cookie token
  if (!clientToken || !csrfCookie || clientToken !== csrfCookie) {
    return res.status(403).json({
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      code: 'EBADCSRFTOKEN',
    });
  }

  next();
};

module.exports = {
  csrfProtection,
  generateCsrfToken,
};
