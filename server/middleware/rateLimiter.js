const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const { getClientIp, logSecurityEvent } = require('../services/securityService');
const { getAccessTokenFromReq } = require('../utils/cookies');

function getUserIdForRateLimit(req) {
  if (req.user?.id) return req.user.id;
  try {
    const cookieToken = getAccessTokenFromReq(req);
    const authHeader = req.headers?.['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    const token = cookieToken || headerToken;
    if (token && process.env.JWT_SECRET) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.id) return decoded.id;
    }
  } catch (e) {
    // Ignore invalid/expired token for rate limit key fallback
  }
  return null;
}

let redisClient = null;
let isRedisConnected = false;

function initRateLimitRedis() {
  if (redisClient) return redisClient;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  redisClient = new Redis({
    host,
    port,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: () => null,
    lazyConnect: true,
    commandTimeout: 300,
    connectTimeout: 300,
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
  });
  redisClient.on('error', () => {
    isRedisConnected = false;
  });

  redisClient.connect().catch(() => {
    isRedisConnected = false;
  });

  return redisClient;
}

try {
  initRateLimitRedis();
} catch (e) {
  isRedisConnected = false;
}

const memoryStores = [];

const isBypassed = () => {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return true;
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true') {
    return true;
  }
  return false;
};

/**
 * Sliding-window / fixed-window rate limiter backed by Redis with automatic in-memory fallback.
 * Logs repeated violations as `rate_limit` security events (or `lockout` when configured).
 */
const createLimiter = ({
  prefix = 'rl:gen',
  windowMs = 60 * 1000,
  max = 100,
  message = 'Too many requests. Please try again later.',
  keyGenerator = (req) => `ip:${getClientIp(req) || 'unknown'}`,
  violationType = 'rate_limit',
  onLimitReached = null,
  skip = null,
} = {}) => {
  const memStore = new Map();
  const violationStore = new Map();
  memoryStores.push(memStore, violationStore);

  setInterval(() => {
    const now = Date.now();
    for (const [k, hits] of memStore.entries()) {
      const active = hits.filter((t) => now - t < windowMs);
      if (active.length === 0) memStore.delete(k);
      else memStore.set(k, active);
    }
    for (const [k, hits] of violationStore.entries()) {
      const active = hits.filter((t) => now - t < windowMs);
      if (active.length === 0) violationStore.delete(k);
      else violationStore.set(k, active);
    }
  }, 10 * 60 * 1000).unref();

  return async (req, res, next) => {
    if (isBypassed() || req.method === 'OPTIONS' || (typeof skip === 'function' && skip(req))) {
      return next();
    }

    const rawKey = keyGenerator(req);
    const fullKey = `${prefix}:${rawKey}`;
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

    let count = 0;
    let retryAfterSec = windowSec;

    if (isRedisConnected && redisClient) {
      try {
        count = await redisClient.incr(fullKey);
        if (count === 1) {
          await redisClient.expire(fullKey, windowSec);
        } else {
          const ttl = await redisClient.ttl(fullKey);
          if (ttl > 0) retryAfterSec = ttl;
        }
      } catch (err) {
        isRedisConnected = false;
        count = 0; // Fall through to memory fallback
      }
    }

    if (!isRedisConnected || count === 0) {
      const now = Date.now();
      const hits = (memStore.get(fullKey) || []).filter((t) => now - t < windowMs);
      if (hits.length >= max) {
        retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
        count = hits.length + 1;
      } else {
        hits.push(now);
        memStore.set(fullKey, hits);
        count = hits.length;
      }
    }

    if (count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));

      // Track violations for repeated abuse logging
      const now = Date.now();
      const vHits = (violationStore.get(fullKey) || []).filter((t) => now - t < windowMs);
      vHits.push(now);
      violationStore.set(fullKey, vHits);

      if (violationType === 'lockout' || vHits.length >= 2) {
        logSecurityEvent({
          type: violationType,
          req,
          details: `Rate limit exceeded (${prefix}) for key ${rawKey}; violations in window: ${vHits.length}`,
        });
      }

      if (typeof onLimitReached === 'function') {
        onLimitReached(req, rawKey, vHits.length);
      }

      return res.status(429).json({
        success: false,
        status: 'error',
        message,
        code: 'TOO_MANY_REQUESTS',
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
};

// General API rate limiter: 100 requests per minute per user (falls back to IP when unauthenticated)
const apiLimiter = createLimiter({
  prefix: 'rl:api',
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_PER_MIN || '100', 10),
  message: 'API rate limit exceeded (100 requests/min). Please wait before sending more requests.',
  skip: (req) => req.path.startsWith('/auth/') || req.path === '/health',
  keyGenerator: (req) => {
    const uid = getUserIdForRateLimit(req);
    return uid ? `user:${uid}` : `ip:${getClientIp(req) || 'unknown'}`;
  },
});

// Login rate limiter: 5 attempts per 15 minutes per IP + email
const loginLimiter = createLimiter({
  prefix: 'rl:login',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many failed login attempts. Account/IP locked for 15 minutes. Please try again later.',
  violationType: 'lockout',
  keyGenerator: (req) => {
    const ip = getClientIp(req) || 'unknown';
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : 'no-email';
    return `${ip}:${email}`;
  },
});

// Registration / general auth rate limiter
const authLimiter = createLimiter({
  prefix: 'rl:auth',
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_PER_15_MIN || '30', 10),
  message: 'Too many authentication attempts from this IP address. Please wait 15 minutes before retrying.',
});

// Attendance check-in/out rate limiter: 10 requests per minute per user
const attendanceLimiter = createLimiter({
  prefix: 'rl:attendance',
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many attendance punch attempts (max 10/min). Please wait a minute before trying again.',
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req) || 'unknown'}`),
});

// Password reset specific limiter (per IP and per Email)
const createPasswordResetLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxPerIp = 5,
  maxPerEmail = 3,
} = {}) => {
  const ipStore = new Map();
  const emailStore = new Map();
  memoryStores.push(ipStore, emailStore);

  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of ipStore.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) ipStore.delete(key);
      else ipStore.set(key, active);
    }
    for (const [key, timestamps] of emailStore.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) emailStore.delete(key);
      else emailStore.set(key, active);
    }
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    if (isBypassed()) {
      return next();
    }

    const now = Date.now();
    const ip = getClientIp(req) || 'unknown-ip';
    const email = req.body?.email?.trim()?.toLowerCase();

    const ipHits = (ipStore.get(ip) || []).filter((t) => now - t < windowMs);
    if (ipHits.length >= maxPerIp) {
      const oldestHit = ipHits[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldestHit)) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        message: 'Too many requests from this IP address. Please wait a few minutes before trying again.',
      });
    }

    if (email) {
      const emailHits = (emailStore.get(email) || []).filter((t) => now - t < windowMs);
      if (emailHits.length >= maxPerEmail) {
        const oldestHit = emailHits[0];
        const retryAfterSec = Math.ceil((windowMs - (now - oldestHit)) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          message: 'Too many reset requests for this email address. Please check your inbox or wait before retrying.',
        });
      }
      emailHits.push(now);
      emailStore.set(email, emailHits);
    }

    ipHits.push(now);
    ipStore.set(ip, ipHits);
    next();
  };
};

function resetRateLimiters() {
  for (const store of memoryStores) {
    store.clear();
  }
}

module.exports = {
  apiLimiter,
  loginLimiter,
  authLimiter,
  attendanceLimiter,
  createPasswordResetLimiter,
  resetRateLimiters,
};
