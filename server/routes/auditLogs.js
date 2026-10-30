const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

// All audit log endpoints are protected and accessible to users with audit.view permission (Admin, HR Manager)
router.use(authenticateToken, requirePermission('audit.view'));

/**
 * GET /api/audit-logs
 * Retrieves paginated audit logs with optional search, action filtering, and summary metrics.
 */
router.get('/', async (req, res) => {
  try {
    const {
      search,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let baseFilter = ' WHERE 1=1';
    const params = [];

    if (search && search.trim() !== '') {
      baseFilter += ' AND (employee_name LIKE ? OR user_name LIKE ? OR user_email LIKE ? OR details LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (action && action !== 'all') {
      baseFilter += ' AND action = ?';
      params.push(action);
    }

    if (startDate) {
      baseFilter += ' AND created_at >= ?';
      params.push(new Date(startDate));
    }

    if (endDate) {
      // Include full day of endDate
      baseFilter += ' AND created_at <= ?';
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      params.push(end);
    }

    // 1. Total matching count
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs ${baseFilter}`,
      params
    );
    const total = countResult[0].total;

    // 2. Fetch paginated records
    const [logs] = await pool.query(
      `SELECT 
        id,
        user_id,
        user_name,
        user_email,
        action,
        entity_type,
        entity_id,
        employee_name,
        details,
        ip_address,
        created_at
      FROM audit_logs
      ${baseFilter}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    // 3. Overall action summary metrics for quick dashboard stat pills
    const [statsResult] = await pool.query(`
      SELECT
        COUNT(*) AS totalCount,
        SUM(CASE WHEN action = 'CREATE' THEN 1 ELSE 0 END) AS createCount,
        SUM(CASE WHEN action = 'UPDATE' THEN 1 ELSE 0 END) AS updateCount,
        SUM(CASE WHEN action = 'DELETE' THEN 1 ELSE 0 END) AS deleteCount
      FROM audit_logs
    `);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      },
      stats: {
        total: statsResult[0].totalCount || 0,
        creates: statsResult[0].createCount || 0,
        updates: statsResult[0].updateCount || 0,
        deletes: statsResult[0].deleteCount || 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch audit logs.', error: error.message });
  }
});

module.exports = router;
