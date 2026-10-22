/**
 * Production-ready structured logger with automatic secret redaction.
 */
const crypto = require('crypto');

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'cookie',
  'csrf_token',
  'secret',
  'jwt_secret',
  'email_pass',
  'db_password',
]);

function redact(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((item) => redact(item, depth + 1));

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redact(value, depth + 1);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function writeLog(level, message, meta = {}) {
  if (isTest && level !== 'error') return; // Silence non-error logs during automated tests

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redact(meta),
  };

  const output = isProduction ? JSON.stringify(logEntry) : `[${logEntry.timestamp}] [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(redact(meta)) : ''}`;

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

const logger = {
  info: (msg, meta) => writeLog('INFO', msg, meta),
  warn: (msg, meta) => writeLog('WARN', msg, meta),
  error: (msg, meta) => writeLog('ERROR', msg, meta),
  debug: (msg, meta) => writeLog('DEBUG', msg, meta),

  /**
   * Express middleware for request logging with correlation IDs.
   */
  requestLogger: () => (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode;
      const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

      // Avoid spamming logs for swagger docs or health check in development
      if (req.originalUrl.includes('/api-docs') || req.originalUrl === '/api/health') {
        return;
      }

      writeLog(level, `${req.method} ${req.originalUrl} ${statusCode} in ${durationMs}ms`, {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        durationMs,
        ip: req.ip || req.connection?.remoteAddress,
        userId: req.user?.id || null,
      });
    });

    next();
  },
};

module.exports = logger;
