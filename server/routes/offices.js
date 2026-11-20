const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, verifyDepartmentAccess } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/permissions');
const { logAudit } = require('../services/auditLogger');
const {
  validateCoordinates,
  isLocationExempt
} = require('../services/locationService');

// All office and location routes require authentication
router.use(authenticateToken);

// ==========================================
// 1. OFFICE LOCATIONS CRUD
// ==========================================

/**
 * GET /api/offices
 * Returns all office locations with attendance usage counters.
 */
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    let query = `
      SELECT o.*,
        (SELECT COUNT(*) FROM attendance a WHERE a.check_in_office_id = o.id OR a.check_out_office_id = o.id) AS attendance_count
      FROM office_locations o
    `;
    const params = [];

    if (active === 'true') {
      query += ' WHERE o.is_active = TRUE';
    } else if (active === 'false') {
      query += ' WHERE o.is_active = FALSE';
    }

    query += ' ORDER BY o.is_active DESC, o.name ASC';

    const [rows] = await pool.query(query, params);

    const formatted = rows.map((o) => ({
      ...o,
      latitude: parseFloat(o.latitude),
      longitude: parseFloat(o.longitude),
      allowed_radius: parseInt(o.allowed_radius, 10),
      is_active: Boolean(o.is_active),
      can_delete: o.attendance_count === 0
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch office locations.', error: error.message });
  }
});

/**
 * GET /api/offices/:id
 * Single office details.
 */
router.get('/:id', async (req, res) => {
  try {
    const officeId = parseInt(req.params.id, 10);
    if (isNaN(officeId)) {
      return res.status(400).json({ message: 'Invalid office ID.' });
    }

    const [rows] = await pool.query(
      `SELECT o.*,
        (SELECT COUNT(*) FROM attendance a WHERE a.check_in_office_id = o.id OR a.check_out_office_id = o.id) AS attendance_count
       FROM office_locations o WHERE o.id = ?`,
      [officeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Office location not found.' });
    }

    const o = rows[0];
    res.json({
      ...o,
      latitude: parseFloat(o.latitude),
      longitude: parseFloat(o.longitude),
      allowed_radius: parseInt(o.allowed_radius, 10),
      is_active: Boolean(o.is_active),
      can_delete: o.attendance_count === 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch office.', error: error.message });
  }
});

/**
 * Helper to validate office payload.
 */
function validateOfficePayload(body) {
  const { name, address, latitude, longitude, allowed_radius } = body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return 'Office name is required and must be at least 2 characters.';
  }

  if (!address || typeof address !== 'string' || address.trim().length < 3) {
    return 'Office address is required.';
  }

  const coordErr = validateCoordinates(latitude, longitude);
  if (coordErr) {
    return coordErr;
  }

  const radius = parseInt(allowed_radius, 10);
  if (isNaN(radius) || radius < 10) {
    return 'Allowed geofence radius must be at least 10 meters.';
  }

  return null;
}

/**
 * POST /api/offices
 * Create a new office location. Restricted to Admin and HR Manager.
 */
router.post('/', requirePermission(PERMISSIONS.LOCATION_MANAGE), async (req, res) => {
  try {
    const valErr = validateOfficePayload(req.body);
    if (valErr) {
      return res.status(400).json({ message: valErr });
    }

    const {
      name,
      address,
      latitude,
      longitude,
      allowed_radius = 100,
      is_active = true
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO office_locations (name, address, latitude, longitude, allowed_radius, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        address.trim(),
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(allowed_radius, 10),
        is_active ? 1 : 0
      ]
    );

    const newId = result.insertId;

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'OFFICE_LOCATION',
      entityId: newId,
      employeeName: 'System Office',
      details: `Created office location "${name.trim()}" (radius: ${allowed_radius}m)`
    });

    res.status(201).json({
      message: 'Office location created successfully.',
      office: {
        id: newId,
        name: name.trim(),
        address: address.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        allowed_radius: parseInt(allowed_radius, 10),
        is_active: Boolean(is_active)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create office location.', error: error.message });
  }
});

/**
 * PUT /api/offices/:id
 * Update office location. Restricted to Admin and HR Manager.
 */
router.put('/:id', requirePermission(PERMISSIONS.LOCATION_MANAGE), async (req, res) => {
  try {
    const officeId = parseInt(req.params.id, 10);
    if (isNaN(officeId)) {
      return res.status(400).json({ message: 'Invalid office ID.' });
    }

    const [existing] = await pool.query('SELECT * FROM office_locations WHERE id = ?', [officeId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Office location not found.' });
    }

    const valErr = validateOfficePayload(req.body);
    if (valErr) {
      return res.status(400).json({ message: valErr });
    }

    const {
      name,
      address,
      latitude,
      longitude,
      allowed_radius = 100,
      is_active = true
    } = req.body;

    await pool.query(
      `UPDATE office_locations
       SET name = ?, address = ?, latitude = ?, longitude = ?, allowed_radius = ?, is_active = ?
       WHERE id = ?`,
      [
        name.trim(),
        address.trim(),
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(allowed_radius, 10),
        is_active ? 1 : 0,
        officeId
      ]
    );

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'OFFICE_LOCATION',
      entityId: officeId,
      employeeName: 'System Office',
      details: `Updated office location "${name.trim()}"`
    });

    res.json({
      message: 'Office location updated successfully.',
      office: {
        id: officeId,
        name: name.trim(),
        address: address.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        allowed_radius: parseInt(allowed_radius, 10),
        is_active: Boolean(is_active)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update office location.', error: error.message });
  }
});

/**
 * PATCH /api/offices/:id/status
 * Toggle office active/inactive status.
 */
router.patch('/:id/status', requirePermission(PERMISSIONS.LOCATION_MANAGE), async (req, res) => {
  try {
    const officeId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const [existing] = await pool.query('SELECT * FROM office_locations WHERE id = ?', [officeId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Office location not found.' });
    }

    const newStatus = is_active !== undefined ? Boolean(is_active) : !existing[0].is_active;

    await pool.query('UPDATE office_locations SET is_active = ? WHERE id = ?', [newStatus ? 1 : 0, officeId]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'OFFICE_LOCATION',
      entityId: officeId,
      employeeName: 'System Office',
      details: `${newStatus ? 'Activated' : 'Deactivated'} office location "${existing[0].name}"`
    });

    res.json({
      message: `Office location ${newStatus ? 'activated' : 'deactivated'} successfully.`,
      is_active: newStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle office status.', error: error.message });
  }
});

/**
 * DELETE /api/offices/:id
 * Requirement 1: "An office with attendance records can't be deleted, only deactivated."
 */
router.delete('/:id', requirePermission(PERMISSIONS.LOCATION_MANAGE), async (req, res) => {
  try {
    const officeId = parseInt(req.params.id, 10);
    if (isNaN(officeId)) {
      return res.status(400).json({ message: 'Invalid office ID.' });
    }

    const [existing] = await pool.query('SELECT * FROM office_locations WHERE id = ?', [officeId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Office location not found.' });
    }
    const office = existing[0];

    // Check if any attendance records reference this office
    const [attRows] = await pool.query(
      `SELECT COUNT(*) as count FROM attendance
       WHERE check_in_office_id = ? OR check_out_office_id = ?`,
      [officeId, officeId]
    );

    if (attRows[0].count > 0) {
      return res.status(400).json({
        message: `Office "${office.name}" has ${attRows[0].count} linked attendance record(s) and cannot be deleted. You can deactivate it instead.`,
        attendance_count: attRows[0].count,
        can_deactivate: true
      });
    }

    await pool.query('DELETE FROM office_locations WHERE id = ?', [officeId]);

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'OFFICE_LOCATION',
      entityId: officeId,
      employeeName: 'System Office',
      details: `Deleted unlinked office location "${office.name}"`
    });

    res.json({ message: `Office location "${office.name}" deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete office location.', error: error.message });
  }
});

// ==========================================
// 2. LOCATION EXEMPTIONS
// ==========================================

/**
 * GET /api/offices/exemptions
 * List exemptions with employee/dept details.
 */
router.get('/exemptions/list', async (req, res) => {
  try {
    let query = `
      SELECT ex.*,
        e.name AS employee_name,
        e.email AS employee_email,
        d.name AS department_name,
        u.name AS approved_by_name
      FROM location_exemptions ex
      LEFT JOIN employees e ON ex.employee_id = e.id
      LEFT JOIN departments d ON ex.department_id = d.id
      LEFT JOIN users u ON ex.approved_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // RBAC: Employee sees their own, Dept Manager sees their department
    if (req.user.role === 'employee') {
      const empId = req.user.employee_id;
      if (!empId) return res.json([]);
      query += ' AND (ex.employee_id = ? OR ex.department_id = ?)';
      params.push(empId, req.user.department_id || 0);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) return res.json([]);
      query += ' AND (ex.department_id = ? OR e.department_id = ?)';
      params.push(req.user.department_id, req.user.department_id);
    }

    query += ' ORDER BY ex.is_active DESC, ex.start_date DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch exemptions.', error: error.message });
  }
});

/**
 * GET /api/offices/exemptions/check-self
 * Check if the currently logged in user is location exempt today.
 */
router.get('/exemptions/check-self', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) {
      return res.json({ isExempt: false, reason: null });
    }
    const result = await isLocationExempt(empId, req.user.department_id, new Date(), pool);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to check exemption status.', error: error.message });
  }
});

/**
 * POST /api/offices/exemptions
 * Create a location exemption. Restricted to Admin and HR Manager.
 */
router.post('/exemptions', requirePermission(PERMISSIONS.LOCATION_EXEMPT), async (req, res) => {
  try {
    const { employee_id, department_id, reason, start_date, end_date } = req.body;

    if (!employee_id && !department_id) {
      return res.status(400).json({ message: 'Must specify either an employee or a department for exemption.' });
    }
    if (employee_id && department_id) {
      return res.status(400).json({ message: 'Specify either an employee OR a department, not both simultaneously.' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ message: 'Please provide a clear reason for the location exemption.' });
    }

    if (!start_date) {
      return res.status(400).json({ message: 'Start date is required.' });
    }

    if (end_date && end_date < start_date) {
      return res.status(400).json({ message: 'End date cannot be earlier than start date.' });
    }

    let targetName = 'Unknown';
    if (employee_id) {
      const [empRows] = await pool.query('SELECT name FROM employees WHERE id = ?', [employee_id]);
      if (empRows.length === 0) return res.status(404).json({ message: 'Employee not found.' });
      targetName = empRows[0].name;
    } else {
      const [deptRows] = await pool.query('SELECT name FROM departments WHERE id = ?', [department_id]);
      if (deptRows.length === 0) return res.status(404).json({ message: 'Department not found.' });
      targetName = `Dept: ${deptRows[0].name}`;
    }

    const [resEx] = await pool.query(
      `INSERT INTO location_exemptions (employee_id, department_id, reason, start_date, end_date, approved_by, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [
        employee_id ? parseInt(employee_id, 10) : null,
        department_id ? parseInt(department_id, 10) : null,
        reason.trim(),
        start_date,
        end_date || null,
        req.user.id
      ]
    );

    const newId = resEx.insertId;

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'LOCATION_EXEMPTION',
      entityId: newId,
      employeeName: targetName,
      details: `Granted location exemption to ${targetName} (${reason.trim()}): ${start_date}${end_date ? ` to ${end_date}` : ' (ongoing)'}`
    });

    res.status(201).json({
      message: `Location exemption granted to ${targetName}.`,
      exemption_id: newId
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create exemption.', error: error.message });
  }
});

/**
 * PATCH /api/offices/exemptions/:id/revoke
 * Revoke or deactivate an exemption.
 */
router.patch('/exemptions/:id/revoke', requirePermission(PERMISSIONS.LOCATION_EXEMPT), async (req, res) => {
  try {
    const exId = parseInt(req.params.id, 10);
    const [existing] = await pool.query(
      `SELECT ex.*, e.name AS employee_name, d.name AS department_name
       FROM location_exemptions ex
       LEFT JOIN employees e ON ex.employee_id = e.id
       LEFT JOIN departments d ON ex.department_id = d.id
       WHERE ex.id = ?`,
      [exId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Exemption not found.' });
    }

    const ex = existing[0];
    const targetName = ex.employee_name || (ex.department_name ? `Dept: ${ex.department_name}` : 'Target');

    await pool.query('UPDATE location_exemptions SET is_active = FALSE WHERE id = ?', [exId]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'LOCATION_EXEMPTION',
      entityId: exId,
      employeeName: targetName,
      details: `Revoked location exemption for ${targetName}`
    });

    res.json({ message: `Location exemption for ${targetName} revoked successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to revoke exemption.', error: error.message });
  }
});

// ==========================================
// 3. ATTENDANCE MAP & GEOLOCATION LOGS
// ==========================================

/**
 * GET /api/offices/attendance-map
 * Requirement 5: "Attendance map page: filter by date, department, and employee.
 * Show check-in points as markers with employee name, time, and distance.
 * Color markers by status (inside, outside, exempt).
 * Employees can see the map only for their own check-ins."
 */
router.get('/attendance-map', async (req, res) => {
  try {
    const { date, department_id, employee_id, status } = req.query;
    const targetDate = date ? date.split('T')[0] : new Date().toISOString().split('T')[0];

    // 1. Fetch active offices for geofence circles
    const [offices] = await pool.query(
      'SELECT id, name, address, latitude, longitude, allowed_radius FROM office_locations WHERE is_active = TRUE'
    );

    const formattedOffices = offices.map((o) => ({
      ...o,
      latitude: parseFloat(o.latitude),
      longitude: parseFloat(o.longitude),
      allowed_radius: parseInt(o.allowed_radius, 10)
    }));

    // 2. Build attendance markers query
    let query = `
      SELECT
        a.id,
        a.employee_id,
        e.name AS employee_name,
        e.department_id,
        d.name AS department_name,
        e.designation,
        a.date,
        a.check_in,
        a.check_out,
        a.check_in_latitude,
        a.check_in_longitude,
        a.check_in_accuracy,
        a.check_in_distance,
        a.check_in_location_status,
        in_off.name AS check_in_office_name,
        a.check_out_latitude,
        a.check_out_longitude,
        a.check_out_accuracy,
        a.check_out_distance,
        a.check_out_location_status,
        out_off.name AS check_out_office_name,
        a.is_flagged_suspicious,
        a.suspicious_reason
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN office_locations in_off ON a.check_in_office_id = in_off.id
      LEFT JOIN office_locations out_off ON a.check_out_office_id = out_off.id
      WHERE a.date = ?
    `;
    const params = [targetDate];

    // RBAC Scoping
    if (req.user.role === 'employee') {
      const empId = req.user.employee_id;
      if (!empId) {
        return res.json({ date: targetDate, offices: formattedOffices, points: [] });
      }
      query += ' AND a.employee_id = ?';
      params.push(empId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        return res.json({ date: targetDate, offices: formattedOffices, points: [] });
      }
      query += ' AND e.department_id = ?';
      params.push(req.user.department_id);
    } else {
      // Admin / HR Manager filters
      if (department_id && department_id !== 'all') {
        query += ' AND e.department_id = ?';
        params.push(parseInt(department_id, 10));
      }
      if (employee_id && employee_id !== 'all') {
        query += ' AND a.employee_id = ?';
        params.push(parseInt(employee_id, 10));
      }
    }

    if (status && status !== 'all') {
      query += ' AND (a.check_in_location_status = ? OR a.check_out_location_status = ?)';
      params.push(status, status);
    }

    query += ' ORDER BY a.check_in DESC';

    const [rows] = await pool.query(query, params);

    const points = [];
    for (const row of rows) {
      if (row.check_in_latitude && row.check_in_longitude) {
        points.push({
          attendance_id: row.id,
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          department_name: row.department_name,
          designation: row.designation,
          type: 'check_in',
          time: row.check_in,
          latitude: parseFloat(row.check_in_latitude),
          longitude: parseFloat(row.check_in_longitude),
          accuracy: parseFloat(row.check_in_accuracy || 0),
          distance: parseFloat(row.check_in_distance || 0),
          location_status: row.check_in_location_status,
          office_name: row.check_in_office_name,
          is_flagged_suspicious: Boolean(row.is_flagged_suspicious),
          suspicious_reason: row.suspicious_reason
        });
      }

      if (row.check_out_latitude && row.check_out_longitude) {
        points.push({
          attendance_id: row.id,
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          department_name: row.department_name,
          designation: row.designation,
          type: 'check_out',
          time: row.check_out,
          latitude: parseFloat(row.check_out_latitude),
          longitude: parseFloat(row.check_out_longitude),
          accuracy: parseFloat(row.check_out_accuracy || 0),
          distance: parseFloat(row.check_out_distance || 0),
          location_status: row.check_out_location_status,
          office_name: row.check_out_office_name,
          is_flagged_suspicious: Boolean(row.is_flagged_suspicious),
          suspicious_reason: row.suspicious_reason
        });
      }
    }

    res.json({
      date: targetDate,
      offices: formattedOffices,
      points
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch attendance map data.', error: error.message });
  }
});

module.exports = router;
