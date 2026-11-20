const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/permissions');
const { logAudit } = require('../services/auditLogger');
const { formatDate } = require('../services/calendarService');

router.use(authenticateToken);

// ==========================================
// 1. GET /api/working-week — List Configs & History
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { department_id, shift_id } = req.query;

    let query = `
      SELECT ww.*,
        d.name AS department_name,
        s.name AS shift_name,
        u.name AS creator_name
      FROM working_week_configs ww
      LEFT JOIN departments d ON ww.department_id = d.id
      LEFT JOIN shifts s ON ww.shift_id = s.id
      LEFT JOIN users u ON ww.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (department_id && department_id !== 'all') {
      query += ' AND (ww.scope = "company" OR (ww.scope = "department" AND ww.department_id = ?))';
      params.push(parseInt(department_id, 10));
    }

    if (shift_id && shift_id !== 'all') {
      query += ' AND (ww.scope = "company" OR (ww.scope = "shift" AND ww.shift_id = ?))';
      params.push(parseInt(shift_id, 10));
    }

    query += ' ORDER BY ww.effective_from DESC, ww.id DESC';

    const [rows] = await pool.query(query, params);

    const formatted = rows.map((r) => ({
      ...r,
      monday: Boolean(r.monday),
      tuesday: Boolean(r.tuesday),
      wednesday: Boolean(r.wednesday),
      thursday: Boolean(r.thursday),
      friday: Boolean(r.friday),
      saturday: Boolean(r.saturday),
      sunday: Boolean(r.sunday),
      effective_from: formatDate(r.effective_from)
    }));

    // Find current active configurations (effective_from <= TODAY) by scope
    const todayStr = formatDate(new Date());
    const currentCompany = formatted.find(
      (c) => c.scope === 'company' && c.effective_from <= todayStr
    ) || formatted.find((c) => c.scope === 'company') || null;

    res.json({
      currentCompany,
      history: formatted
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load working week configs.', error: err.message });
  }
});

// ==========================================
// 2. POST /api/working-week — Configure Working Week
// ==========================================
router.post('/', requirePermission(PERMISSIONS.WORKING_WEEK_MANAGE), async (req, res) => {
  try {
    const {
      scope = 'company',
      department_id,
      shift_id,
      monday = true,
      tuesday = true,
      wednesday = true,
      thursday = true,
      friday = true,
      saturday = false,
      sunday = false,
      effective_from
    } = req.body;

    if (!effective_from) {
      return res.status(400).json({ message: 'Effective date (effective_from) is required.' });
    }

    const effectiveDateStr = formatDate(effective_from);

    // Ensure at least one day of the week is active
    const daysSelected = [monday, tuesday, wednesday, thursday, friday, saturday, sunday].some(Boolean);
    if (!daysSelected) {
      return res.status(400).json({ message: 'At least one working day must be selected.' });
    }

    const deptId = scope === 'department' ? parseInt(department_id, 10) : null;
    const sId = scope === 'shift' ? parseInt(shift_id, 10) : null;

    if (scope === 'department' && !deptId) {
      return res.status(400).json({ message: 'Department is required for department-scoped working week.' });
    }
    if (scope === 'shift' && !sId) {
      return res.status(400).json({ message: 'Shift is required for shift-scoped working week.' });
    }

    // Insert new version preserving history
    const [result] = await pool.query(
      `INSERT INTO working_week_configs (
        scope, department_id, shift_id,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        effective_from, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scope,
        deptId,
        sId,
        monday ? 1 : 0,
        tuesday ? 1 : 0,
        wednesday ? 1 : 0,
        thursday ? 1 : 0,
        friday ? 1 : 0,
        saturday ? 1 : 0,
        sunday ? 1 : 0,
        effectiveDateStr,
        req.user.id
      ]
    );

    const newId = result.insertId;

    const daysSummary = [
      monday && 'Mon',
      tuesday && 'Tue',
      wednesday && 'Wed',
      thursday && 'Thu',
      friday && 'Fri',
      saturday && 'Sat',
      sunday && 'Sun'
    ].filter(Boolean).join(', ');

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'WORKING_WEEK',
      entityId: newId,
      employeeName: `Scope: ${scope}`,
      details: `Configured working week [${daysSummary}] effective from ${effectiveDateStr} for ${scope}${deptId ? ` Dept #${deptId}` : ''}${sId ? ` Shift #${sId}` : ''}`
    }).catch(() => {});

    res.status(201).json({
      message: 'Working week configuration saved successfully.',
      id: newId,
      effective_from: effectiveDateStr
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save working week config.', error: err.message });
  }
});

module.exports = router;
