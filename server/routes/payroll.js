const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { logAudit } = require('../services/auditLogger');
const { notifyEmployeeUser } = require('../services/notificationService');
const { generatePayslipPDF } = require('../services/pdfGenerator');
const {
  roundToTwo,
  formatDate,
  getWorkingDaysInMonth,
  calculateEmployeePayslip
} = require('../services/payrollCalculator');

let isMigrated = false;
async function ensurePayrollTables() {
  if (isMigrated) return;
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'payroll_runs'");
    if (rows.length === 0) {
      console.log('[Payroll] Payroll tables missing in database. Auto-running migration...');
      const migratePayroll = require('../migrate_payroll');
      await migratePayroll();
      const { seedDefaultRuns } = require('../services/payrollSeeder');
      await seedDefaultRuns();
      console.log('[Payroll] Auto-migration and initial seed completed.');
    }
    isMigrated = true;
  } catch (err) {
    console.error('[Payroll] Failed to check/migrate tables:', err.message);
  }
}

// Auto-ensure tables exist before handling any payroll route
router.use(async (req, res, next) => {
  await ensurePayrollTables();
  next();
});

// Explicit endpoint to trigger database migration & initial seeding if needed
router.all('/init-database', async (req, res) => {
  try {
    const migratePayroll = require('../migrate_payroll');
    await migratePayroll();
    const { seedDefaultRuns } = require('../services/payrollSeeder');
    await seedDefaultRuns();
    isMigrated = true;
    res.json({ success: true, message: 'Payroll tables created and live runs seeded successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Protect all payroll routes with token authentication
router.use(authenticateToken);

// Helper to check if user is Admin or HR Manager
function isPayrollAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'hr_manager');
}

// ==========================================
// 1. SALARY STRUCTURE MANAGEMENT
// ==========================================

/**
 * GET /api/payroll/salaries
 * List salary structure for active employees. Admin and HR Manager only.
 */
router.get('/salaries', requirePermission('salary.view'), async (req, res) => {
  try {
    const { department_id, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        e.email,
        e.designation,
        d.id AS department_id,
        d.name AS department_name,
        COALESCE(s.basic_salary, 0.00) AS basic_salary,
        COALESCE(s.allowances, 0.00) AS allowances,
        COALESCE(s.fixed_deductions, 0.00) AS fixed_deductions,
        s.effective_date,
        s.updated_at AS salary_updated_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employee_salaries s ON e.id = s.employee_id
      WHERE e.status = 'Active' AND e.deleted_at IS NULL
    `;
    const params = [];

    if (department_id) {
      query += ' AND e.department_id = ?';
      params.push(department_id);
    }

    if (search) {
      query += ' AND (e.name LIKE ? OR e.email LIKE ? OR e.designation LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM (${query}) AS subq`;
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    query += ' ORDER BY e.name ASC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const [rows] = await pool.query(query, params);

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.status(500).json({ message: 'Failed to fetch salaries.', error: error.message });
  }
});

/**
 * GET /api/payroll/salaries/:employeeId
 * Get specific employee salary details and audit change history. Admin and HR Manager only.
 */
router.get('/salaries/:employeeId', requirePermission('salary.view'), async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID.' });
    }

    const [employees] = await pool.query(`
      SELECT e.id, e.name, e.email, e.designation, d.name AS department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `, [employeeId]);

    if (employees.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const [salaryRows] = await pool.query(
      'SELECT * FROM employee_salaries WHERE employee_id = ?',
      [employeeId]
    );

    // Fetch salary history from audit logs
    const [historyRows] = await pool.query(`
      SELECT id, user_name, user_email, action, details, created_at
      FROM audit_logs
      WHERE entity_type = 'SALARY' AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [employeeId]);

    res.json({
      employee: employees[0],
      salary: salaryRows[0] || null,
      history: historyRows
    });
  } catch (error) {
    console.error('Error fetching employee salary:', error);
    res.status(500).json({ message: 'Failed to fetch salary details.', error: error.message });
  }
});

/**
 * PUT /api/payroll/salaries/:employeeId
 * Update or set an employee's salary structure. Admin and HR Manager only.
 * Logs full change history (who, old value, new value, when) to the audit log.
 */
router.put('/salaries/:employeeId', requirePermission('salary.manage'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    const { basic_salary, allowances = 0, fixed_deductions = 0, effective_date } = req.body;

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID.' });
    }

    const numBasic = roundToTwo(basic_salary);
    const numAllow = roundToTwo(allowances);
    const numDeduct = roundToTwo(fixed_deductions);

    if (isNaN(numBasic) || numBasic < 0) {
      return res.status(400).json({ message: 'Basic salary must be a positive number.' });
    }

    if (!effective_date) {
      return res.status(400).json({ message: 'Effective date is required.' });
    }

    await conn.beginTransaction();

    const [empRows] = await conn.query('SELECT name FROM employees WHERE id = ?', [employeeId]);
    if (empRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Employee not found.' });
    }
    const employeeName = empRows[0].name;

    // Check existing salary
    const [existing] = await conn.query(
      'SELECT * FROM employee_salaries WHERE employee_id = ?',
      [employeeId]
    );

    let actionType = 'UPDATE';
    let oldDetails = null;

    if (existing.length === 0) {
      actionType = 'CREATE';
      await conn.query(`
        INSERT INTO employee_salaries (employee_id, basic_salary, allowances, fixed_deductions, effective_date)
        VALUES (?, ?, ?, ?, ?)
      `, [employeeId, numBasic, numAllow, numDeduct, effective_date]);
    } else {
      const prev = existing[0];
      oldDetails = {
        basic_salary: Number(prev.basic_salary),
        allowances: Number(prev.allowances),
        fixed_deductions: Number(prev.fixed_deductions),
        effective_date: formatDate(prev.effective_date)
      };

      await conn.query(`
        UPDATE employee_salaries
        SET basic_salary = ?, allowances = ?, fixed_deductions = ?, effective_date = ?
        WHERE employee_id = ?
      `, [numBasic, numAllow, numDeduct, effective_date, employeeId]);
    }

    const newDetails = {
      basic_salary: numBasic,
      allowances: numAllow,
      fixed_deductions: numDeduct,
      effective_date
    };

    // Save history (who, old value, new value, when) in audit log
    const auditDetails = JSON.stringify({
      old: oldDetails,
      new: newDetails,
      summary: actionType === 'CREATE'
        ? `Created salary structure: Basic PKR ${numBasic}, Allowances PKR ${numAllow}, Deductions PKR ${numDeduct}, Effective ${effective_date}`
        : `Updated salary structure: Basic PKR ${oldDetails?.basic_salary} -> PKR ${numBasic}, Allowances PKR ${oldDetails?.allowances} -> PKR ${numAllow}, Effective ${effective_date}`
    });

    await logAudit({
      connection: conn,
      req,
      action: actionType,
      entityType: 'SALARY',
      entityId: employeeId,
      employeeName,
      details: auditDetails
    });

    await conn.commit();

    res.json({
      message: 'Salary structure updated successfully.',
      salary: {
        employee_id: employeeId,
        ...newDetails
      }
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error updating salary:', error);
    res.status(500).json({ message: 'Failed to update salary structure.', error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// 2. SETTINGS & HOLIDAYS
// ==========================================

/**
 * GET /api/payroll/settings
 */
router.get('/settings', requirePermission('payroll.view'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payroll_settings WHERE id = 1');
    res.json(rows[0] || {
      late_arrival_threshold: 3,
      late_deduction_days: 1.0,
      overtime_multiplier: 1.5,
      standard_daily_hours: 8.0,
      currency: 'PKR'
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch settings.', error: error.message });
  }
});

/**
 * PUT /api/payroll/settings
 */
router.put('/settings', requirePermission('payroll.manage'), async (req, res) => {
  try {
    const {
      late_arrival_threshold = 3,
      late_deduction_days = 1.0,
      overtime_multiplier = 1.5,
      standard_daily_hours = 8.0
    } = req.body;

    await pool.query(`
      UPDATE payroll_settings
      SET late_arrival_threshold = ?, late_deduction_days = ?, overtime_multiplier = ?, standard_daily_hours = ?
      WHERE id = 1
    `, [
      parseInt(late_arrival_threshold, 10) || 3,
      parseFloat(late_deduction_days) || 1.0,
      parseFloat(overtime_multiplier) || 1.5,
      parseFloat(standard_daily_hours) || 8.0
    ]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'PAYROLL_SETTINGS',
      entityId: 1,
      employeeName: 'Organization',
      details: `Updated settings: late_threshold=${late_arrival_threshold}, overtime_multiplier=${overtime_multiplier}`
    });

    res.json({ message: 'Payroll settings updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update settings.', error: error.message });
  }
});

/**
 * GET /api/payroll/holidays
 */
router.get('/holidays', requirePermission('payroll.view'), async (req, res) => {
  try {
    const { year } = req.query;
    let query = 'SELECT * FROM holidays';
    const params = [];
    if (year) {
      query += ' WHERE YEAR(date) = ?';
      params.push(year);
    }
    query += ' ORDER BY date ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch holidays.', error: error.message });
  }
});

/**
 * POST /api/payroll/holidays
 */
router.post('/holidays', requirePermission('payroll.manage'), async (req, res) => {
  try {
    const { name, date } = req.body;
    if (!name || !date) {
      return res.status(400).json({ message: 'Name and date are required.' });
    }
    const [result] = await pool.query('INSERT INTO holidays (name, date) VALUES (?, ?)', [name, date]);
    res.status(201).json({ id: result.insertId, name, date });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Holiday already exists on this date.' });
    }
    res.status(500).json({ message: 'Failed to add holiday.', error: error.message });
  }
});

// ==========================================
// 3. MONTHLY PAYROLL RUNS (Draft -> Approve -> Lock)
// ==========================================

/**
 * GET /api/payroll/runs
 * List all monthly payroll runs. Admin and HR Manager only.
 */
router.get('/runs', requirePermission('payroll.view'), async (req, res) => {
  try {
    const [runs] = await pool.query(`
      SELECT 
        pr.*,
        u_creator.name AS created_by_name,
        u_approver.name AS approved_by_name,
        u_locker.name AS locked_by_name,
        u_ack.name AS warnings_acknowledged_by_name
      FROM payroll_runs pr
      LEFT JOIN users u_creator ON pr.created_by = u_creator.id
      LEFT JOIN users u_approver ON pr.approved_by = u_approver.id
      LEFT JOIN users u_locker ON pr.locked_by = u_locker.id
      LEFT JOIN users u_ack ON pr.warnings_acknowledged_by = u_ack.id
      ORDER BY pr.month DESC
    `);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching payroll runs:', error);
    res.status(500).json({ message: 'Failed to fetch payroll runs.', error: error.message });
  }
});

/**
 * GET /api/payroll/runs/:month
 * Get specific payroll run by month (e.g. '2026-11') or ID with employee payslips.
 */
router.get('/runs/:month', requirePermission('payroll.view'), async (req, res) => {
  try {
    const param = req.params.month;
    let runQuery = `
      SELECT 
        pr.*,
        u_creator.name AS created_by_name,
        u_approver.name AS approved_by_name,
        u_locker.name AS locked_by_name,
        u_ack.name AS warnings_acknowledged_by_name
      FROM payroll_runs pr
      LEFT JOIN users u_creator ON pr.created_by = u_creator.id
      LEFT JOIN users u_approver ON pr.approved_by = u_approver.id
      LEFT JOIN users u_locker ON pr.locked_by = u_locker.id
      LEFT JOIN users u_ack ON pr.warnings_acknowledged_by = u_ack.id
      WHERE pr.month = ? OR pr.id = ?
    `;

    const [runs] = await pool.query(runQuery, [param, isNaN(param) ? 0 : parseInt(param, 10)]);
    if (runs.length === 0) {
      return res.status(404).json({ message: `No payroll run found for ${param}.` });
    }
    const run = runs[0];

    // Fetch payslips with employee details
    const [payslips] = await pool.query(`
      SELECT 
        ps.*,
        e.name AS employee_name,
        e.email AS employee_email,
        e.designation,
        d.name AS department_name
      FROM payslips ps
      JOIN employees e ON ps.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ps.payroll_run_id = ?
      ORDER BY e.name ASC
    `, [run.id]);

    // Parse warnings JSON safely
    const formattedPayslips = payslips.map(p => ({
      ...p,
      warnings: typeof p.warnings === 'string' ? JSON.parse(p.warnings) : (p.warnings || [])
    }));

    res.json({
      run,
      payslips: formattedPayslips
    });
  } catch (error) {
    console.error('Error fetching run details:', error);
    res.status(500).json({ message: 'Failed to fetch payroll run details.', error: error.message });
  }
});

/**
 * POST /api/payroll/runs/generate
 * Starts a payroll run for a chosen month in DRAFT status.
 * Enforces permissions, database transaction, unique constraint (prevent duplicate run).
 */
router.post('/runs/generate', requirePermission('payroll.manage'), async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const { month } = req.body; // format 'YYYY-MM'
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ message: 'Valid month in YYYY-MM format is required (e.g., 2026-11).' });
    }

    await conn.beginTransaction();

    // 1. Check if run already exists for this month (enforce single run per month)
    const [existingRun] = await conn.query('SELECT id, status FROM payroll_runs WHERE month = ?', [month]);
    if (existingRun.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `Payroll run for month ${month} already exists with status: ${existingRun[0].status}. Duplicate runs for the same month are not allowed.`
      });
    }

    // 2. Fetch Settings
    const [settingsRows] = await conn.query('SELECT * FROM payroll_settings WHERE id = 1');
    const settings = settingsRows[0] || {
      late_arrival_threshold: 3,
      late_deduction_days: 1.0,
      overtime_multiplier: 1.5,
      standard_daily_hours: 8.0,
    };

    // 3. Fetch Holidays for working days calculation
    const [holidayRows] = await conn.query('SELECT date FROM holidays');
    const holidaysSet = new Set(holidayRows.map(h => formatDate(h.date)));

    const workingDaysData = getWorkingDaysInMonth(month, holidaysSet);
    const { workingDaysCount, monthStartDate, monthEndDate } = workingDaysData;

    // 4. Fetch Active Employees
    const [employees] = await conn.query(`
      SELECT id, name, email, designation, department_id, joining_date, created_at, termination_date
      FROM employees
      WHERE status = 'Active' AND deleted_at IS NULL
      ORDER BY name ASC
    `);

    if (employees.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'No active employees found to generate payroll.' });
    }

    // 5. Fetch all Salaries
    const [salaries] = await conn.query('SELECT * FROM employee_salaries');
    const salaryMap = new Map();
    for (const s of salaries) {
      salaryMap.set(s.employee_id, s);
    }

    // 6. Fetch previous month's payslips for variance warning detection (> 20%)
    const [yearStr, monthStr] = month.split('-');
    const prevDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const [prevPayslips] = await conn.query(`
      SELECT employee_id, basic_salary FROM payslips WHERE month = ?
    `, [prevMonthStr]);
    const prevPayslipMap = new Map();
    for (const ps of prevPayslips) {
      prevPayslipMap.set(ps.employee_id, ps);
    }

    // 7. Fetch all attendance records for this month
    const [attendanceRows] = await conn.query(`
      SELECT id, employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status
      FROM attendance
      WHERE date >= ? AND date <= ?
    `, [monthStartDate, monthEndDate]);

    const attendanceByEmp = new Map();
    for (const a of attendanceRows) {
      if (!attendanceByEmp.has(a.employee_id)) {
        attendanceByEmp.set(a.employee_id, []);
      }
      attendanceByEmp.get(a.employee_id).push(a);
    }

    // 8. Fetch approved leaves overlapping this month
    const [leaveRows] = await conn.query(`
      SELECT id, employee_id, leave_type, start_date, end_date, days_count, status
      FROM leave_requests
      WHERE status = 'APPROVED'
        AND start_date <= ? AND end_date >= ?
    `, [monthEndDate, monthStartDate]);

    const leavesByEmp = new Map();
    for (const l of leaveRows) {
      if (!leavesByEmp.has(l.employee_id)) {
        leavesByEmp.set(l.employee_id, []);
      }
      leavesByEmp.get(l.employee_id).push(l);
    }

    // 9. Fetch pending adjustments
    const [adjustmentRows] = await conn.query(`
      SELECT id, employee_id, source_month, type, amount, reason, reference_id
      FROM payroll_adjustments
      WHERE status = 'PENDING'
    `);

    const adjustmentsByEmp = new Map();
    for (const adj of adjustmentRows) {
      if (!adjustmentsByEmp.has(adj.employee_id)) {
        adjustmentsByEmp.set(adj.employee_id, []);
      }
      adjustmentsByEmp.get(adj.employee_id).push(adj);
    }

    // 10. Compute payslips for each active employee
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalWarningsCount = 0;

    const computedPayslips = [];

    for (const emp of employees) {
      const sal = salaryMap.get(emp.id) || null;
      const empAttendance = attendanceByEmp.get(emp.id) || [];
      const empLeaves = leavesByEmp.get(emp.id) || [];
      const empAdjustments = adjustmentsByEmp.get(emp.id) || [];
      const prevPs = prevPayslipMap.get(emp.id) || null;

      const payslipData = calculateEmployeePayslip({
        employee: emp,
        salary: sal,
        yearMonth: month,
        workingDaysData,
        attendanceRecords: empAttendance,
        leaveRequests: empLeaves,
        pendingAdjustments: empAdjustments,
        prevMonthPayslip: prevPs,
        settings
      });

      totalGross = roundToTwo(totalGross + payslipData.gross_pay);
      totalDeductions = roundToTwo(totalDeductions + payslipData.total_deductions);
      totalNet = roundToTwo(totalNet + payslipData.net_pay);
      totalWarningsCount += payslipData.warnings.length;

      computedPayslips.push(payslipData);
    }

    // 11. Insert `payroll_runs` record
    const [runResult] = await conn.query(`
      INSERT INTO payroll_runs (
        month, status, working_days, total_employees,
        total_gross, total_deductions, total_net,
        warnings_count, warnings_acknowledged,
        created_by
      ) VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, FALSE, ?)
    `, [
      month,
      workingDaysCount,
      employees.length,
      totalGross,
      totalDeductions,
      totalNet,
      totalWarningsCount,
      req.user.id
    ]);

    const payrollRunId = runResult.insertId;

    // 12. Bulk Insert Payslips (optimized for cloud / serverless latency)
    const psPlaceholders = [];
    const psValues = [];
    for (const ps of computedPayslips) {
      psPlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      psValues.push(
        payrollRunId, ps.employee_id, month, 'Draft',
        ps.basic_salary, ps.daily_rate, ps.hourly_rate,
        ps.working_days_in_month, ps.payable_days, ps.prorated_basic,
        ps.allowances, ps.overtime_hours, ps.overtime_multiplier, ps.overtime_pay,
        ps.fixed_deductions, ps.unpaid_leave_days, ps.unpaid_leave_deduction,
        ps.absent_days, ps.absence_deduction,
        ps.late_arrivals_count, ps.late_deduction_days, ps.late_deduction_amount,
        ps.adjustments_amount, ps.gross_pay, ps.total_deductions, ps.net_pay,
        JSON.stringify(ps.warnings)
      );
    }

    if (psPlaceholders.length > 0) {
      await conn.query(`
        INSERT INTO payslips (
          payroll_run_id, employee_id, month, status,
          basic_salary, daily_rate, hourly_rate,
          working_days_in_month, payable_days, prorated_basic,
          allowances, overtime_hours, overtime_multiplier, overtime_pay,
          fixed_deductions, unpaid_leave_days, unpaid_leave_deduction,
          absent_days, absence_deduction,
          late_arrivals_count, late_deduction_days, late_deduction_amount,
          adjustments_amount, gross_pay, total_deductions, net_pay,
          warnings
        ) VALUES ${psPlaceholders.join(', ')}
      `, psValues);
    }

    // Retrieve generated payslip IDs for bulk item mapping
    const [insertedPayslips] = await conn.query(
      'SELECT id, employee_id FROM payslips WHERE payroll_run_id = ?',
      [payrollRunId]
    );
    const empToPayslipId = new Map();
    insertedPayslips.forEach(row => empToPayslipId.set(row.employee_id, row.id));

    // 13. Bulk Insert Payslip Line Items
    const itemPlaceholders = [];
    const itemValues = [];
    for (const ps of computedPayslips) {
      const payslipId = empToPayslipId.get(ps.employee_id);
      if (!payslipId) continue;

      for (const item of ps.lineItems) {
        itemPlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        itemValues.push(
          payslipId, item.category, item.type, item.description,
          item.amount, item.rate, item.quantity,
          item.related_entity_type || null,
          item.related_entity_ids ? JSON.stringify(item.related_entity_ids) : null
        );
      }
    }

    if (itemPlaceholders.length > 0) {
      await conn.query(`
        INSERT INTO payslip_items (
          payslip_id, category, type, description,
          amount, rate, quantity, related_entity_type, related_entity_ids
        ) VALUES ${itemPlaceholders.join(', ')}
      `, itemValues);
    }

    // Link pending adjustments to this payroll run
    if (adjustmentRows.length > 0) {
      await conn.query(`
        UPDATE payroll_adjustments
        SET target_payroll_run_id = ?
        WHERE status = 'PENDING'
      `, [payrollRunId]);
    }

    // Log audit
    await logAudit({
      connection: conn,
      req,
      action: 'CREATE',
      entityType: 'PAYROLL_RUN',
      entityId: payrollRunId,
      employeeName: 'All Active Personnel',
      details: `Generated Draft payroll run for ${month}: ${employees.length} employees, Net PKR ${totalNet.toLocaleString()}, ${totalWarningsCount} warnings detected.`
    });

    await conn.commit();

    res.status(201).json({
      message: `Payroll run for ${month} generated successfully in Draft status.`,
      run: {
        id: payrollRunId,
        month,
        status: 'Draft',
        working_days: workingDaysCount,
        total_employees: employees.length,
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        warnings_count: totalWarningsCount,
        warnings_acknowledged: false
      }
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error generating payroll run:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Payroll for this month has already been generated.' });
    }
    res.status(500).json({ message: 'Failed to generate payroll run.', error: error.message });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/payroll/runs/:id/acknowledge-warnings
 * HR Manager or Admin acknowledges draft warnings before approval.
 */
router.post('/runs/:id/acknowledge-warnings', requirePermission('payroll.manage'), async (req, res) => {
  try {
    const runId = parseInt(req.params.id, 10);
    const [runs] = await pool.query('SELECT * FROM payroll_runs WHERE id = ?', [runId]);

    if (runs.length === 0) {
      return res.status(404).json({ message: 'Payroll run not found.' });
    }

    const run = runs[0];
    if (run.status !== 'Draft') {
      return res.status(400).json({ message: `Cannot modify warnings for a payroll run in ${run.status} status.` });
    }

    await pool.query(`
      UPDATE payroll_runs
      SET warnings_acknowledged = TRUE,
          warnings_acknowledged_by = ?,
          warnings_acknowledged_at = NOW()
      WHERE id = ?
    `, [req.user.id, runId]);

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'PAYROLL_RUN',
      entityId: runId,
      employeeName: 'Organization',
      details: `Acknowledged ${run.warnings_count} payroll warnings for month ${run.month}`
    });

    res.json({ message: 'Warnings acknowledged successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to acknowledge warnings.', error: error.message });
  }
});

/**
 * POST /api/payroll/runs/:id/approve
 * Approves a draft payroll run.
 * Rules enforced:
 * - Admin or HR Manager only.
 * - Separation of duties: "The person who created the run can't be the only approver (second approval required)".
 * - Warnings must be acknowledged before approval.
 * - Database transaction.
 * - Locks the month's attendance records once payroll is approved.
 * - Sends notification to all employees that their payslip is ready.
 */
router.post('/runs/:id/approve', requirePermission('payroll.approve'), async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const runId = parseInt(req.params.id, 10);
    if (isNaN(runId)) {
      return res.status(400).json({ message: 'Invalid payroll run ID.' });
    }

    await conn.beginTransaction();

    const [runs] = await conn.query('SELECT * FROM payroll_runs WHERE id = ? FOR UPDATE', [runId]);
    if (runs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Payroll run not found.' });
    }

    const run = runs[0];

    // Status check
    if (run.status !== 'Draft') {
      await conn.rollback();
      return res.status(400).json({
        message: `Only DRAFT payroll runs can be approved. Current status: ${run.status}.`
      });
    }

    // Separation of duties rule: creator cannot be the only approver!
    if (run.created_by === req.user.id) {
      await conn.rollback();
      return res.status(403).json({
        message: 'Separation of Duties Violation: The person who created the payroll run cannot approve it. A second approval by another Admin or HR Manager is required.'
      });
    }

    // Warnings must be acknowledged before approval
    if (run.warnings_count > 0 && !run.warnings_acknowledged) {
      await conn.rollback();
      return res.status(400).json({
        message: `This payroll run contains ${run.warnings_count} warning(s). Warnings must be acknowledged before approval.`
      });
    }

    // Update payroll run status to Approved
    await conn.query(`
      UPDATE payroll_runs
      SET status = 'Approved',
          approved_by = ?,
          approved_at = NOW()
      WHERE id = ?
    `, [req.user.id, runId]);

    // Update all payslips status to Approved
    await conn.query(`
      UPDATE payslips
      SET status = 'Approved'
      WHERE payroll_run_id = ?
    `, [runId]);

    // Rule: "Lock the month's attendance once payroll is approved"
    await conn.query(`
      UPDATE attendance
      SET is_locked = TRUE
      WHERE DATE_FORMAT(date, '%Y-%m') = ?
    `, [run.month]);

    // Fetch all employees in this run to send notifications
    const [payslipEmps] = await conn.query(`
      SELECT ps.id AS payslip_id, ps.employee_id, ps.net_pay, e.name
      FROM payslips ps
      JOIN employees e ON ps.employee_id = e.id
      WHERE ps.payroll_run_id = ?
    `, [runId]);

    await logAudit({
      connection: conn,
      req,
      action: 'UPDATE',
      entityType: 'PAYROLL_RUN',
      entityId: runId,
      employeeName: 'All Active Personnel',
      details: `Approved payroll run for ${run.month} by user ${req.user.name} (${req.user.role}). Month attendance locked.`
    });

    await conn.commit();

    // Trigger in-app notifications asynchronously for each employee:
    // "Employees see only their own payslips (only after approval) and get a notification when it's ready."
    for (const p of payslipEmps) {
      notifyEmployeeUser({
        employeeId: p.employee_id,
        type: 'system',
        title: `Payslip Available (${run.month})`,
        message: `Your payslip for ${run.month} has been approved. Net salary: PKR ${Number(p.net_pay).toLocaleString()}. Click to view your breakdown.`,
        link: '/my-payslips'
      }).catch((err) => console.error(`[Notification Error] Employee ${p.employee_id}:`, err.message));
    }

    res.json({
      message: `Payroll run for ${run.month} has been approved successfully. Attendance for ${run.month} is now locked, and employees have been notified.`,
      status: 'Approved'
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error approving payroll run:', error);
    res.status(500).json({ message: 'Failed to approve payroll run.', error: error.message });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/payroll/runs/:id/lock
 * Locks an approved payroll run.
 * Rules:
 * - Admin or HR Manager only.
 * - Transition Approved -> Locked.
 * - Approved or locked payslips can't be edited. Never edit a locked payslip.
 * - Marks included adjustments as APPLIED.
 */
router.post('/runs/:id/lock', requirePermission('payroll.manage'), async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const runId = parseInt(req.params.id, 10);
    if (isNaN(runId)) {
      return res.status(400).json({ message: 'Invalid payroll run ID.' });
    }

    await conn.beginTransaction();

    const [runs] = await conn.query('SELECT * FROM payroll_runs WHERE id = ? FOR UPDATE', [runId]);
    if (runs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Payroll run not found.' });
    }

    const run = runs[0];

    if (run.status !== 'Approved') {
      await conn.rollback();
      return res.status(400).json({
        message: `Only APPROVED payroll runs can be locked. Current status: ${run.status}.`
      });
    }

    // Update payroll run status to Locked
    await conn.query(`
      UPDATE payroll_runs
      SET status = 'Locked',
          locked_by = ?,
          locked_at = NOW()
      WHERE id = ?
    `, [req.user.id, runId]);

    // Update payslips status to Locked
    await conn.query(`
      UPDATE payslips
      SET status = 'Locked'
      WHERE payroll_run_id = ?
    `, [runId]);

    // Mark pending adjustments linked to this run as APPLIED
    await conn.query(`
      UPDATE payroll_adjustments
      SET status = 'APPLIED',
          applied_at = NOW()
      WHERE target_payroll_run_id = ?
    `, [runId]);

    await logAudit({
      connection: conn,
      req,
      action: 'UPDATE',
      entityType: 'PAYROLL_RUN',
      entityId: runId,
      employeeName: 'Organization',
      details: `Permanently locked payroll run for ${run.month}. Payslips are now immutable.`
    });

    await conn.commit();

    res.json({
      message: `Payroll run for ${run.month} is now LOCKED and finalized. No further changes can be made to this period's payslips.`,
      status: 'Locked'
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error locking payroll run:', error);
    res.status(500).json({ message: 'Failed to lock payroll run.', error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// 4. PAYSLIP DETAIL & EMPLOYEE ACCESS
// ==========================================

/**
 * GET /api/payroll/my-payslips
 * Employee's own payslips. Only approved or locked payslips are visible!
 */
router.get('/my-payslips', async (req, res) => {
  try {
    let employeeId = req.user.employee_id;
    if (!employeeId) {
      const [matched] = await pool.query(
        'SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL',
        [req.user.email]
      );
      if (matched.length > 0) {
        employeeId = matched[0].id;
      }
    }

    if (!employeeId) {
      return res.status(400).json({ message: 'No linked employee profile found for your account.' });
    }

    const [payslips] = await pool.query(`
      SELECT 
        ps.id, ps.month, ps.status, ps.basic_salary, ps.gross_pay,
        ps.total_deductions, ps.adjustments_amount, ps.net_pay,
        ps.payable_days, ps.working_days_in_month, ps.created_at,
        pr.approved_at, pr.locked_at
      FROM payslips ps
      JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
      WHERE ps.employee_id = ? AND ps.status IN ('Approved', 'Locked')
      ORDER BY ps.month DESC
    `, [employeeId]);

    res.json(payslips);
  } catch (error) {
    console.error('Error fetching my-payslips:', error);
    res.status(500).json({ message: 'Failed to fetch your payslips.', error: error.message });
  }
});

/**
 * GET /api/payroll/payslips/:id
 * Line-by-line breakdown for a specific payslip.
 * Security enforcement:
 * - Employees can ONLY see their own payslips AND only after approval.
 * - Department managers can only see their department's approved payslips.
 * - Admin and HR Manager can view any payslip (including Draft for review).
 */
router.get('/payslips/:id', async (req, res) => {
  try {
    const payslipId = parseInt(req.params.id, 10);
    if (isNaN(payslipId)) {
      return res.status(400).json({ message: 'Invalid payslip ID.' });
    }

    const [payslips] = await pool.query(`
      SELECT 
        ps.*,
        e.name AS employee_name,
        e.email AS employee_email,
        e.designation,
        e.department_id,
        d.name AS department_name,
        pr.created_by,
        pr.approved_by,
        pr.locked_by
      FROM payslips ps
      JOIN employees e ON ps.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
      WHERE ps.id = ?
    `, [payslipId]);

    if (payslips.length === 0) {
      return res.status(404).json({ message: 'Payslip not found.' });
    }

    const payslip = payslips[0];

    // RBAC & Scope Enforcement
    if (!isPayrollAdmin(req.user)) {
      // Regular Employee
      if (req.user.role === 'employee') {
        const empId = req.user.employee_id;
        if (!empId || empId !== payslip.employee_id) {
          return res.status(403).json({ message: 'Access denied: You cannot view another employee\'s payslip.' });
        }
        if (payslip.status === 'Draft') {
          return res.status(403).json({ message: 'Access denied: Payslips are only accessible after approval.' });
        }
      } else if (req.user.role === 'department_manager') {
        if (!req.user.department_id || req.user.department_id !== payslip.department_id) {
          return res.status(403).json({ message: 'Access denied: This employee is not in your department.' });
        }
        if (payslip.status === 'Draft') {
          return res.status(403).json({ message: 'Access denied: Payslips are only accessible after approval.' });
        }
      } else {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    // Fetch line items
    const [items] = await pool.query(`
      SELECT 
        id, category, type, description, amount, rate, quantity,
        related_entity_type, related_entity_ids, created_at
      FROM payslip_items
      WHERE payslip_id = ?
      ORDER BY 
        CASE category 
          WHEN 'EARNING' THEN 1 
          WHEN 'DEDUCTION' THEN 2 
          WHEN 'ADJUSTMENT' THEN 3 
          ELSE 4 
        END, id ASC
    `, [payslipId]);

    const formattedItems = items.map(i => ({
      ...i,
      related_entity_ids: typeof i.related_entity_ids === 'string' ? JSON.parse(i.related_entity_ids) : (i.related_entity_ids || [])
    }));

    res.json({
      payslip: {
        ...payslip,
        warnings: typeof payslip.warnings === 'string' ? JSON.parse(payslip.warnings) : (payslip.warnings || [])
      },
      items: formattedItems
    });
  } catch (error) {
    console.error('Error fetching payslip details:', error);
    res.status(500).json({ message: 'Failed to fetch payslip details.', error: error.message });
  }
});

/**
 * GET /api/payroll/payslips/:id/pdf
 * Downloadable PDF for a payslip.
 * Same permissions and security checks apply.
 */
router.get('/payslips/:id/pdf', async (req, res) => {
  try {
    const payslipId = parseInt(req.params.id, 10);
    if (isNaN(payslipId)) {
      return res.status(400).json({ message: 'Invalid payslip ID.' });
    }

    const [payslips] = await pool.query(`
      SELECT 
        ps.*,
        e.name,
        e.email,
        e.designation,
        e.department_id,
        d.name AS department_name
      FROM payslips ps
      JOIN employees e ON ps.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ps.id = ?
    `, [payslipId]);

    if (payslips.length === 0) {
      return res.status(404).json({ message: 'Payslip not found.' });
    }

    const payslip = payslips[0];

    // RBAC check
    if (!isPayrollAdmin(req.user)) {
      if (req.user.role === 'employee') {
        const empId = req.user.employee_id;
        if (!empId || empId !== payslip.employee_id) {
          return res.status(403).json({ message: 'Access denied: You cannot download another employee\'s payslip.' });
        }
        if (payslip.status === 'Draft') {
          return res.status(403).json({ message: 'Access denied: Payslips can only be downloaded after approval.' });
        }
      } else if (req.user.role === 'department_manager') {
        if (!req.user.department_id || req.user.department_id !== payslip.department_id) {
          return res.status(403).json({ message: 'Access denied.' });
        }
        if (payslip.status === 'Draft') {
          return res.status(403).json({ message: 'Access denied.' });
        }
      } else {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    // Fetch line items
    const [items] = await pool.query(`
      SELECT category, type, description, amount, rate, quantity
      FROM payslip_items
      WHERE payslip_id = ?
      ORDER BY 
        CASE category 
          WHEN 'EARNING' THEN 1 
          WHEN 'DEDUCTION' THEN 2 
          WHEN 'ADJUSTMENT' THEN 3 
          ELSE 4 
        END, id ASC
    `, [payslipId]);

    const pdfDoc = generatePayslipPDF({
      payslip,
      employee: {
        id: payslip.employee_id,
        name: payslip.name,
        email: payslip.email,
        designation: payslip.designation,
        department_name: payslip.department_name
      },
      items
    });

    const sanitizedName = payslip.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Payslip_${sanitizedName}_${payslip.month}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    pdfDoc.pipe(res);
  } catch (error) {
    console.error('Error downloading payslip PDF:', error);
    res.status(500).json({ message: 'Failed to generate payslip PDF.', error: error.message });
  }
});

module.exports = router;
