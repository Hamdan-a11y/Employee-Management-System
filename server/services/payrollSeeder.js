const pool = require('../db');
const { getWorkingDaysInMonth, calculateEmployeePayslip, roundToTwo, formatDate } = require('./payrollCalculator');

/**
 * Seeds October 2026 (Locked) and November 2026 (Draft) payroll runs with full data.
 */
async function seedDefaultRuns(executor = pool) {
  try {
    const [existing] = await executor.query('SELECT COUNT(*) as count FROM payroll_runs');
    if (existing[0]?.count > 0) {
      console.log('[PayrollSeeder] Payroll runs already exist, skipping default run seed.');
      return;
    }

    console.log('[PayrollSeeder] Seeding default October (Locked) and November (Draft) runs...');

    const [holidayRows] = await executor.query('SELECT date FROM holidays');
    const holidaysSet = new Set(holidayRows.map(h => formatDate(h.date)));

    const [employees] = await executor.query(`
      SELECT id, name, email, designation, department_id, created_at, joining_date, termination_date
      FROM employees
      WHERE status = 'Active' AND deleted_at IS NULL
      ORDER BY id ASC
    `);

    if (employees.length === 0) return;

    // Ensure all employees have salary
    for (const emp of employees) {
      const [sal] = await executor.query('SELECT id FROM employee_salaries WHERE employee_id = ?', [emp.id]);
      if (sal.length === 0) {
        let basic = 120000;
        let allowances = 15000;
        let fixedDeductions = 5000;
        const des = (emp.designation || '').toLowerCase();
        if (des.includes('architect') || des.includes('lead') || des.includes('head') || des.includes('vp')) {
          basic = 250000;
          allowances = 30000;
          fixedDeductions = 10000;
        } else if (des.includes('senior')) {
          basic = 180000;
          allowances = 20000;
          fixedDeductions = 7000;
        } else if (des.includes('junior') || des.includes('associate')) {
          basic = 75000;
          allowances = 10000;
          fixedDeductions = 3000;
        }

        await executor.query(`
          INSERT INTO employee_salaries (employee_id, basic_salary, allowances, fixed_deductions, effective_date)
          VALUES (?, ?, ?, ?, '2026-01-01')
        `, [emp.id, basic, allowances, fixedDeductions]);
      }
    }

    const [salaries] = await executor.query('SELECT * FROM employee_salaries');
    const salMap = new Map();
    salaries.forEach(s => salMap.set(s.employee_id, s));

    const [adminUsers] = await executor.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    const adminId = adminUsers[0]?.id || 1;
    const [hrUsers] = await executor.query('SELECT id FROM users WHERE role = "hr_manager" LIMIT 1');
    const hrId = hrUsers[0]?.id || 3;

    async function generateMonthRun(month, status) {
      const workingDaysData = getWorkingDaysInMonth(month, holidaysSet);
      const { workingDaysCount, monthStartDate, monthEndDate } = workingDaysData;

      const [attendance] = await executor.query(`
        SELECT id, employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status
        FROM attendance WHERE date >= ? AND date <= ?
      `, [monthStartDate, monthEndDate]);

      const attByEmp = new Map();
      attendance.forEach(a => {
        if (!attByEmp.has(a.employee_id)) attByEmp.set(a.employee_id, []);
        attByEmp.get(a.employee_id).push(a);
      });

      const [leaves] = await executor.query(`
        SELECT id, employee_id, leave_type, start_date, end_date, days_count, status
        FROM leave_requests WHERE status = 'APPROVED' AND start_date <= ? AND end_date >= ?
      `, [monthEndDate, monthStartDate]);

      const leaveByEmp = new Map();
      leaves.forEach(l => {
        if (!leaveByEmp.has(l.employee_id)) leaveByEmp.set(l.employee_id, []);
        leaveByEmp.get(l.employee_id).push(l);
      });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalWarnings = 0;

      const computed = [];

      for (const emp of employees) {
        const sal = salMap.get(emp.id) || null;
        const empAtt = attByEmp.get(emp.id) || [];
        const empLeaves = leaveByEmp.get(emp.id) || [];

        const ps = calculateEmployeePayslip({
          employee: emp,
          salary: sal,
          yearMonth: month,
          workingDaysData,
          attendanceRecords: empAtt,
          leaveRequests: empLeaves,
          pendingAdjustments: []
        });

        totalGross = roundToTwo(totalGross + ps.gross_pay);
        totalDeductions = roundToTwo(totalDeductions + ps.total_deductions);
        totalNet = roundToTwo(totalNet + ps.net_pay);
        totalWarnings += ps.warnings.length;

        computed.push(ps);
      }

      const [runRes] = await executor.query(`
        INSERT INTO payroll_runs (
          month, status, working_days, total_employees,
          total_gross, total_deductions, total_net,
          warnings_count, warnings_acknowledged,
          created_by, approved_by, approved_at,
          locked_by, locked_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `, [
        month,
        status,
        workingDaysCount,
        employees.length,
        totalGross,
        totalDeductions,
        totalNet,
        totalWarnings,
        status !== 'Draft',
        adminId,
        status !== 'Draft' ? hrId : null,
        status !== 'Draft' ? new Date() : null,
        status === 'Locked' ? adminId : null,
        status === 'Locked' ? new Date() : null,
      ]);

      const runId = runRes.insertId;

      // Bulk insert payslips
      const psPlaceholders = [];
      const psValues = [];
      for (const ps of computed) {
        psPlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        psValues.push(
          runId, ps.employee_id, month, status,
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
        await executor.query(`
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

      // Map employee_id to payslip id
      const [inserted] = await executor.query(
        'SELECT id, employee_id FROM payslips WHERE payroll_run_id = ?',
        [runId]
      );
      const empToId = new Map();
      inserted.forEach(row => empToId.set(row.employee_id, row.id));

      // Bulk insert line items
      const itemPlaceholders = [];
      const itemValues = [];
      for (const ps of computed) {
        const payslipId = empToId.get(ps.employee_id);
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
        await executor.query(`
          INSERT INTO payslip_items (
            payslip_id, category, type, description,
            amount, rate, quantity, related_entity_type, related_entity_ids
          ) VALUES ${itemPlaceholders.join(', ')}
        `, itemValues);
      }
    }

    await generateMonthRun('2026-10', 'Locked');
    await generateMonthRun('2026-11', 'Draft');
    console.log('[PayrollSeeder] Successfully seeded October (Locked) and November (Draft) runs.');
  } catch (err) {
    console.error('[PayrollSeeder] Error during seedDefaultRuns:', err.message);
  }
}

module.exports = {
  seedDefaultRuns
};
