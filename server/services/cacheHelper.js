const Redis = require('ioredis');

let redisClient = null;
let isRedisConnected = false;
let simulateDown = false;

// In-memory fallback store when Redis is unavailable or down
const inMemoryCache = new Map();

function initRedis() {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  redisClient = new Redis({
    host,
    port,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: () => null, // Don't retry if offline
    lazyConnect: true,
    commandTimeout: 500, // Fast fail
    connectTimeout: 500
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
  });

  // Try initial connection silently in background
  redisClient.connect().catch(() => {
    isRedisConnected = false;
  });

  return redisClient;
}

// Initialize on module load
try {
  initRedis();
} catch (e) {
  isRedisConnected = false;
}

const cacheHelper = {
  /**
   * Generates a standard dashboard cache key
   */
  getDashboardKey({ role = 'all', departmentId = null, date = 'today' } = {}) {
    const deptPart = departmentId !== null && departmentId !== undefined ? String(departmentId) : 'all';
    const datePart = date || 'today';
    return `dashboard:stats:role:${role}:dept:${deptPart}:date:${datePart}`;
  },

  /**
   * Get value from cache (Redis or in-memory fallback)
   */
  async get(key) {
    if (simulateDown) {
      return null;
    }

    if (isRedisConnected && redisClient) {
      try {
        const val = await redisClient.get(key);
        if (val) {
          return JSON.parse(val);
        }
      } catch (err) {
        // Fallback gracefully on Redis error
        isRedisConnected = false;
      }
    }

    // In-memory fallback
    const local = inMemoryCache.get(key);
    if (local) {
      if (Date.now() > local.expiresAt) {
        inMemoryCache.delete(key);
        return null;
      }
      return local.data;
    }

    return null;
  },

  /**
   * Set value in cache with TTL in seconds (default: 60)
   */
  async set(key, value, ttlSeconds = 60) {
    if (simulateDown) {
      return false;
    }

    const jsonStr = JSON.stringify(value);

    // Write to in-memory fallback
    inMemoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });

    if (isRedisConnected && redisClient) {
      try {
        await redisClient.set(key, jsonStr, 'EX', ttlSeconds);
        return true;
      } catch (err) {
        isRedisConnected = false;
        return false;
      }
    }

    return true;
  },

  /**
   * Invalidate specific key or keys matching pattern
   */
  async del(key) {
    inMemoryCache.delete(key);

    if (!simulateDown && isRedisConnected && redisClient) {
      try {
        await redisClient.del(key);
      } catch (err) {
        isRedisConnected = false;
      }
    }
  },

  /**
   * Invalidate all keys matching pattern (e.g. 'dashboard:stats:*')
   */
  async invalidatePattern(pattern) {
    // Clear matching keys in local memory
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const k of inMemoryCache.keys()) {
      if (regex.test(k)) {
        inMemoryCache.delete(k);
      }
    }

    if (!simulateDown && isRedisConnected && redisClient) {
      try {
        const keys = await redisClient.keys(pattern);
        if (keys && keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (err) {
        isRedisConnected = false;
      }
    }
  },

  /**
   * For testing: simulate Redis down state
   */
  simulateRedisDown(isDown = true) {
    simulateDown = isDown;
  },

  /**
   * For testing: clear all cache
   */
  clear() {
    inMemoryCache.clear();
  },

  isDown() {
    return simulateDown || !isRedisConnected;
  }
};

module.exports = cacheHelper;
