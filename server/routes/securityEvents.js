const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Admin-only access enforced on the server
router.use(authenticateToken, requireAdmin);

/**
 * GET /api/security-events
 * Paginated security events with filters: type, userId, startDate, endDate
 */
router.get('/', async (req, res) => {
  try {
    const {
      type,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = ' WHERE 1=1';
    const params = [];

    const allowedTypes = ['login_failed', 'lockout', 'token_reuse', 'rate_limit', 'new_device', 'permission_denied'];
    if (type && type !== 'all' && allowedTypes.includes(type)) {
      where += ' AND se.type = ?';
      params.push(type);
    }

    if (userId && userId !== 'all') {
      const uid = parseInt(userId, 10);
      if (!isNaN(uid)) {
        where += ' AND se.user_id = ?';
        params.push(uid);
      }
    }

    if (startDate) {
      where += ' AND se.created_at >= ?';
      params.push(new Date(startDate));
    }

    if (endDate) {
      where += ' AND se.created_at <= ?';
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      params.push(end);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM security_events se ${where}`,
      params
    );
    const total = countRows[0].total;

    const [events] = await pool.query(
      `SELECT
        se.id,
        se.type,
        se.user_id,
        u.name AS user_name,
        u.email AS user_email,
        se.ip,
        se.details,
        se.created_at
      FROM security_events se
      LEFT JOIN users u ON se.user_id = u.id
      ${where}
      ORDER BY se.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [statsRows] = await pool.query(`
      SELECT
        COUNT(*) AS totalCount,
        SUM(CASE WHEN type = 'login_failed' THEN 1 ELSE 0 END) AS loginFailedCount,
        SUM(CASE WHEN type = 'lockout' THEN 1 ELSE 0 END) AS lockoutCount,
        SUM(CASE WHEN type = 'token_reuse' THEN 1 ELSE 0 END) AS tokenReuseCount,
        SUM(CASE WHEN type = 'rate_limit' THEN 1 ELSE 0 END) AS rateLimitCount,
        SUM(CASE WHEN type = 'new_device' THEN 1 ELSE 0 END) AS newDeviceCount,
        SUM(CASE WHEN type = 'permission_denied' THEN 1 ELSE 0 END) AS permissionDeniedCount
      FROM security_events
    `);

    const [usersList] = await pool.query(
      'SELECT id, name, email FROM users ORDER BY name ASC'
    );

    res.json({
      events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      stats: statsRows[0] || {},
      users: usersList,
    });
  } catch (error) {
    console.error('[SecurityEvents] Failed to fetch security events:', error.message);
    res.status(500).json({ message: 'Failed to load security events.' });
  }
});

module.exports = router;
