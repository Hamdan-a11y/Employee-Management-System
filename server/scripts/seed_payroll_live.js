const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../db');
const { getWorkingDaysInMonth, calculateEmployeePayslip, roundToTwo, formatDate } = require('../services/payrollCalculator');

async function seedLivePayroll() {
  console.log('Seeding Live Payroll Data for October 2026 and November 2026...');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Ensure Holidays exist
    const sampleHolidays = [
      ['Iqbal Day', '2026-11-09'],
      ['Quaid-e-Azam Day', '2026-12-25'],
    ];
    for (const [name, date] of sampleHolidays) {
      await conn.query('INSERT IGNORE INTO holidays (name, date) VALUES (?, ?)', [name, date]);
    }

    const [holidayRows] = await conn.query('SELECT date FROM holidays');
    const holidaysSet = new Set(holidayRows.map(h => formatDate(h.date)));

    // 2. Fetch Active Employees
    const [employees] = await conn.query(`
      SELECT id, name, email, designation, department_id, created_at, joining_date, termination_date
      FROM employees
      WHERE status = 'Active' AND deleted_at IS NULL
      ORDER BY id ASC
    `);

    console.log(`Found ${employees.length} active employees.`);

    // 3. Ensure all active employees have salaries
    for (const emp of employees) {
      const [sal] = await conn.query('SELECT id FROM employee_salaries WHERE employee_id = ?', [emp.id]);
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

        await conn.query(`
          INSERT INTO employee_salaries (employee_id, basic_salary, allowances, fixed_deductions, effective_date)
          VALUES (?, ?, ?, ?, '2026-01-01')
        `, [emp.id, basic, allowances, fixedDeductions]);
      }
    }

    const [salaries] = await conn.query('SELECT * FROM employee_salaries');
    const salMap = new Map();
    salaries.forEach(s => salMap.set(s.employee_id, s));

    // Admin user id
    const [adminUsers] = await conn.query('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    const adminId = adminUsers[0]?.id || 1;
    const [hrUsers] = await conn.query('SELECT id FROM users WHERE role = "hr_manager" LIMIT 1');
    const hrId = hrUsers[0]?.id || 3;

    // Helper to generate a run
    async function createRun(month, status) {
      await conn.query('DELETE FROM payroll_runs WHERE month = ?', [month]);

      const workingDaysData = getWorkingDaysInMonth(month, holidaysSet);
      const { workingDaysCount, monthStartDate, monthEndDate } = workingDaysData;

      // Fetch attendance & leaves
      const [attendance] = await conn.query(`
        SELECT id, employee_id, date, check_in, check_out, total_hours, is_late, late_minutes, status
        FROM attendance WHERE date >= ? AND date <= ?
      `, [monthStartDate, monthEndDate]);

      const attByEmp = new Map();
      attendance.forEach(a => {
        if (!attByEmp.has(a.employee_id)) attByEmp.set(a.employee_id, []);
        attByEmp.get(a.employee_id).push(a);
      });

      const [leaves] = await conn.query(`
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

      const [runRes] = await conn.query(`
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

      for (const ps of computed) {
        const [psRes] = await conn.query(`
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
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?
          )
        `, [
          runId, ps.employee_id, month, status,
          ps.basic_salary, ps.daily_rate, ps.hourly_rate,
          ps.working_days_in_month, ps.payable_days, ps.prorated_basic,
          ps.allowances, ps.overtime_hours, ps.overtime_multiplier, ps.overtime_pay,
          ps.fixed_deductions, ps.unpaid_leave_days, ps.unpaid_leave_deduction,
          ps.absent_days, ps.absence_deduction,
          ps.late_arrivals_count, ps.late_deduction_days, ps.late_deduction_amount,
          ps.adjustments_amount, ps.gross_pay, ps.total_deductions, ps.net_pay,
          JSON.stringify(ps.warnings)
        ]);

        const payslipId = psRes.insertId;

        for (const item of ps.lineItems) {
          await conn.query(`
            INSERT INTO payslip_items (
              payslip_id, category, type, description,
              amount, rate, quantity, related_entity_type, related_entity_ids
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            payslipId, item.category, item.type, item.description,
            item.amount, item.rate, item.quantity,
            item.related_entity_type || null,
            item.related_entity_ids ? JSON.stringify(item.related_entity_ids) : null
          ]);
        }
      }

      console.log(`Generated run for ${month} with status [${status}], ${employees.length} payslips, Net PKR ${totalNet.toLocaleString()}`);
    }

    // Generate October 2026 as Locked (released past payslips)
    await createRun('2026-10', 'Locked');

    // Generate November 2026 as Draft (current active review run)
    await createRun('2026-11', 'Draft');

    await conn.commit();
    console.log('Successfully seeded live payroll runs!');
  } catch (err) {
    await conn.rollback();
    console.error('Error seeding payroll data:', err);
    throw err;
  } finally {
    conn.release();
  }
}

seedLivePayroll().then(() => process.exit(0)).catch(() => process.exit(1));
