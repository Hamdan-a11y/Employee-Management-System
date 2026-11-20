const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission, verifyDepartmentAccess } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/permissions');
const { logAudit } = require('../services/auditLogger');
const {
  formatDate,
  getEmployeeShift,
  getDefaultShift,
  checkAssignmentOverlap,
  assignShiftToEmployee,
  assignShiftToDepartment,
  closeAssignment
} = require('../services/shiftService');

// All shift endpoints require token authentication
router.use(authenticateToken);

// ==========================================
// 1. SHIFTS CRUD
// ==========================================

/**
 * GET /api/shifts
 * List all shifts. Returns shift details and whether the shift is in use.
 */
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    let query = `
      SELECT s.*,
        (SELECT COUNT(*) FROM employee_shift_assignments a WHERE a.shift_id = s.id) AS assignment_count,
        (SELECT COUNT(*) FROM shift_rotation_steps r WHERE r.shift_id = s.id) AS rotation_count
      FROM shifts s
    `;
    const params = [];

    if (active === 'true') {
      query += ' WHERE s.is_active = TRUE';
    } else if (active === 'false') {
      query += ' WHERE s.is_active = FALSE';
    }

    query += ' ORDER BY s.is_default DESC, s.name ASC';

    const [shifts] = await pool.query(query, params);

    const formatted = shifts.map((s) => ({
      ...s,
      is_active: Boolean(s.is_active),
      is_default: Boolean(s.is_default),
      crosses_midnight: s.type === 'night' || (s.start_time && s.end_time && s.end_time < s.start_time),
      can_delete: (s.assignment_count === 0 && s.rotation_count === 0 && !s.is_default)
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch shifts.', error: error.message });
  }
});

/**
 * GET /api/shifts/default
 * Returns current default shift.
 */
router.get('/default', async (req, res) => {
  try {
    const defaultShift = await getDefaultShift(pool);
    res.json(defaultShift);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch default shift.', error: error.message });
  }
});

/**
 * GET /api/shifts/:id
 * Get single shift by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id, 10);
    if (isNaN(shiftId)) {
      return res.status(400).json({ message: 'Invalid shift ID.' });
    }

    const [rows] = await pool.query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM employee_shift_assignments a WHERE a.shift_id = s.id) AS assignment_count,
        (SELECT COUNT(*) FROM shift_rotation_steps r WHERE r.shift_id = s.id) AS rotation_count
       FROM shifts s WHERE s.id = ?`,
      [shiftId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Shift not found.' });
    }

    const s = rows[0];
    res.json({
      ...s,
      is_active: Boolean(s.is_active),
      is_default: Boolean(s.is_default),
      crosses_midnight: s.type === 'night' || (s.start_time && s.end_time && s.end_time < s.start_time),
      can_delete: (s.assignment_count === 0 && s.rotation_count === 0 && !s.is_default)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch shift details.', error: error.message });
  }
});

/**
 * Helper to validate shift input.
 */
function validateShiftPayload(body) {
  const { name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default } = body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return 'Shift name is required and must be at least 2 characters.';
  }

  const validTypes = ['morning', 'evening', 'night', 'flexible'];
  if (!type || !validTypes.includes(type)) {
    return `Invalid shift type. Must be one of: ${validTypes.join(', ')}.`;
  }

  if (type === 'flexible') {
    // Flexible shifts have no start/end, only minimum working hours
    const minMins = parseInt(min_working_minutes, 10);
    if (isNaN(minMins) || minMins <= 0) {
      return 'Flexible shifts must specify minimum working minutes greater than zero.';
    }
  } else {
    // Non-flexible shifts require valid start_time and end_time
    if (!start_time || !end_time) {
      return 'Start time and end time are required for morning, evening, and night shifts.';
    }
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!timeRegex.test(start_time)) {
      return 'Invalid start time format. Use HH:MM or HH:MM:SS.';
    }
    if (!timeRegex.test(end_time)) {
      return 'Invalid end time format. Use HH:MM or HH:MM:SS.';
    }
  }

  if (grace_minutes !== undefined && grace_minutes !== null) {
    const gm = parseInt(grace_minutes, 10);
    if (isNaN(gm) || gm < 0 || gm > 360) {
      return 'Grace minutes must be a number between 0 and 360.';
    }
  }

  if (break_minutes !== undefined && break_minutes !== null) {
    const bm = parseInt(break_minutes, 10);
    if (isNaN(bm) || bm < 0 || bm > 360) {
      return 'Break minutes must be a number between 0 and 360.';
    }
  }

  if (min_working_minutes !== undefined && min_working_minutes !== null) {
    const mwm = parseInt(min_working_minutes, 10);
    if (isNaN(mwm) || mwm < 0 || mwm > 1440) {
      return 'Minimum working minutes must be a number between 0 and 1440.';
    }
  }

  return null;
}

/**
 * POST /api/shifts
 * Create new shift. Restricted to Admin and HR Manager.
 */
router.post('/', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const valError = validateShiftPayload(req.body);
    if (valError) {
      return res.status(400).json({ message: valError });
    }

    const {
      name,
      type,
      start_time,
      end_time,
      grace_minutes = 0,
      break_minutes = 0,
      min_working_minutes = 480,
      is_active = true,
      is_default = false
    } = req.body;

    const formattedStartTime = type === 'flexible' ? null : start_time;
    const formattedEndTime = type === 'flexible' ? null : end_time;
    const effectiveGrace = type === 'flexible' ? 0 : (parseInt(grace_minutes, 10) || 0);
    const effectiveBreak = parseInt(break_minutes, 10) || 0;
    const effectiveMinWorking = parseInt(min_working_minutes, 10) || 0;
    const effectiveIsActive = is_active !== false && is_active !== 0 && is_active !== '0';
    const effectiveIsDefault = Boolean(is_default);

    // If setting as default, unset any existing default shift
    if (effectiveIsDefault) {
      await pool.query('UPDATE shifts SET is_default = FALSE WHERE is_default = TRUE');
    }

    const [result] = await pool.query(
      `INSERT INTO shifts 
       (name, type, start_time, end_time, grace_minutes, break_minutes, min_working_minutes, is_active, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        type,
        formattedStartTime,
        formattedEndTime,
        effectiveGrace,
        effectiveBreak,
        effectiveMinWorking,
        effectiveIsActive ? 1 : 0,
        effectiveIsDefault ? 1 : 0
      ]
    );

    const newId = result.insertId;
    const [createdRows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [newId]);

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'SHIFT',
      entityId: newId,
      employeeName: 'System Shift',
      details: `Created shift "${name}" (${type})`
    });

    res.status(201).json({
      message: 'Shift created successfully.',
      shift: {
        ...createdRows[0],
        is_active: Boolean(createdRows[0].is_active),
        is_default: Boolean(createdRows[0].is_default),
        crosses_midnight: type === 'night' || (formattedStartTime && formattedEndTime && formattedEndTime < formattedStartTime)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create shift.', error: error.message });
  }
});

/**
 * PUT /api/shifts/:id
 * Update an existing shift. Restricted to Admin and HR Manager.
 */
router.put('/:id', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id, 10);
    if (isNaN(shiftId)) {
      return res.status(400).json({ message: 'Invalid shift ID.' });
    }

    const [existing] = await pool.query('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Shift not found.' });
    }

    const valError = validateShiftPayload(req.body);
    if (valError) {
      return res.status(400).json({ message: valError });
    }

    const {
      name,
      type,
      start_time,
      end_time,
      grace_minutes = 0,
      break_minutes = 0,
      min_working_minutes = 480,
      is_active = true,
      is_default = false
    } = req.body;

    const formattedStartTime = type === 'flexible' ? null : start_time;
    const formattedEndTime = type === 'flexible' ? null : end_time;
    const effectiveGrace = type === 'flexible' ? 0 : (parseInt(grace_minutes, 10) || 0);
    const effectiveBreak = parseInt(break_minutes, 10) || 0;
    const effectiveMinWorking = parseInt(min_working_minutes, 10) || 0;
    const effectiveIsActive = is_active !== false && is_active !== 0 && is_active !== '0';
    const effectiveIsDefault = Boolean(is_default);

    if (effectiveIsDefault) {
      await pool.query('UPDATE shifts SET is_default = FALSE WHERE id != ?', [shiftId]);
    }

    await pool.query(
      `UPDATE shifts 
       SET name = ?, type = ?, start_time = ?, end_time = ?, grace_minutes = ?, break_minutes = ?, min_working_minutes = ?, is_active = ?, is_default = ?
       WHERE id = ?`,
      [
        name.trim(),
        type,
        formattedStartTime,
        formattedEndTime,
        effectiveGrace,
        effectiveBreak,
        effectiveMinWorking,
        effectiveIsActive ? 1 : 0,
        effectiveIsDefault ? 1 : 0,
        shiftId
      ]
    );

    const [updatedRows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [shiftId]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'SHIFT',
      entityId: shiftId,
      employeeName: 'System Shift',
      details: `Updated shift "${name}" (${type})`
    });

    res.json({
      message: 'Shift updated successfully.',
      shift: {
        ...updatedRows[0],
        is_active: Boolean(updatedRows[0].is_active),
        is_default: Boolean(updatedRows[0].is_default),
        crosses_midnight: type === 'night' || (formattedStartTime && formattedEndTime && formattedEndTime < formattedStartTime)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update shift.', error: error.message });
  }
});

/**
 * PATCH /api/shifts/:id/status
 * Toggle shift active/inactive status.
 */
router.patch('/:id/status', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const [existing] = await pool.query('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Shift not found.' });
    }

    const currentShift = existing[0];
    const newStatus = is_active !== undefined ? Boolean(is_active) : !currentShift.is_active;

    // Prevent deactivating the default shift
    if (!newStatus && currentShift.is_default) {
      return res.status(400).json({
        message: 'Cannot deactivate the default shift. Please configure another default shift first.'
      });
    }

    await pool.query('UPDATE shifts SET is_active = ? WHERE id = ?', [newStatus ? 1 : 0, shiftId]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'SHIFT',
      entityId: shiftId,
      employeeName: 'System Shift',
      details: `${newStatus ? 'Activated' : 'Deactivated'} shift "${currentShift.name}"`
    });

    res.json({
      message: `Shift ${newStatus ? 'activated' : 'deactivated'} successfully.`,
      is_active: newStatus
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle shift status.', error: error.message });
  }
});

/**
 * DELETE /api/shifts/:id
 * Delete a shift.
 * Requirement 1: "A shift that is assigned to employees can't be deleted, only deactivated."
 */
router.delete('/:id', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id, 10);
    if (isNaN(shiftId)) {
      return res.status(400).json({ message: 'Invalid shift ID.' });
    }

    const [existing] = await pool.query('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Shift not found.' });
    }
    const shift = existing[0];

    // Check if assigned in employee_shift_assignments
    const [assignments] = await pool.query(
      'SELECT COUNT(*) as count FROM employee_shift_assignments WHERE shift_id = ?',
      [shiftId]
    );

    // Check if used in shift_rotation_steps
    const [rotations] = await pool.query(
      'SELECT COUNT(*) as count FROM shift_rotation_steps WHERE shift_id = ?',
      [shiftId]
    );

    if (assignments[0].count > 0 || rotations[0].count > 0) {
      return res.status(400).json({
        message: 'A shift that is assigned to employees or used in rotation patterns cannot be deleted. You can deactivate it instead.',
        assignment_count: assignments[0].count,
        rotation_count: rotations[0].count,
        can_deactivate: true
      });
    }

    if (shift.is_default) {
      return res.status(400).json({
        message: 'Cannot delete the default shift. Designate another shift as default first.'
      });
    }

    await pool.query('DELETE FROM shifts WHERE id = ?', [shiftId]);

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'SHIFT',
      entityId: shiftId,
      employeeName: 'System Shift',
      details: `Deleted unassigned shift "${shift.name}"`
    });

    res.json({ message: `Shift "${shift.name}" deleted successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete shift.', error: error.message });
  }
});

// ==========================================
// 2. ROTATIONAL SHIFTS
// ==========================================

/**
 * GET /api/shifts/rotations
 * List weekly rotation patterns.
 */
router.get('/rotations/all', async (req, res) => {
  try {
    const [rotations] = await pool.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM employee_shift_assignments a WHERE a.rotation_id = r.id) AS assignment_count
      FROM shift_rotations r
      ORDER BY r.name ASC
    `);

    // Fetch steps for each rotation
    for (const r of rotations) {
      const [steps] = await pool.query(
        `SELECT step.id, step.week_number, step.shift_id, s.name AS shift_name, s.type AS shift_type, s.start_time, s.end_time
         FROM shift_rotation_steps step
         JOIN shifts s ON step.shift_id = s.id
         WHERE step.rotation_id = ?
         ORDER BY step.week_number ASC`,
        [r.id]
      );
      r.steps = steps;
      r.total_weeks = steps.length;
    }

    res.json(rotations);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch shift rotations.', error: error.message });
  }
});

/**
 * GET /api/shifts/rotations/:id
 * Get single rotation pattern with steps.
 */
router.get('/rotations/:id', async (req, res) => {
  try {
    const rotId = parseInt(req.params.id, 10);
    const [rotRows] = await pool.query('SELECT * FROM shift_rotations WHERE id = ?', [rotId]);
    if (rotRows.length === 0) {
      return res.status(404).json({ message: 'Shift rotation pattern not found.' });
    }

    const rotation = rotRows[0];
    const [steps] = await pool.query(
      `SELECT step.id, step.week_number, step.shift_id, s.name AS shift_name, s.type AS shift_type, s.start_time, s.end_time
       FROM shift_rotation_steps step
       JOIN shifts s ON step.shift_id = s.id
       WHERE step.rotation_id = ?
       ORDER BY step.week_number ASC`,
      [rotId]
    );

    rotation.steps = steps;
    res.json(rotation);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch rotation details.', error: error.message });
  }
});

/**
 * POST /api/shifts/rotations
 * Create rotation pattern (Week 1 Morning, Week 2 Evening, etc.).
 */
router.post('/rotations', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const { name, description, steps } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ message: 'Rotation pattern name is required (min 2 characters).' });
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ message: 'Rotation must include at least one weekly step.' });
    }

    // Verify all shifts exist and are active
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const shiftId = parseInt(step.shift_id, 10);
      if (!shiftId) {
        return res.status(400).json({ message: `Step ${i + 1} is missing a valid shift_id.` });
      }
      const [s] = await pool.query('SELECT id, is_active FROM shifts WHERE id = ?', [shiftId]);
      if (s.length === 0) {
        return res.status(400).json({ message: `Shift #${shiftId} referenced in step ${i + 1} does not exist.` });
      }
      if (!s[0].is_active) {
        return res.status(400).json({ message: `Shift #${shiftId} in step ${i + 1} is inactive.` });
      }
    }

    const [resRot] = await pool.query(
      'INSERT INTO shift_rotations (name, description) VALUES (?, ?)',
      [name.trim(), description || null]
    );
    const newRotId = resRot.insertId;

    for (let i = 0; i < steps.length; i++) {
      const weekNum = i + 1;
      const shiftId = parseInt(steps[i].shift_id, 10);
      await pool.query(
        'INSERT INTO shift_rotation_steps (rotation_id, week_number, shift_id) VALUES (?, ?, ?)',
        [newRotId, weekNum, shiftId]
      );
    }

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'SHIFT_ROTATION',
      entityId: newRotId,
      employeeName: 'System Rotation',
      details: `Created rotation pattern "${name}" with ${steps.length} weeks`
    });

    res.status(201).json({
      message: 'Rotation pattern created successfully.',
      rotation_id: newRotId
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create rotation pattern.', error: error.message });
  }
});

/**
 * DELETE /api/shifts/rotations/:id
 * Delete rotation pattern if not assigned to employees.
 */
router.delete('/rotations/:id', requirePermission(PERMISSIONS.SHIFT_MANAGE), async (req, res) => {
  try {
    const rotId = parseInt(req.params.id, 10);
    const [existing] = await pool.query('SELECT * FROM shift_rotations WHERE id = ?', [rotId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Rotation not found.' });
    }

    const [assign] = await pool.query(
      'SELECT COUNT(*) as count FROM employee_shift_assignments WHERE rotation_id = ?',
      [rotId]
    );
    if (assign[0].count > 0) {
      return res.status(400).json({
        message: 'Cannot delete rotation pattern because it is actively assigned to employees.'
      });
    }

    await pool.query('DELETE FROM shift_rotations WHERE id = ?', [rotId]);

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'SHIFT_ROTATION',
      entityId: rotId,
      employeeName: 'System Rotation',
      details: `Deleted rotation pattern "${existing[0].name}"`
    });

    res.json({ message: 'Rotation pattern deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete rotation pattern.', error: error.message });
  }
});

// ==========================================
// 3. ASSIGNMENTS
// ==========================================

/**
 * POST /api/shifts/assignments/preview
 * Requirement 6: "Show a preview ('12 employees will be assigned') and warn about overlaps before saving."
 */
router.post('/assignments/preview', async (req, res) => {
  try {
    const { target_type, employee_ids, department_id, start_date, end_date } = req.body;

    if (!start_date) {
      return res.status(400).json({ message: 'Start date is required for preview.' });
    }

    const sDate = formatDate(start_date);
    const eDate = end_date ? formatDate(end_date) : null;

    if (eDate && eDate < sDate) {
      return res.status(400).json({ message: 'End date cannot be earlier than start date.' });
    }

    let targetEmployees = [];

    if (target_type === 'department') {
      const deptId = parseInt(department_id, 10);
      if (!deptId) {
        return res.status(400).json({ message: 'Please select a valid department.' });
      }

      // Dept manager authorization check
      if (req.user.role === 'department_manager' && req.user.department_id !== deptId) {
        return res.status(403).json({ message: 'Access denied. You can only assign shifts to your own department.' });
      }

      const [emps] = await pool.query(
        `SELECT e.id, e.name, e.designation, d.name AS department_name
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.department_id = ? AND e.status = 'Active' AND e.deleted_at IS NULL
         ORDER BY e.name ASC`,
        [deptId]
      );
      targetEmployees = emps;
    } else {
      // Direct employee(s)
      const ids = Array.isArray(employee_ids) ? employee_ids.map(Number).filter(Boolean) : [parseInt(employee_ids, 10)].filter(Boolean);
      if (ids.length === 0) {
        return res.status(400).json({ message: 'Please select at least one employee.' });
      }

      // Dept manager authorization check for each employee
      if (req.user.role === 'department_manager') {
        for (const id of ids) {
          const allowed = await verifyDepartmentAccess(req, id);
          if (!allowed) {
            return res.status(403).json({ message: `Access denied. Employee #${id} is outside your department.` });
          }
        }
      }

      const [emps] = await pool.query(
        `SELECT e.id, e.name, e.designation, d.name AS department_name
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.id IN (?) AND e.status = 'Active' AND e.deleted_at IS NULL
         ORDER BY e.name ASC`,
        [ids]
      );
      targetEmployees = emps;
    }

    // Check overlaps for each employee
    const overlaps = [];
    for (const emp of targetEmployees) {
      const conflicts = await checkAssignmentOverlap(emp.id, sDate, eDate, null, pool);
      if (conflicts.length > 0) {
        overlaps.push({
          employee_id: emp.id,
          employee_name: emp.name,
          existing_assignment: {
            id: conflicts[0].id,
            shift_name: conflicts[0].shift_name,
            rotation_name: conflicts[0].rotation_name,
            start_date: formatDate(conflicts[0].start_date),
            end_date: conflicts[0].end_date ? formatDate(conflicts[0].end_date) : 'Ongoing'
          }
        });
      }
    }

    res.json({
      total_employees: targetEmployees.length,
      employees: targetEmployees,
      has_overlaps: overlaps.length > 0,
      overlaps
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate assignment preview.', error: error.message });
  }
});

/**
 * POST /api/shifts/assignments
 * Assign shift or rotation to employee(s) or department.
 */
router.post('/assignments', async (req, res) => {
  try {
    const {
      target_type = 'employee',
      employee_id,
      employee_ids,
      department_id,
      shift_id,
      rotation_id,
      start_date,
      end_date,
      notes
    } = req.body;

    // RBAC: Admin, HR Manager, Department Manager can assign
    if (!['admin', 'hr_manager', 'department_manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to assign shifts.' });
    }

    if (!start_date) {
      return res.status(400).json({ message: 'Start date is required.' });
    }

    if (!shift_id && !rotation_id) {
      return res.status(400).json({ message: 'Must specify either a shift or a rotation pattern.' });
    }
    if (shift_id && rotation_id) {
      return res.status(400).json({ message: 'Cannot assign both a shift and a rotation pattern simultaneously.' });
    }

    // Verify shift or rotation exists and is active
    if (shift_id) {
      const [s] = await pool.query('SELECT id, name, is_active FROM shifts WHERE id = ?', [shift_id]);
      if (s.length === 0) return res.status(404).json({ message: 'Selected shift does not exist.' });
      if (!s[0].is_active) return res.status(400).json({ message: 'Selected shift is inactive and cannot be assigned.' });
    }
    if (rotation_id) {
      const [r] = await pool.query('SELECT id, name FROM shift_rotations WHERE id = ?', [rotation_id]);
      if (r.length === 0) return res.status(404).json({ message: 'Selected rotation pattern does not exist.' });
    }

    // Department-level assignment
    if (target_type === 'department' || department_id) {
      const deptId = parseInt(department_id, 10);
      if (!deptId) {
        return res.status(400).json({ message: 'Please provide a valid department_id.' });
      }

      if (req.user.role === 'department_manager' && req.user.department_id !== deptId) {
        return res.status(403).json({ message: 'Access denied. You can only assign shifts to your own department.' });
      }

      const result = await assignShiftToDepartment({
        departmentId: deptId,
        shiftId: shift_id ? parseInt(shift_id, 10) : null,
        rotationId: rotation_id ? parseInt(rotation_id, 10) : null,
        startDate: start_date,
        endDate: end_date || null,
        notes,
        assignedByUserId: req.user.id,
        req
      });

      return res.status(201).json({
        message: `Successfully assigned to all ${result.totalAssigned} active employees in department "${result.departmentName}".`,
        result
      });
    }

    // Employee-level assignment (supports single or multiple employee IDs)
    const rawIds = employee_ids || [employee_id];
    const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(Number).filter(Boolean);

    if (ids.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one valid employee_id.' });
    }

    // Department manager check
    if (req.user.role === 'department_manager') {
      for (const id of ids) {
        const allowed = await verifyDepartmentAccess(req, id);
        if (!allowed) {
          return res.status(403).json({ message: `Access denied. Employee #${id} is outside your department.` });
        }
      }
    }

    const assigned = [];
    for (const empId of ids) {
      const resAssign = await assignShiftToEmployee({
        employeeId: empId,
        shiftId: shift_id ? parseInt(shift_id, 10) : null,
        rotationId: rotation_id ? parseInt(rotation_id, 10) : null,
        startDate: start_date,
        endDate: end_date || null,
        notes,
        assignedByUserId: req.user.id,
        req
      });
      assigned.push(resAssign);
    }

    res.status(201).json({
      message: `Shift assigned successfully to ${assigned.length} employee(s).`,
      assignments: assigned
    });
  } catch (error) {
    if (error.overlaps) {
      return res.status(400).json({
        message: error.message,
        overlaps: error.overlaps
      });
    }
    res.status(400).json({ message: error.message || 'Failed to assign shift.' });
  }
});

/**
 * PATCH /api/shifts/assignments/:id/close
 * Requirement 2: "Never edit or delete an old assignment. Close it (set end date) and create a new one."
 */
router.patch('/assignments/:id/close', async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id, 10);
    const { end_date } = req.body;

    if (!end_date) {
      return res.status(400).json({ message: 'End date is required to close an assignment.' });
    }

    // RBAC check: Dept managers can only close for their own department employees
    const [rows] = await pool.query(
      'SELECT employee_id FROM employee_shift_assignments WHERE id = ?',
      [assignmentId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    if (req.user.role === 'department_manager') {
      const allowed = await verifyDepartmentAccess(req, rows[0].employee_id);
      if (!allowed) {
        return res.status(403).json({ message: 'Access denied. You cannot modify assignments for employees outside your department.' });
      }
    } else if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Employees cannot close shift assignments.' });
    }

    const result = await closeAssignment({
      assignmentId,
      endDate: end_date,
      req,
      closedByUserId: req.user.id
    });

    res.json({
      message: `Assignment closed successfully. End date set to ${result.end_date}.`,
      assignment: result
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to close assignment.' });
  }
});

/**
 * GET /api/shifts/assignments/employee/:employeeId
 * Requirement 2: "Keep full assignment history per employee."
 */
router.get('/assignments/employee/:employeeId', async (req, res) => {
  try {
    const empId = parseInt(req.params.employeeId, 10);
    if (isNaN(empId)) {
      return res.status(400).json({ message: 'Invalid employee ID.' });
    }

    // Access check:
    // Admin & HR: any employee
    // Dept Manager: their own department
    // Employee: self only
    const allowed = await verifyDepartmentAccess(req, empId);
    if (!allowed) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to view this employee’s assignments.' });
    }

    // Fetch employee details
    const [emps] = await pool.query('SELECT id, name, department_id FROM employees WHERE id = ?', [empId]);
    if (emps.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Full assignment history
    const [assignments] = await pool.query(
      `SELECT a.*,
              s.name AS shift_name, s.type AS shift_type, s.start_time, s.end_time,
              s.grace_minutes, s.break_minutes, s.min_working_minutes,
              r.name AS rotation_name,
              u.name AS assigned_by_name
       FROM employee_shift_assignments a
       LEFT JOIN shifts s ON a.shift_id = s.id
       LEFT JOIN shift_rotations r ON a.rotation_id = r.id
       LEFT JOIN users u ON a.assigned_by = u.id
       WHERE a.employee_id = ?
       ORDER BY a.start_date DESC, a.id DESC`,
      [empId]
    );

    // Current shift for today
    const currentShift = await getEmployeeShift(empId, new Date());

    res.json({
      employee: emps[0],
      current_shift: currentShift,
      history: assignments.map((a) => ({
        ...a,
        start_date: formatDate(a.start_date),
        end_date: a.end_date ? formatDate(a.end_date) : null,
        is_active_now: formatDate(a.start_date) <= formatDate(new Date()) && (!a.end_date || formatDate(a.end_date) >= formatDate(new Date()))
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee shift history.', error: error.message });
  }
});

// ==========================================
// 4. WEEKLY SCHEDULE VIEW
// ==========================================

/**
 * GET /api/shifts/schedule
 * Requirement 6: "Weekly schedule view: a grid with days as columns and employees as rows,
 * shifts shown as color-coded blocks. Night shifts that cross midnight are visibly marked. Filter by department."
 */
router.get('/schedule', async (req, res) => {
  try {
    const { startDate, department_id } = req.query;

    // Determine week start (Monday) and 7 days
    let weekStart;
    if (startDate) {
      weekStart = new Date(startDate);
    } else {
      const now = new Date();
      const day = now.getDay();
      const diffToMon = (day === 0 ? -6 : 1) - day;
      weekStart = new Date(now.setDate(now.getDate() + diffToMon));
    }

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = formatDate(d);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      days.push({
        date: dateStr,
        day_of_week: dayNames[d.getDay()],
        day_number: d.getDate(),
        is_today: dateStr === formatDate(new Date())
      });
    }

    // Determine employee query based on RBAC
    let empQuery = `
      SELECT e.id, e.name, e.designation, e.department_id, d.name AS department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'Active' AND e.deleted_at IS NULL
    `;
    const params = [];

    if (req.user.role === 'employee') {
      const empId = req.user.employee_id;
      if (!empId) {
        return res.json({ days, employees: [] });
      }
      empQuery += ' AND e.id = ?';
      params.push(empId);
    } else if (req.user.role === 'department_manager') {
      if (!req.user.department_id) {
        return res.json({ days, employees: [] });
      }
      empQuery += ' AND e.department_id = ?';
      params.push(req.user.department_id);
    } else if (department_id && department_id !== 'all') {
      empQuery += ' AND e.department_id = ?';
      params.push(parseInt(department_id, 10));
    }

    empQuery += ' ORDER BY d.name ASC, e.name ASC';

    const [employees] = await pool.query(empQuery, params);

    // Calculate shift for each employee on each day using the ONE SHARED FUNCTION getEmployeeShift
    const scheduleRows = await Promise.all(
      employees.map(async (emp) => {
        const schedule = {};
        for (const day of days) {
          const shift = await getEmployeeShift(emp.id, day.date);
          schedule[day.date] = shift;
        }
        return {
          employee_id: emp.id,
          employee_name: emp.name,
          designation: emp.designation,
          department_id: emp.department_id,
          department_name: emp.department_name,
          schedule
        };
      })
    );

    res.json({
      start_date: days[0].date,
      end_date: days[6].date,
      days,
      employees: scheduleRows
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch weekly schedule.', error: error.message });
  }
});

module.exports = router;
