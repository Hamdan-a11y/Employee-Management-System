const crypto = require('crypto');
const pool = require('../db');
const { notifyUser } = require('./notificationService');

const DEVICE_COOKIE_NAME = 'device_id';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Extracts normalized client IP from Express request.
 */
function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  let ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null);
  ip = ip || req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip ? String(ip).slice(0, 45) : null;
}

/**
 * Extracts IP range prefix (/24 for IPv4, /48 for IPv6) for new-location detection.
 */
function getIpRange(ip) {
  if (!ip) return 'unknown';
  let clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }
  if (clean.includes(':')) {
    const parts = clean.split(':');
    return `${parts.slice(0, 3).join(':')}::/48`;
  }
  return clean;
}

/**
 * Reads or issues a random device_id cookie and returns { ip, userAgent, deviceId }.
 */
function getRequestMeta(req, res = null) {
  const ip = getClientIp(req);
  const rawUa = req?.headers?.['user-agent'] || null;
  const userAgent = rawUa ? String(rawUa).slice(0, 512) : null;

  let deviceId = req?.cookies?.[DEVICE_COOKIE_NAME] || req?.headers?.['x-device-id'] || null;
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 64) {
    deviceId = crypto.randomUUID();
    if (res && typeof res.cookie === 'function') {
      res.cookie(DEVICE_COOKIE_NAME, deviceId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }
  }

  return { ip, userAgent, deviceId };
}

/**
 * Records a security event in security_events. Non-blocking on failure.
 */
async function logSecurityEvent({ type, userId = null, ip = null, details = null, req = null }) {
  try {
    const effectiveIp = ip || getClientIp(req);
    const effectiveUserId = userId ?? req?.user?.id ?? null;
    await pool.query(
      'INSERT INTO security_events (type, user_id, ip, details) VALUES (?, ?, ?, ?)',
      [type, effectiveUserId, effectiveIp, details ? String(details).slice(0, 2000) : null]
    );
  } catch (err) {
    console.error('[SecurityService Warning] Failed to write security event:', err.message);
  }
}

/**
 * Checks if this login comes from an unseen device_id or IP range for the user.
 * If the user has prior sessions and neither device_id nor IP range matches,
 * logs a `new_device` security event and notifies the user.
 */
async function checkAndNotifyNewDevice({ userId, ip, userAgent, deviceId }) {
  try {
    const [prior] = await pool.query(
      'SELECT device_id, ip FROM refresh_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [userId]
    );

    if (prior.length === 0) {
      return false; // First-ever recorded session
    }

    const currentRange = getIpRange(ip);
    const knownDevice = deviceId && prior.some((r) => r.device_id && r.device_id === deviceId);
    const knownIpRange = ip && prior.some((r) => r.ip && getIpRange(r.ip) === currentRange);

    if (!knownDevice || !knownIpRange) {
      const reason = !knownDevice && !knownIpRange
        ? 'new device and IP range'
        : !knownDevice
          ? 'new device'
          : 'new IP range';

      await logSecurityEvent({
        type: 'new_device',
        userId,
        ip,
        details: `Sign-in from ${reason} (device: ${deviceId || 'unknown'}, ua: ${userAgent || 'unknown'})`,
      });

      await notifyUser({
        userId,
        type: 'security',
        title: 'New Sign-In Detected',
        message: `A new sign-in to your account was detected from a ${reason} (IP: ${ip || 'unknown'}). If this wasn't you, revoke the session and change your password immediately.`,
      });

      return true;
    }

    return false;
  } catch (err) {
    console.error('[SecurityService Warning] New device check failed:', err.message);
    return false;
  }
}

module.exports = {
  DEVICE_COOKIE_NAME,
  getClientIp,
  getIpRange,
  getRequestMeta,
  logSecurityEvent,
  checkAndNotifyNewDevice,
};
