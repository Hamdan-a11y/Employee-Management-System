const createLimiter = ({
  windowMs = 15 * 60 * 1000, // 15 minutes
  max = 100,
  message = 'Too many requests. Please try again later.',
} = {}) => {
  const store = new Map();

  // Periodic cleanup every 10 minutes to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) store.delete(key);
      else store.set(key, active);
    }
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    // Bypass rate limiting in automated testing environments
    if (process.env.NODE_ENV === 'test' || process.env.RATE_LIMIT_DISABLED === 'true') {
      return next();
    }

    const now = Date.now();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown-ip';

    const hits = (store.get(ip) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      const oldestHit = hits[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldestHit)) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        status: 'error',
        message,
        code: 'TOO_MANY_REQUESTS',
      });
    }

    hits.push(now);
    store.set(ip, hits);
    next();
  };
};

// General API rate limiter (600 requests per 15 minutes per IP)
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_PER_15_MIN || '600', 10),
  message: 'API rate limit exceeded. Please wait a few minutes before sending more requests.',
});

// Authentication endpoints rate limiter (30 attempts per 15 minutes per IP)
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_PER_15_MIN || '30', 10),
  message: 'Too many authentication attempts from this IP address. Please wait 15 minutes before retrying.',
});

// Password reset specific limiter (per IP and per Email)
const createPasswordResetLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxPerIp = 5,
  maxPerEmail = 3,
} = {}) => {
  const ipStore = new Map();
  const emailStore = new Map();

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
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const now = Date.now();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = req.body?.email?.trim()?.toLowerCase();

    // 1. Check IP limit
    const ipHits = (ipStore.get(ip) || []).filter((t) => now - t < windowMs);
    if (ipHits.length >= maxPerIp) {
      const oldestHit = ipHits[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldestHit)) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        message: 'Too many requests from this IP address. Please wait a few minutes before trying again.',
      });
    }

    // 2. Check Email limit
    if (email) {
      const emailHits = (emailStore.get(email) || []).filter((t) => now - t < windowMs);
      if (emailHits.length >= maxPerEmail) {
        const oldestHit = emailHits[0];
        const retryAfterSec = Math.ceil((windowMs - (now - oldestHit)) / 1000);
        res.setHeader('Retry-After', retryAfterSec);
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

module.exports = {
  apiLimiter,
  authLimiter,
  createPasswordResetLimiter,
};
