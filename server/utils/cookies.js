const isProduction = process.env.NODE_ENV === 'production';

// __Host- prefix requires Secure=true over HTTPS and Path=/
const ACCESS_COOKIE_NAME = isProduction ? '__Host-access_token' : 'access_token';
const REFRESH_COOKIE_NAME = 'refresh_token';
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';

const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
});

const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

const getCsrfCookieOptions = () => ({
  httpOnly: false, // Double-submit pattern: readable by JS to attach X-CSRF-Token header
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const setAuthCookies = (res, { accessToken, refreshToken, csrfToken }) => {
  if (accessToken) {
    res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessTokenCookieOptions());
  }
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshTokenCookieOptions());
  }
  if (csrfToken) {
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
  }
};

const clearAuthCookies = (res) => {
  // Clear access token
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  if (ACCESS_COOKIE_NAME !== 'access_token') {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  // Clear refresh token (scoped to /api/auth)
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
  });

  // Clear CSRF token
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
};

const getAccessTokenFromReq = (req) => {
  return req.cookies?.[ACCESS_COOKIE_NAME] || req.cookies?.['access_token'] || null;
};

const getRefreshTokenFromReq = (req) => {
  return req.cookies?.[REFRESH_COOKIE_NAME] || null;
};

module.exports = {
  isProduction,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getCsrfCookieOptions,
  setAuthCookies,
  clearAuthCookies,
  getAccessTokenFromReq,
  getRefreshTokenFromReq,
};
