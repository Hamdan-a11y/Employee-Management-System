const config = require('../config/env');

// Base list of explicitly supported origins
const baseOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'https://ivy-employee-management-system.vercel.app',
];

// Parse comma-separated origins from CLIENT_URL or ALLOWED_ORIGINS
const parseEnvUrls = (val) => {
  if (!val) return [];
  return val
    .split(',')
    .map((u) => u.trim().replace(/\/$/, ''))
    .filter(Boolean);
};

const configuredUrls = [
  ...parseEnvUrls(process.env.CLIENT_URL),
  ...parseEnvUrls(process.env.ALLOWED_ORIGINS),
  config.clientUrl ? config.clientUrl.replace(/\/$/, '') : null,
].filter(Boolean);

// Unique list of allowed origins
const allowedOrigins = Array.from(new Set([...baseOrigins, ...configuredUrls]));

/**
 * Check if the request origin is a localhost / dev origin
 */
const isDevOrigin = (origin) => {
  if (!config.isProduction && origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
};

/**
 * Determine if an origin is permitted by CORS
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Server-to-server or requests without Origin header

  const normalized = origin.trim().replace(/\/$/, '');

  // 1. Direct match in allowed list
  if (allowedOrigins.includes(normalized)) {
    return true;
  }

  // 2. Localhost in development mode
  if (isDevOrigin(origin)) {
    return true;
  }

  // 3. Any Vercel deployment of this application (production, branch preview, or alternate project domain)
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch (e) {
    return false;
  }

  return false;
};

module.exports = {
  allowedOrigins,
  isAllowedOrigin,
  isDevOrigin,
};

