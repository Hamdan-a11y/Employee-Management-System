const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const { logAudit } = require('../services/auditLogger');
const { notifyUser, notifyEmployeeUser, notifyAdmins } = require('../services/notificationService');

// In-memory upload for CSV import validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Disk storage for employee avatars (JPEG, PNG, WEBP, max 2MB)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/avatars');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `avatar-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed formats: JPEG, PNG, WEBP.'));
    }
  }
});

const handleAvatarUpload = (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum profile picture size is 2MB.' });
      }
      return res.status(400).json({ message: err.message || 'Avatar upload error.' });
    }
    next();
  });
};

// Disk storage for employee documents (PDF, DOCX, Images, max 5MB)
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/documents');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `doc-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document format. Allowed formats: PDF, Word (DOC/DOCX), Images (JPEG/PNG/WEBP), Text (TXT).'));
    }
  }
});

const handleDocUpload = (req, res, next) => {
  docUpload.single('document')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum document size is 5MB.' });
      }
      return res.status(400).json({ message: err.message || 'Document upload error.' });
    }
    next();
  });
};

const ExcelJS = require('exceljs');
const { parseCSV, generateCSV } = require('../utils/csvHelper');

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

router.use(authenticateToken);

// Seamlessly resolve 'me' alias to authenticated user's linked employee_id
router.param('id', (req, res, next, id) => {
  if (id === 'me') {
    if (!req.user || !req.user.employee_id) {
      return res.status(404).json({ message: 'No linked employee record found for your user account.' });
    }
    req.params.id = String(req.user.employee_id);
  }
  next();
});

router.get('/', async (req, res) => {
  try {
    const { search, department_id, status } = req.query;

    let query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        e.department_id, 
        d.name AS department_name, 
        e.designation, 
        e.avatar_url,
        e.status, 
        e.created_at, 
        e.updated_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
        AND e.deleted_at IS NULL
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (e.name LIKE ? OR e.email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (department_id && department_id !== 'all') {
      query += ' AND e.department_id = ?';
      params.push(department_id);
    }

    if (status && status !== 'all') {
      query += ' AND e.status = ?';
      params.push(status);
    }

    // RBAC: Non-admin employees can only view their own record
    if (req.user.role === 'employee') {
      if (!req.user.employee_id) {
        return res.json([]);
      }
      query += ' AND e.id = ?';
      params.push(req.user.employee_id);
    }

    query += ' ORDER BY e.id DESC';

    const [employees] = await pool.query(query, params);
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employees.', error: error.message });
  }
});

// --- GET /api/employees/deleted - List soft-deleted employees archive (Admin only) ---
router.get('/deleted', requireAdmin, async (req, res) => {
  try {
    const { search, department_id } = req.query;

    let query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        e.department_id, 
        d.name AS department_name, 
        e.designation, 
        e.avatar_url,
        e.status, 
        e.created_at, 
        e.updated_at,
        e.deleted_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.deleted_at IS NOT NULL
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (e.name LIKE ? OR e.email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (department_id && department_id !== 'all') {
      query += ' AND e.department_id = ?';
      params.push(department_id);
    }

    query += ' ORDER BY e.deleted_at DESC';

    const [deletedEmployees] = await pool.query(query, params);
    res.json(deletedEmployees);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch deleted employees.', error: error.message });
  }
});

// --- Export CSV ---
router.get('/export/csv', requireAdmin, async (req, res) => {
  try {
    const { search, department_id, status } = req.query;

    let query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        d.name AS department_name, 
        e.designation, 
        e.status, 
        e.created_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
        AND e.deleted_at IS NULL
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (e.name LIKE ? OR e.email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (department_id && department_id !== 'all') {
      query += ' AND e.department_id = ?';
      params.push(department_id);
    }

    if (status && status !== 'all') {
      query += ' AND e.status = ?';
      params.push(status);
    }

    query += ' ORDER BY e.id DESC';

    const [employees] = await pool.query(query, params);

    const headers = ['Employee ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Status', 'Joined Date'];
    const rows = employees.map(emp => [
      emp.id,
      emp.name,
      emp.email,
      emp.phone,
      emp.department_name || 'Unassigned',
      emp.designation,
      emp.status,
      emp.created_at ? new Date(emp.created_at).toISOString().split('T')[0] : ''
    ]);

    const csvContent = generateCSV(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="employees_export_${dateStr}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export employees to CSV.', error: error.message });
  }
});

// --- Export Excel ---
router.get('/export/excel', requireAdmin, async (req, res) => {
  try {
    const { search, department_id, status } = req.query;

    let query = `
      SELECT 
        e.id, 
        e.name, 
        e.email, 
        e.phone, 
        d.name AS department_name, 
        e.designation, 
        e.status, 
        e.created_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
        AND e.deleted_at IS NULL
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (e.name LIKE ? OR e.email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (department_id && department_id !== 'all') {
      query += ' AND e.department_id = ?';
      params.push(department_id);
    }

    if (status && status !== 'all') {
      query += ' AND e.status = ?';
      params.push(status);
    }

    query += ' ORDER BY e.id DESC';

    const [employees] = await pool.query(query, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Employee Management System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Employees');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Full Name', key: 'name', width: 24 },
      { header: 'Email Address', key: 'email', width: 30 },
      { header: 'Phone Number', key: 'phone', width: 18 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Joined Date', key: 'created_at', width: 16 }
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4338CA' } // Indigo
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
    });

    // Populate data rows
    employees.forEach((emp) => {
      const row = worksheet.addRow({
        id: emp.id,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        department: emp.department_name || 'Unassigned',
        designation: emp.designation,
        status: emp.status,
        created_at: emp.created_at ? new Date(emp.created_at).toISOString().split('T')[0] : ''
      });

      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        // Align ID, Phone, Status, Date centered
        if ([1, 4, 7, 8].includes(colNumber)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Color status badge
        if (colNumber === 7) {
          if (emp.status === 'Active') {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF065F46' } };
          } else {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF64748B' } };
          }
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStr = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="employees_export_${dateStr}.xlsx"`);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export employees to Excel.', error: error.message });
  }
});

// --- Import Template Download ---
router.get('/import/template', requireAdmin, async (req, res) => {
  try {
    const [departments] = await pool.query('SELECT name FROM departments ORDER BY id ASC');

    const headers = ['Name', 'Email', 'Phone', 'Department', 'Designation', 'Status'];
    const sampleRows = [
      ['Jane Doe', 'jane.doe@example.com', '+1-555-0101', departments[0]?.name || 'Engineering', 'Senior Developer', 'Active'],
      ['Alex Smith', 'alex.smith@example.com', '+1-555-0102', departments[1]?.name || 'Marketing', 'Product Specialist', 'Active'],
      ['Robert Lee', 'robert.lee@example.com', '+1-555-0103', departments[2]?.name || 'Sales', 'Account Executive', 'Inactive']
    ];

    const csvContent = generateCSV(headers, sampleRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate template.', error: error.message });
  }
});

// --- Validate Uploaded CSV ---
router.post('/import/validate', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    let csvText = '';
    if (req.file && req.file.buffer) {
      csvText = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.csvContent) {
      csvText = req.body.csvContent;
    } else {
      return res.status(400).json({ message: 'No CSV file or content provided.' });
    }

    const parsedRows = parseCSV(csvText);

    if (parsedRows.length === 0) {
      return res.status(400).json({ message: 'The uploaded file is empty.' });
    }

    const headerRow = parsedRows[0].map(h => h.toLowerCase().trim());
    
    // Find column positions
    const findCol = (aliases) => headerRow.findIndex(h => aliases.some(alias => h === alias || h.includes(alias)));
    
    const nameIdx = findCol(['name', 'full name', 'employee name']);
    const emailIdx = findCol(['email', 'email address']);
    const phoneIdx = findCol(['phone', 'phone number', 'mobile', 'contact']);
    const deptIdx = findCol(['department', 'department name', 'dept']);
    const desigIdx = findCol(['designation', 'role', 'title', 'job title', 'position']);
    const statusIdx = findCol(['status']);

    const missingColumns = [];
    if (nameIdx === -1) missingColumns.push('Name');
    if (emailIdx === -1) missingColumns.push('Email');
    if (phoneIdx === -1) missingColumns.push('Phone');
    if (deptIdx === -1) missingColumns.push('Department');
    if (desigIdx === -1) missingColumns.push('Designation');

    if (missingColumns.length > 0) {
      return res.status(400).json({
        message: `Missing required column headers: ${missingColumns.join(', ')}. Please refer to the template.`,
        missingColumns
      });
    }

    const dataRows = parsedRows.slice(1);
    if (dataRows.length === 0) {
      return res.status(400).json({ message: 'No data rows found in the CSV file (only headers).' });
    }

    // Load existing departments for validation
    const [departments] = await pool.query('SELECT id, name FROM departments');
    const deptMapByName = new Map();
    const deptMapById = new Map();
    departments.forEach(d => {
      deptMapByName.set(d.name.toLowerCase().trim(), d);
      deptMapById.set(String(d.id), d);
    });

    // Load existing emails for uniqueness check
    const [existingEmployees] = await pool.query('SELECT email FROM employees');
    const existingEmailsInDb = new Set(existingEmployees.map(e => e.email.toLowerCase().trim()));

    const seenEmailsInCsv = new Map();
    const validRecords = [];
    const invalidRecords = [];

    dataRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Human-friendly row number (row 1 is header)
      const reasons = [];

      const rawName = (row[nameIdx] || '').trim();
      const rawEmail = (row[emailIdx] || '').trim();
      const rawPhone = (row[phoneIdx] || '').trim();
      const rawDept = (row[deptIdx] || '').trim();
      const rawDesig = (row[desigIdx] || '').trim();
      const rawStatus = statusIdx !== -1 ? (row[statusIdx] || '').trim() : 'Active';

      // Validate Name
      if (!rawName) {
        reasons.push('Name is required');
      } else if (rawName.length > 100) {
        reasons.push('Name exceeds maximum length of 100 characters');
      }

      // Validate Email
      if (!rawEmail) {
        reasons.push('Email is required');
      } else if (!emailRegex.test(rawEmail)) {
        reasons.push(`Invalid email format: "${rawEmail}"`);
      } else {
        const lowerEmail = rawEmail.toLowerCase();
        if (existingEmailsInDb.has(lowerEmail)) {
          reasons.push(`Email already exists in system: "${rawEmail}"`);
        } else if (seenEmailsInCsv.has(lowerEmail)) {
          reasons.push(`Duplicate email in CSV (same as Row ${seenEmailsInCsv.get(lowerEmail)})`);
        } else {
          seenEmailsInCsv.set(lowerEmail, rowNum);
        }
      }

      // Validate Phone
      if (!rawPhone) {
        reasons.push('Phone number is required');
      } else if (rawPhone.length > 20) {
        reasons.push('Phone exceeds maximum length of 20 characters');
      }

      // Validate Department
      let matchedDepartment = null;
      if (!rawDept) {
        reasons.push('Department is required');
      } else {
        const lowerDept = rawDept.toLowerCase();
        if (deptMapByName.has(lowerDept)) {
          matchedDepartment = deptMapByName.get(lowerDept);
        } else if (deptMapById.has(rawDept)) {
          matchedDepartment = deptMapById.get(rawDept);
        } else {
          const validDeptList = departments.map(d => d.name).join(', ');
          reasons.push(`Department "${rawDept}" not found. Available: ${validDeptList}`);
        }
      }

      // Validate Designation
      if (!rawDesig) {
        reasons.push('Designation is required');
      } else if (rawDesig.length > 100) {
        reasons.push('Designation exceeds maximum length of 100 characters');
      }

      // Validate Status
      let normalizedStatus = 'Active';
      if (rawStatus) {
        const lowerStatus = rawStatus.toLowerCase();
        if (lowerStatus === 'active') {
          normalizedStatus = 'Active';
        } else if (lowerStatus === 'inactive') {
          normalizedStatus = 'Inactive';
        } else {
          reasons.push(`Invalid status "${rawStatus}". Must be "Active" or "Inactive"`);
        }
      }

      if (reasons.length > 0) {
        invalidRecords.push({
          row: rowNum,
          name: rawName || '(Empty)',
          email: rawEmail || '(Empty)',
          phone: rawPhone,
          department: rawDept,
          designation: rawDesig,
          status: rawStatus,
          reasons
        });
      } else {
        validRecords.push({
          row: rowNum,
          name: rawName,
          email: rawEmail.toLowerCase(),
          phone: rawPhone,
          department_id: matchedDepartment.id,
          department_name: matchedDepartment.name,
          designation: rawDesig,
          status: normalizedStatus
        });
      }
    });

    res.json({
      totalRows: dataRows.length,
      validCount: validRecords.length,
      invalidCount: invalidRecords.length,
      validRecords,
      invalidRecords
    });
  } catch (error) {
    res.status(500).json({ message: 'Validation failed.', error: error.message });
  }
});

// --- Execute Import of Valid Records ---
router.post('/import/execute', requireAdmin, async (req, res) => {
  let conn;
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'No valid records provided for import.' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    let insertedCount = 0;
    const insertedIds = [];

    for (const rec of records) {
      // Re-verify email doesn't collide right before insert
      const [existing] = await conn.query('SELECT id FROM employees WHERE email = ?', [rec.email.toLowerCase()]);
      if (existing.length > 0) {
        continue;
      }

      const [result] = await conn.query(
        `INSERT INTO employees (name, email, phone, department_id, designation, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          rec.name.trim(),
          rec.email.trim().toLowerCase(),
          rec.phone.trim(),
          rec.department_id,
          rec.designation.trim(),
          rec.status === 'Inactive' ? 'Inactive' : 'Active'
        ]
      );

      insertedCount++;
      insertedIds.push(result.insertId);
    }

    await conn.commit();

    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'EMPLOYEE',
      entityId: null,
      employeeName: `Multiple (${insertedCount} employees)`,
      details: `Bulk imported ${insertedCount} employee(s) via CSV`
    });

    res.status(201).json({
      message: `Successfully imported ${insertedCount} employee record(s)!`,
      insertedCount
    });
  } catch (error) {
    if (conn) await conn.rollback();
    res.status(500).json({ message: 'Failed to import employees.', error: error.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // RBAC: Non-admin employees can only view their own profile
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({
        message: 'Access denied. You are only authorized to view your own profile.',
        userRole: req.user.role
      });
    }

    const [rows] = await pool.query(
      `SELECT 
        e.id, e.name, e.email, e.phone, e.department_id, 
        d.name AS department_name, e.designation, e.avatar_url, e.status, 
        e.created_at, e.updated_at, e.deleted_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (rows[0].deleted_at && req.user.role !== 'admin') {
      return res.status(404).json({ message: 'Employee record not found or has been archived.' });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee details.', error: error.message });
  }
});

// --- Upload Employee Avatar ---
router.post('/:id/avatar', handleAvatarUpload, async (req, res) => {
  try {
    const { id } = req.params;

    // RBAC: Non-admin employees can only manage their own avatar
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Access denied. You can only manage your own profile picture.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please select an image file to upload.' });
    }

    // Verify employee exists
    const [existing] = await pool.query('SELECT id, name, avatar_url FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      // Clean up uploaded file if employee doesn't exist
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Delete old avatar if present
    const oldAvatar = existing[0].avatar_url;
    if (oldAvatar) {
      const oldPath = path.join(__dirname, '..', oldAvatar);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore deletion error */ }
      }
    }

    const relativeAvatarUrl = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE employees SET avatar_url = ? WHERE id = ?', [relativeAvatarUrl, id]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      employeeName: existing[0].name,
      details: 'Uploaded new profile picture'
    });

    await notifyEmployeeUser({
      employeeId: id,
      type: 'profile',
      title: 'Profile Picture Updated',
      message: 'Your profile picture was successfully updated.',
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: 'Profile picture updated successfully!',
      avatar_url: relativeAvatarUrl
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ message: 'Failed to upload profile picture.', error: error.message });
  }
});

// --- Delete Employee Avatar ---
router.delete('/:id/avatar', async (req, res) => {
  try {
    const { id } = req.params;

    // RBAC: Non-admin employees can only manage their own avatar
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({ message: 'Access denied. You can only manage your own profile picture.' });
    }

    const [existing] = await pool.query('SELECT id, name, avatar_url FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const oldAvatar = existing[0].avatar_url;
    if (oldAvatar) {
      const oldPath = path.join(__dirname, '..', oldAvatar);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
      await pool.query('UPDATE employees SET avatar_url = NULL WHERE id = ?', [id]);
    }

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      employeeName: existing[0].name,
      details: 'Removed profile picture'
    });

    await notifyEmployeeUser({
      employeeId: id,
      type: 'profile',
      title: 'Profile Picture Removed',
      message: 'Your profile picture was removed.',
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({ message: 'Profile picture removed successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove profile picture.', error: error.message });
  }
});

// --- Update Employee Contact Information ---
router.patch('/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone } = req.body;

    // RBAC: Non-admin employees can only update their own contact details
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({ message: 'Access denied. You can only update your own contact details.' });
    }

    if (!email || !phone) {
      return res.status(400).json({ message: 'Email and phone number are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (trimmedPhone.length > 20) {
      return res.status(400).json({ message: 'Phone number exceeds maximum length of 20 characters.' });
    }

    const [existing] = await pool.query('SELECT id, name FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const [emailConflict] = await pool.query(
      'SELECT id FROM employees WHERE email = ? AND id != ?',
      [trimmedEmail, id]
    );
    if (emailConflict.length > 0) {
      return res.status(400).json({ message: 'This email is already in use by another employee.' });
    }

    await pool.query(
      'UPDATE employees SET email = ?, phone = ? WHERE id = ?',
      [trimmedEmail, trimmedPhone, id]
    );

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      employeeName: existing[0].name,
      details: `Updated contact info (Email: ${trimmedEmail}, Phone: ${trimmedPhone})`
    });

    await notifyEmployeeUser({
      employeeId: id,
      type: 'profile',
      title: 'Contact Information Updated',
      message: `Your contact info was updated: ${trimmedEmail}, ${trimmedPhone}.`,
      link: `/employees/${id}`,
      sendEmail: true,
      emailDetails: `Your contact details were updated in the system: Email: ${trimmedEmail}, Phone: ${trimmedPhone}. If you did not make this change, please notify your administrator.`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: 'Contact information updated successfully!',
      email: trimmedEmail,
      phone: trimmedPhone
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update contact information.', error: error.message });
  }
});

// --- List Employee Documents ---
router.get('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;

    // RBAC: Non-admin employees can only access their own documents
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({ message: 'Access denied. You can only access your own documents.' });
    }

    const [existing] = await pool.query('SELECT id FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const [documents] = await pool.query(
      'SELECT id, employee_id, title, file_name, file_size, file_type, created_at FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC',
      [id]
    );

    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch employee documents.', error: error.message });
  }
});

// --- Upload Employee Document ---
router.post('/:id/documents', handleDocUpload, async (req, res) => {
  try {
    const { id } = req.params;

    // RBAC: Non-admin employees can only upload to their own documents
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: 'Access denied. You can only upload to your own documents.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please select a document file to upload.' });
    }

    const [existing] = await pool.query('SELECT id FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const title = (req.body.title && req.body.title.trim()) || req.file.originalname;
    const relativePath = `/uploads/documents/${req.file.filename}`;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;

    const [result] = await pool.query(
      `INSERT INTO employee_documents (employee_id, title, file_name, file_path, file_size, file_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, title, req.file.originalname, relativePath, fileSize, fileType]
    );

    const [newDoc] = await pool.query('SELECT * FROM employee_documents WHERE id = ?', [result.insertId]);

    await notifyEmployeeUser({
      employeeId: id,
      type: 'profile',
      title: 'Document Uploaded',
      message: `A new document "${title}" was attached to your profile.`,
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.status(201).json({
      message: 'Document uploaded successfully!',
      document: newDoc[0]
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ message: 'Failed to upload document.', error: error.message });
  }
});

// --- Download Employee Document ---
router.get('/:id/documents/:docId/download', async (req, res) => {
  try {
    const { id, docId } = req.params;

    // RBAC: Non-admin employees can only download their own documents
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({ message: 'Access denied. You can only download your own documents.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM employee_documents WHERE id = ? AND employee_id = ?',
      [docId, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const doc = rows[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Document file not found on server.' });
    }

    res.download(absolutePath, doc.file_name);
  } catch (error) {
    res.status(500).json({ message: 'Failed to download document.', error: error.message });
  }
});

// --- Delete Employee Document ---
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params;

    // RBAC: Non-admin employees can only delete their own documents
    if (req.user.role !== 'admin' && req.user.employee_id !== parseInt(id, 10)) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own documents.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM employee_documents WHERE id = ? AND employee_id = ?',
      [docId, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    const doc = rows[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    if (fs.existsSync(absolutePath)) {
      try { fs.unlinkSync(absolutePath); } catch (e) { /* ignore unlink error */ }
    }

    await pool.query('DELETE FROM employee_documents WHERE id = ?', [docId]);

    await notifyEmployeeUser({
      employeeId: id,
      type: 'profile',
      title: 'Document Removed',
      message: `Document "${doc.title || doc.file_name}" was deleted from your profile.`,
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({ message: 'Document deleted successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete document.', error: error.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, department_id, designation, status } = req.body;

    if (!name || !email || !phone || !department_id || !designation) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const [existing] = await pool.query('SELECT id, deleted_at FROM employees WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      if (existing[0].deleted_at) {
        return res.status(400).json({
          message: 'An employee with this email exists in the deleted archive. You can restore that record from Deleted Employees instead.'
        });
      }
      return res.status(400).json({ message: 'An employee with this email already exists.' });
    }

    const employeeStatus = status === 'Inactive' ? 'Inactive' : 'Active';

    const connection = await pool.getConnection();
    let insertId;
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO employees (name, email, phone, department_id, designation, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name.trim(), email.trim().toLowerCase(), phone.trim(), department_id, designation.trim(), employeeStatus]
      );
      insertId = result.insertId;

      await logAudit({
        connection,
        req,
        action: 'CREATE',
        entityType: 'EMPLOYEE',
        entityId: insertId,
        employeeName: name.trim(),
        details: `Created new employee record (${designation.trim()}, ${employeeStatus})`
      });

      await connection.commit();
    } catch (txErr) {
      if (connection) await connection.rollback();
      throw txErr;
    } finally {
      if (connection) connection.release();
    }

    await notifyAdmins({
      type: 'system',
      title: 'New Employee Added',
      message: `${name.trim()} was added to the directory as ${designation.trim()}.`,
      link: `/employees/${insertId}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.status(201).json({
      message: 'Employee added successfully!',
      employeeId: insertId
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add employee.', error: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, department_id, designation, status } = req.body;

    if (!name || !email || !phone || !department_id || !designation) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const [existing] = await pool.query('SELECT id, deleted_at FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    if (existing[0].deleted_at) {
      return res.status(400).json({ message: 'Cannot edit an archived employee. Please restore the employee first.' });
    }

    const [emailConflict] = await pool.query(
      'SELECT id FROM employees WHERE email = ? AND id != ?',
      [email.trim().toLowerCase(), id]
    );
    if (emailConflict.length > 0) {
      return res.status(400).json({ message: 'Email is already used by another employee.' });
    }

    const employeeStatus = status === 'Inactive' ? 'Inactive' : 'Active';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE employees 
         SET name = ?, email = ?, phone = ?, department_id = ?, designation = ?, status = ?
         WHERE id = ?`,
        [name, email, phone, department_id, designation, employeeStatus, id]
      );

      await logAudit({
        connection,
        req,
        action: 'UPDATE',
        entityType: 'EMPLOYEE',
        entityId: id,
        employeeName: name.trim(),
        details: `Updated employee record (${designation.trim()}, ${employeeStatus})`
      });

      await connection.commit();
    } catch (txErr) {
      if (connection) await connection.rollback();
      throw txErr;
    } finally {
      if (connection) connection.release();
    }

    await notifyEmployeeUser({
      employeeId: id,
      type: 'account',
      title: 'Employment Details Updated',
      message: `Your personnel record was updated (Role: ${designation.trim()}, Status: ${employeeStatus}).`,
      link: `/employees/${id}`,
      sendEmail: true,
      emailDetails: `Your official employee details were updated. Designation: ${designation.trim()}, Status: ${employeeStatus}.`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    await notifyAdmins({
      type: 'system',
      title: 'Employee Updated',
      message: `Employee #${id} (${name.trim()}) details were modified.`,
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({ message: 'Employee updated successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update employee.', error: error.message });
  }
});

// --- PATCH /api/employees/:id/restore - Restore soft-deleted employee (Admin only) ---
router.patch('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [empRows] = await pool.query(
      'SELECT id, name, email, designation, deleted_at FROM employees WHERE id = ?',
      [id]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (!empRows[0].deleted_at) {
      return res.status(400).json({ message: 'Employee is not deleted.' });
    }

    const employeeName = empRows[0].name;

    // Check if another active employee is now using this email
    const [conflict] = await pool.query(
      'SELECT id FROM employees WHERE email = ? AND id != ? AND deleted_at IS NULL',
      [empRows[0].email, id]
    );

    if (conflict.length > 0) {
      return res.status(400).json({
        message: 'Cannot restore: Another active employee is currently using this email address.'
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE employees SET deleted_at = NULL WHERE id = ?', [id]);

      await logAudit({
        connection,
        req,
        action: 'RESTORE',
        entityType: 'EMPLOYEE',
        entityId: id,
        employeeName,
        details: `Restored employee #${id} (${employeeName}) to active directory`
      });

      await connection.commit();
    } catch (txErr) {
      if (connection) await connection.rollback();
      throw txErr;
    } finally {
      if (connection) connection.release();
    }

    await notifyAdmins({
      type: 'system',
      title: 'Employee Restored',
      message: `Employee #${id} (${employeeName}) was restored to the active directory.`,
      link: `/employees/${id}`,
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: `Employee "${employeeName}" restored successfully!`,
      employeeId: Number(id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to restore employee.', error: error.message });
  }
});

// --- DELETE /api/employees/:id - Soft-delete an employee (Admin only) ---
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [empRows] = await pool.query(
      'SELECT id, name, email, deleted_at FROM employees WHERE id = ?',
      [id]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (empRows[0].deleted_at) {
      return res.status(400).json({ message: 'Employee is already deleted.' });
    }

    const employeeName = empRows[0].name;

    // Perform soft deletion: set deleted_at to current timestamp.
    // Records, documents, avatars, and audit logs are safely preserved.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE employees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

      await logAudit({
        connection,
        req,
        action: 'DELETE',
        entityType: 'EMPLOYEE',
        entityId: id,
        employeeName,
        details: `Soft-deleted employee #${id} (${employeeName})`
      });

      await connection.commit();
    } catch (txErr) {
      if (connection) await connection.rollback();
      throw txErr;
    } finally {
      if (connection) connection.release();
    }

    await notifyAdmins({
      type: 'system',
      title: 'Employee Deleted',
      message: `Employee #${id} (${employeeName}) was moved to deleted archive.`,
      link: '/employees/deleted',
    }).catch((err) => console.error('[Notify error]:', err.message));

    res.json({
      message: `Employee "${employeeName}" moved to deleted archive successfully.`,
      employeeId: Number(id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete employee.', error: error.message });
  }
});

module.exports = router;
