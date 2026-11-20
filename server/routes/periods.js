const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const {
  assertPeriodOpen,
  isPeriodClosed,
  getClosingChecklist,
  closePeriod,
  reopenPeriod,
  getPeriodDetails,
  normalizeMonth,
} = require('../services/periodService');
const { generateCSV } = require('../utils/csvHelper');

// All period endpoints require authentication
router.use(authenticateToken);

/**
 * GET /api/periods/:month/status
 * Accessible to all authenticated users (Admin, HR, Managers, Employees)
 * Allows everyone to see if a month is currently closed.
 */
router.get('/:month/status', async (req, res) => {
  try {
    const month = normalizeMonth(req.params.month);
    const isClosed = await isPeriodClosed(month);
    res.json({
      month,
      status: isClosed ? 'closed' : 'open',
      isClosed,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check period status.', error: error.message });
  }
});

/**
 * GET /api/periods/:month/checklist
 * Admin and HR Manager only
 */
router.get('/:month/checklist', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      return res.status(403).json({ message: 'Access denied: Only Admin and HR can review closing checklist.' });
    }

    const month = normalizeMonth(req.params.month);
    const checklist = await getClosingChecklist(month);
    res.json(checklist);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch closing checklist.', error: error.message });
  }
});

/**
 * GET /api/periods/:month/details
 * Admin and HR Manager only
 * Fetches status, history timeline, and payroll summary rows.
 */
router.get('/:month/details', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      return res.status(403).json({ message: 'Access denied: Only Admin and HR can view period details.' });
    }

    const month = normalizeMonth(req.params.month);
    const details = await getPeriodDetails(month);
    res.json(details);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch period details.', error: error.message });
  }
});

/**
 * GET /api/periods/:month/summary/export
 * Admin and HR Manager only: CSV export of payroll_attendance_summary.
 */
router.get('/:month/summary/export', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const month = normalizeMonth(req.params.month);
    const details = await getPeriodDetails(month);
    const summaries = details.summaries || [];

    const exportData = summaries.map((s) => ({
      'Month': s.month,
      'Employee ID': s.employee_id,
      'Employee Name': s.employee_name,
      'Department': s.department_name || '',
      'Designation': s.designation || '',
      'Working Days': s.working_days,
      'Present Days': s.present_days,
      'Absent Days': s.absent_days,
      'Paid Leave Days': s.leave_days_paid,
      'Unpaid Leave Days': s.leave_days_unpaid,
      'Holidays': s.holiday_days,
      'Late Count': s.late_count,
      'Late Minutes': s.late_minutes,
      'Regular OT (mins)': s.approved_overtime_regular_minutes,
      'Weekend OT (mins)': s.approved_overtime_weekend_minutes,
      'Holiday OT (mins)': s.approved_overtime_holiday_minutes,
      'Total OT (mins)': s.approved_overtime_minutes,
      'Total OT (hrs)': Math.round((s.approved_overtime_minutes / 60) * 10) / 10,
    }));

    const csvString = generateCSV(exportData);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_attendance_summary_${month}.csv`);
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export summary.', error: error.message });
  }
});

/**
 * POST /api/periods/:month/close
 * Admin and HR Manager: close month
 * Admin only: override pending checklist items with mandatory reason
 */
router.post('/:month/close', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_manager') {
      return res.status(403).json({ message: 'Access denied: Only Admin and HR can close an attendance period.' });
    }

    const month = normalizeMonth(req.params.month);
    const { override = false, reason = null } = req.body;

    const result = await closePeriod({
      monthStr: month,
      userId: req.user.id,
      userRole: req.user.role,
      override: Boolean(override),
      reason,
      req,
    });

    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      message: error.message,
      code: error.code,
      checklist: error.checklist,
    });
  }
});

/**
 * POST /api/periods/:month/reopen
 * Admin only: reopen a closed month with mandatory reason (min 10 chars)
 */
router.post('/:month/reopen', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Only Admin can reopen a closed month.' });
    }

    const month = normalizeMonth(req.params.month);
    const { reason } = req.body;

    const result = await reopenPeriod({
      monthStr: month,
      userId: req.user.id,
      userRole: req.user.role,
      reason,
      req,
    });

    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message });
  }
});

module.exports = router;
