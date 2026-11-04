const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { notifyAdmins } = require('../services/notificationService');

// Protect all department routes with token authentication
router.use(authenticateToken);

// GET / - List all departments with count of assigned employees
router.get('/', async (req, res) => {
  try {
    const [departments] = await pool.query(`
      SELECT 
        d.id, 
        d.name, 
        d.approved_headcount,
        d.created_at,
        COUNT(e.id) AS employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
      GROUP BY d.id, d.name, d.approved_headcount, d.created_at
      ORDER BY d.name ASC
    `);
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch departments.', error: error.message });
  }
});

// GET /:id - Get a single department by ID with assigned employees
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [departments] = await pool.query(
      `SELECT 
        d.id, 
        d.name, 
        d.approved_headcount,
        d.created_at,
        COUNT(e.id) AS employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
      WHERE d.id = ?
      GROUP BY d.id, d.name, d.approved_headcount, d.created_at`,
      [id]
    );

    if (departments.length === 0) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    res.json(departments[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch department details.', error: error.message });
  }
});

// POST / - Create a new department (Admin only)
router.post('/', requirePermission('department.manage'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Department name is required.' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return res.status(400).json({ message: 'Department name cannot exceed 100 characters.' });
    }

    // Check for duplicate department name (case-insensitive)
    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE LOWER(name) = LOWER(?)',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'A department with this name already exists.' });
    }

    const [result] = await pool.query(
      'INSERT INTO departments (name) VALUES (?)',
      [trimmedName]
    );

    await notifyAdmins({
      type: 'system',
      title: 'Department Created',
      message: `Department "${trimmedName}" was created.`,
      link: '/departments',
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.status(201).json({
      message: 'Department created successfully!',
      department: {
        id: result.insertId,
        name: trimmedName,
        employee_count: 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create department.', error: error.message });
  }
});

// PUT /:id - Update an existing department (Admin only)
router.put('/:id', requirePermission('department.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Department name is required.' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return res.status(400).json({ message: 'Department name cannot exceed 100 characters.' });
    }

    // Check existence
    const [existing] = await pool.query('SELECT id FROM departments WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    // Check duplicate among other departments (case-insensitive)
    const [duplicate] = await pool.query(
      'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id != ?',
      [trimmedName, id]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({ message: 'Another department already has this name.' });
    }

    await pool.query('UPDATE departments SET name = ? WHERE id = ?', [trimmedName, id]);

    await notifyAdmins({
      type: 'system',
      title: 'Department Renamed',
      message: `Department #${id} was updated to "${trimmedName}".`,
      link: '/departments',
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: 'Department updated successfully!',
      department: { id: Number(id), name: trimmedName }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update department.', error: error.message });
  }
});

// PUT /:id/approved-headcount - Update department approved headcount
// Access: Admin and HR Manager only. Department Manager: no edit (403). Employee: no access (403).
router.put('/:id/approved-headcount', async (req, res) => {
  try {
    const user = req.user;

    // Enforce role access: Admin and HR Manager only
    if (user.role !== 'admin' && user.role !== 'hr_manager') {
      return res.status(403).json({
        message: 'Access denied. Only Admins and HR Managers can update approved headcount.',
        userRole: user.role,
      });
    }

    const { id } = req.params;
    const deptId = parseInt(id, 10);
    if (isNaN(deptId)) {
      return res.status(400).json({ message: 'Invalid department ID.' });
    }

    // Support both approved_headcount and approved in request body
    const rawValue = req.body.approved_headcount !== undefined ? req.body.approved_headcount : req.body.approved;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return res.status(400).json({ message: 'Approved headcount is required.' });
    }

    // Parse and validate integer >= 0
    const parsed = typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue.trim()) : Number(rawValue);

    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return res.status(400).json({
        message: 'Approved headcount must be an integer greater than or equal to 0.',
      });
    }

    // Check if department exists
    const [existing] = await pool.query('SELECT id, name, approved_headcount FROM departments WHERE id = ?', [deptId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    await pool.query('UPDATE departments SET approved_headcount = ? WHERE id = ?', [parsed, deptId]);

    await notifyAdmins({
      type: 'system',
      title: 'Approved Headcount Updated',
      message: `Approved headcount for department "${existing[0].name}" updated to ${parsed}.`,
      link: '/headcount',
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: 'Approved headcount updated successfully!',
      department: {
        id: deptId,
        name: existing[0].name,
        approved_headcount: parsed,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update approved headcount.',
      error: error.message,
    });
  }
});

// DELETE /:id - Delete a department (Admin only)
router.delete('/:id', requirePermission('department.manage'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    await connection.beginTransaction();

    // Check existence
    const [existing] = await connection.query('SELECT id, name FROM departments WHERE id = ?', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Department not found.' });
    }

    const deletedName = existing[0].name;

    // Check how many employees are assigned to this department (active only)
    const [empRows] = await connection.query('SELECT COUNT(*) AS count FROM employees WHERE department_id = ? AND deleted_at IS NULL', [id]);
    const assignedCount = empRows[0].count;

    // Delete the department (FK on employees has ON DELETE SET NULL, so employees remain safe)
    await connection.query('DELETE FROM departments WHERE id = ?', [id]);

    await connection.commit();

    await notifyAdmins({
      type: 'system',
      title: 'Department Deleted',
      message: `Department "${deletedName}" was deleted (${assignedCount} employee(s) unassigned).`,
      link: '/departments',
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: 'Department deleted successfully!',
      unassignedEmployees: assignedCount
    });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ message: 'Failed to delete department.', error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
