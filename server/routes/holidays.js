const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/permissions');
const { logAudit } = require('../services/auditLogger');
const {
  formatDate,
  isMonthLocked,
  recalculateApprovedLeavesForHoliday
} = require('../services/calendarService');
const { assertPeriodOpen } = require('../services/periodService');

// All holiday routes require authentication
router.use(authenticateToken);

// ==========================================
// 1. GET /api/holidays — List Holidays
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { year, department_id, scope } = req.query;

    let query = `
      SELECT h.*, d.name AS department_name
      FROM holidays h
      LEFT JOIN departments d ON h.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (year) {
      const yearNum = parseInt(year, 10);
      query += ' AND (YEAR(h.date) = ? OR (h.end_date IS NOT NULL AND YEAR(h.end_date) = ?))';
      params.push(yearNum, yearNum);
    }

    if (department_id && department_id !== 'all') {
      query += " AND (h.scope = 'all' OR h.department_id = ?)";
      params.push(parseInt(department_id, 10));
    }

    if (scope && scope !== 'all_scopes') {
      query += ' AND h.scope = ?';
      params.push(scope);
    }

    query += ' ORDER BY h.date ASC';

    const [rows] = await pool.query(query, params);

    // Check locked payroll months for each holiday
    const [lockedRuns] = await pool.query(
      'SELECT DISTINCT month FROM payroll_runs WHERE status IN ("Approved", "Locked")'
    );
    const lockedMonthsSet = new Set(lockedRuns.map((r) => r.month));

    const formatted = rows.map((h) => {
      const startStr = formatDate(h.date);
      const endStr = h.end_date ? formatDate(h.end_date) : startStr;
      const startMonth = startStr.slice(0, 7);
      const endMonth = endStr.slice(0, 7);
      const isLocked = lockedMonthsSet.has(startMonth) || lockedMonthsSet.has(endMonth);

      return {
        ...h,
        date: startStr,
        end_date: h.end_date ? endStr : null,
        is_locked: isLocked
      };
    });

    res.json({ holidays: formatted });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load holidays.', error: err.message });
  }
});

// ==========================================
// 2. POST /api/holidays — Create Holiday
// ==========================================
router.post('/', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, date, end_date, scope = 'all', department_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Holiday name is required.' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Holiday start date is required.' });
    }

    const startDateStr = formatDate(date);
    const endDateStr = end_date ? formatDate(end_date) : null;

    if (endDateStr && endDateStr < startDateStr) {
      return res.status(400).json({ message: 'Holiday end date cannot be earlier than start date.' });
    }

    const deptId = scope === 'department' ? parseInt(department_id, 10) : null;
    if (scope === 'department' && !deptId) {
      return res.status(400).json({ message: 'Department is required for department-scoped holidays.' });
    }

    // Check if month is locked or closed
    await assertPeriodOpen(startDateStr, conn);
    if (endDateStr) await assertPeriodOpen(endDateStr, conn);

    const startMonth = startDateStr.slice(0, 7);
    const endMonth = endDateStr ? endDateStr.slice(0, 7) : startMonth;
    const isStartLocked = await isMonthLocked(startMonth, conn);
    const isEndLocked = await isMonthLocked(endMonth, conn);

    if (isStartLocked || isEndLocked) {
      return res.status(403).json({
        message: 'Cannot create holiday in an attendance month that has already been approved or locked by payroll.'
      });
    }

    // Check for duplicate holidays with same date range, scope, and department
    const [existing] = await conn.query(
      `SELECT id FROM holidays
       WHERE date = ?
         AND scope = ?
         AND ((department_id IS NULL AND ? IS NULL) OR department_id = ?)`,
      [startDateStr, scope, deptId, deptId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: 'A holiday on this date with the same scope already exists.'
      });
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO holidays (name, date, end_date, scope, department_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), startDateStr, endDateStr, scope, deptId]
    );

    const holidayId = result.insertId;
    const newHoliday = {
      id: holidayId,
      name: name.trim(),
      date: startDateStr,
      end_date: endDateStr,
      scope,
      department_id: deptId
    };

    // Recalculate leaves that overlap with this new holiday
    const recRes = await recalculateApprovedLeavesForHoliday(newHoliday, conn);

    await conn.commit();

    // Log Audit
    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'HOLIDAY',
      entityId: holidayId,
      employeeName: name.trim(),
      details: `Created holiday "${name.trim()}" (${startDateStr}${endDateStr ? ` to ${endDateStr}` : ''}) [Scope: ${scope}${deptId ? ` Dept #${deptId}` : ''}]. Recalculated ${recRes.updatedCount} approved leave(s).`
    }).catch(() => {});

    res.status(201).json({
      message: 'Holiday created successfully.',
      holiday: newHoliday,
      recalculatedLeaves: recRes.updatedLeaves
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Failed to create holiday.', error: err.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// 3. PUT /api/holidays/:id — Update Holiday
// ==========================================
router.put('/:id', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const holidayId = parseInt(req.params.id, 10);
    const { name, date, end_date, scope = 'all', department_id } = req.body;

    const [existing] = await conn.query('SELECT * FROM holidays WHERE id = ?', [holidayId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Holiday not found.' });
    }
    const currentHoliday = existing[0];

    // Check if existing month is locked
    const currStartMonth = formatDate(currentHoliday.date).slice(0, 7);
    await assertPeriodOpen(currStartMonth, conn);
    if (await isMonthLocked(currStartMonth, conn)) {
      return res.status(403).json({
        message: 'Holidays in a closed or locked attendance month cannot be edited.'
      });
    }

    const startDateStr = formatDate(date || currentHoliday.date);
    const endDateStr = end_date !== undefined ? (end_date ? formatDate(end_date) : null) : currentHoliday.end_date;

    if (endDateStr && endDateStr < startDateStr) {
      return res.status(400).json({ message: 'Holiday end date cannot be earlier than start date.' });
    }

    const newStartMonth = startDateStr.slice(0, 7);
    if (await isMonthLocked(newStartMonth, conn)) {
      return res.status(403).json({
        message: 'Cannot move holiday into a closed or locked attendance month.'
      });
    }

    const deptId = scope === 'department' ? parseInt(department_id, 10) : null;

    await conn.beginTransaction();

    await conn.query(
      `UPDATE holidays
       SET name = ?, date = ?, end_date = ?, scope = ?, department_id = ?
       WHERE id = ?`,
      [name.trim(), startDateStr, endDateStr, scope, deptId, holidayId]
    );

    const updatedHoliday = {
      id: holidayId,
      name: name.trim(),
      date: startDateStr,
      end_date: endDateStr,
      scope,
      department_id: deptId
    };

    const recRes = await recalculateApprovedLeavesForHoliday(updatedHoliday, conn);

    await conn.commit();

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'HOLIDAY',
      entityId: holidayId,
      employeeName: name.trim(),
      details: `Updated holiday "${name.trim()}" (${startDateStr}${endDateStr ? ` to ${endDateStr}` : ''})`
    }).catch(() => {});

    res.json({
      message: 'Holiday updated successfully.',
      holiday: updatedHoliday,
      recalculatedLeaves: recRes.updatedLeaves
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Failed to update holiday.', error: err.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// 4. DELETE /api/holidays/:id — Delete Holiday
// ==========================================
router.delete('/:id', requirePermission(PERMISSIONS.HOLIDAY_MANAGE), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const holidayId = parseInt(req.params.id, 10);
    const [existing] = await conn.query('SELECT * FROM holidays WHERE id = ?', [holidayId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Holiday not found.' });
    }
    const holiday = existing[0];

    const startMonth = formatDate(holiday.date).slice(0, 7);
    await assertPeriodOpen(startMonth, conn);
    if (await isMonthLocked(startMonth, conn)) {
      return res.status(403).json({
        message: 'Holidays in a closed or locked attendance month cannot be deleted.'
      });
    }

    await conn.beginTransaction();

    await conn.query('DELETE FROM holidays WHERE id = ?', [holidayId]);

    // Recalculate leaves previously overlapping this deleted holiday:
    // Any approved leave that overlapped this holiday will now count this day as a working day!
    const recRes = await recalculateApprovedLeavesForHoliday(holiday, conn);

    await conn.commit();

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'HOLIDAY',
      entityId: holidayId,
      employeeName: holiday.name,
      details: `Deleted holiday "${holiday.name}" on ${formatDate(holiday.date)}`
    }).catch(() => {});

    res.json({ message: 'Holiday deleted successfully.', recalculatedLeaves: recRes.updatedLeaves });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Failed to delete holiday.', error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
