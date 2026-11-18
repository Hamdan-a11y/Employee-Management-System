/**
 * Payroll Calculation Engine
 * 
 * Implements:
 * - Working days in month (skipping weekends & holidays)
 * - Daily rate = basic salary / working days
 * - Hourly rate = daily rate / standard daily hours
 * - Proration (joining / termination mid-month)
 * - Unpaid leave deductions
 * - Absence deductions (working days without approved leave)
 * - Late arrival deductions (configurable: e.g. every 3 late arrivals = 1 day deduction)
 * - Overtime calculations (configurable multiplier: e.g. 1.5x)
 * - Adjustments from prior locked months
 * - Net pay = basic + allowances + overtime + adjustments - deductions
 * - Currency PKR, rounded to 2 decimals consistently
 * - Warnings detection
 */

function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Returns formatted date string 'YYYY-MM-DD'
 */
function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns all working days in a given calendar month ('YYYY-MM').
 * Skips weekends (Saturday, Sunday) and dates in the holidaysSet.
 */
function getWorkingDaysInMonth(yearMonth, holidaysSet = new Set()) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1 to 12

  const daysInMonth = new Date(year, month, 0).getDate();
  const workingDates = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat

    // Skip Saturday and Sunday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    const dateStr = formatDate(dateObj);
    // Skip company holidays
    if (holidaysSet.has(dateStr)) {
      continue;
    }

    workingDates.push(dateStr);
  }

  return {
    workingDaysCount: workingDates.length,
    workingDates,
    monthStartDate: `${yearStr}-${monthStr}-01`,
    monthEndDate: `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`,
    totalDaysInMonth: daysInMonth
  };
}

/**
 * Computes proration payable working days between startOfPayablePeriod and endOfPayablePeriod
 */
function getPayableWorkingDays({
  allWorkingDates,
  joiningDate,
  terminationDate,
  monthStartDate,
  monthEndDate
}) {
  const effectiveJoin = joiningDate ? formatDate(new Date(joiningDate)) : monthStartDate;
  const effectiveTerm = terminationDate ? formatDate(new Date(terminationDate)) : null;

  const payableWorkingDates = allWorkingDates.filter((dateStr) => {
    if (effectiveJoin && dateStr < effectiveJoin) {
      return false;
    }
    if (effectiveTerm && dateStr > effectiveTerm) {
      return false;
    }
    return true;
  });

  const isProrated = (
    (effectiveJoin && effectiveJoin > monthStartDate) ||
    (effectiveTerm && effectiveTerm < monthEndDate)
  );

  return {
    payableWorkingDaysCount: payableWorkingDates.length,
    payableWorkingDates,
    isProrated,
    effectiveJoin,
    effectiveTerm
  };
}

/**
 * Core Employee Payslip Calculation
 */
function calculateEmployeePayslip({
  employee,
  salary,
  yearMonth,
  workingDaysData,
  attendanceRecords = [],
  leaveRequests = [],
  pendingAdjustments = [],
  prevMonthPayslip = null,
  settings = {
    late_arrival_threshold: 3,
    late_deduction_days: 1.0,
    overtime_multiplier: 1.5,
    standard_daily_hours: 8.0,
  }
}) {
  const warnings = [];
  const lineItems = [];

  const {
    workingDaysCount,
    workingDates,
    monthStartDate,
    monthEndDate
  } = workingDaysData;

  const basicSalary = salary ? roundToTwo(salary.basic_salary) : 0;
  const allowances = salary ? roundToTwo(salary.allowances) : 0;
  const fixedDeductions = salary ? roundToTwo(salary.fixed_deductions) : 0;

  // Warning check: Employee with no salary set
  if (!salary || basicSalary <= 0) {
    warnings.push({
      type: 'NO_SALARY_SET',
      message: 'No active salary structure configured for this employee.'
    });
  }

  // Warning check: Salary changed more than 20% from last month
  if (prevMonthPayslip && prevMonthPayslip.basic_salary > 0 && basicSalary > 0) {
    const prevBasic = Number(prevMonthPayslip.basic_salary);
    const diffPercent = Math.abs(basicSalary - prevBasic) / prevBasic;
    if (diffPercent > 0.20) {
      const pctFormatted = (diffPercent * 100).toFixed(1);
      const direction = basicSalary > prevBasic ? 'increased' : 'decreased';
      warnings.push({
        type: 'SALARY_VARIANCE',
        message: `Basic salary ${direction} by ${pctFormatted}% compared to previous month (from PKR ${prevBasic.toLocaleString()} to PKR ${basicSalary.toLocaleString()}).`
      });
    }
  }

  // Daily and Hourly rates
  const dailyRate = workingDaysCount > 0 ? roundToTwo(basicSalary / workingDaysCount) : 0;
  const standardHours = Number(settings.standard_daily_hours) || 8.0;
  const hourlyRate = standardHours > 0 ? roundToTwo(dailyRate / standardHours) : 0;

  // Proration Calculation
  const joiningDate = employee.joining_date || employee.created_at;
  const terminationDate = employee.termination_date;

  const {
    payableWorkingDaysCount,
    payableWorkingDates,
    isProrated,
    effectiveJoin,
    effectiveTerm
  } = getPayableWorkingDays({
    allWorkingDates: workingDates,
    joiningDate,
    terminationDate,
    monthStartDate,
    monthEndDate
  });

  let proratedBasic = basicSalary;
  if (isProrated) {
    proratedBasic = roundToTwo(dailyRate * payableWorkingDaysCount);
    lineItems.push({
      category: 'EARNING',
      type: 'BASIC_PRORATED',
      description: `Basic Salary (Prorated: ${payableWorkingDaysCount}/${workingDaysCount} working days, joined ${effectiveJoin || 'N/A'}${effectiveTerm ? `, left ${effectiveTerm}` : ''})`,
      amount: proratedBasic,
      rate: dailyRate,
      quantity: payableWorkingDaysCount,
      related_entity_type: 'SALARY',
      related_entity_ids: [employee.id]
    });
  } else {
    lineItems.push({
      category: 'EARNING',
      type: 'BASIC',
      description: `Basic Salary (${workingDaysCount} working days in month)`,
      amount: basicSalary,
      rate: dailyRate,
      quantity: workingDaysCount,
      related_entity_type: 'SALARY',
      related_entity_ids: [employee.id]
    });
  }

  // Allowances
  if (allowances > 0) {
    lineItems.push({
      category: 'EARNING',
      type: 'ALLOWANCE',
      description: 'Standard Fixed Allowances',
      amount: allowances,
      rate: null,
      quantity: null,
      related_entity_type: 'SALARY',
      related_entity_ids: [employee.id]
    });
  }

  // Attendance & Leave maps
  const attendanceByDate = new Map();
  for (const record of attendanceRecords) {
    const dStr = formatDate(record.date);
    attendanceByDate.set(dStr, record);
  }

  // Approved leave coverage set
  // Map dateStr -> leaveRequest
  const approvedLeavesByDate = new Map();
  const unpaidLeaveDaysSet = new Set();
  const unpaidLeaveRecords = [];

  for (const leave of leaveRequests) {
    if (leave.status !== 'APPROVED') continue;
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    const cur = new Date(start);

    while (cur <= end) {
      const curStr = formatDate(cur);
      approvedLeavesByDate.set(curStr, leave);
      if (leave.leave_type === 'Unpaid') {
        unpaidLeaveDaysSet.add(curStr);
        if (!unpaidLeaveRecords.includes(leave.id)) {
          unpaidLeaveRecords.push(leave.id);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // 1. Unpaid Leave Deduction
  let unpaidWorkingDaysCount = 0;
  for (const dateStr of payableWorkingDates) {
    if (unpaidLeaveDaysSet.has(dateStr)) {
      unpaidWorkingDaysCount++;
    }
  }

  const unpaidLeaveDeduction = roundToTwo(unpaidWorkingDaysCount * dailyRate);
  if (unpaidWorkingDaysCount > 0) {
    lineItems.push({
      category: 'DEDUCTION',
      type: 'UNPAID_LEAVE',
      description: `${unpaidWorkingDaysCount} approved unpaid leave day${unpaidWorkingDaysCount > 1 ? 's' : ''}`,
      amount: unpaidLeaveDeduction,
      rate: dailyRate,
      quantity: unpaidWorkingDaysCount,
      related_entity_type: 'LEAVE_REQUEST',
      related_entity_ids: unpaidLeaveRecords
    });
  }

  // 2. Absences: working days with no attendance punch AND not covered by approved leave
  const absentDates = [];
  const missingAttendanceDates = [];
  const absentAttendanceIds = [];

  for (const dateStr of payableWorkingDates) {
    // If covered by any approved leave, not an unapproved absence
    if (approvedLeavesByDate.has(dateStr)) {
      continue;
    }

    const att = attendanceByDate.get(dateStr);
    if (!att) {
      // Missing attendance on a scheduled working day
      absentDates.push(dateStr);
      missingAttendanceDates.push(dateStr);
    } else if (att.status === 'Absent') {
      absentDates.push(dateStr);
      absentAttendanceIds.push(att.id);
    } else if (!att.check_out && att.status !== 'Present') {
      missingAttendanceDates.push(dateStr);
    }
  }

  const absentDaysCount = absentDates.length;
  const absenceDeduction = roundToTwo(absentDaysCount * dailyRate);
  if (absentDaysCount > 0) {
    lineItems.push({
      category: 'DEDUCTION',
      type: 'ABSENCE',
      description: `${absentDaysCount} unapproved absence${absentDaysCount > 1 ? 's' : ''} on working days`,
      amount: absenceDeduction,
      rate: dailyRate,
      quantity: absentDaysCount,
      related_entity_type: 'ATTENDANCE',
      related_entity_ids: absentAttendanceIds
    });
  }

  // Warning check: Missing attendance data
  if (missingAttendanceDates.length > 0) {
    warnings.push({
      type: 'MISSING_ATTENDANCE',
      message: `Missing attendance data for ${missingAttendanceDates.length} working day(s) (${missingAttendanceDates.slice(0, 3).join(', ')}${missingAttendanceDates.length > 3 ? '...' : ''}).`
    });
  }

  // 3. Late arrivals deduction
  const lateRecords = attendanceRecords.filter((r) => r.is_late || r.status === 'Late');
  const lateArrivalsCount = lateRecords.length;
  const lateThreshold = Number(settings.late_arrival_threshold) || 3;
  const deductionDaysPerBatch = Number(settings.late_deduction_days) || 1.0;

  const lateDeductionBatches = Math.floor(lateArrivalsCount / lateThreshold);
  const lateDeductionDays = lateDeductionBatches * deductionDaysPerBatch;
  const lateDeductionAmount = roundToTwo(lateDeductionDays * dailyRate);

  if (lateArrivalsCount > 0) {
    if (lateDeductionAmount > 0) {
      lineItems.push({
        category: 'DEDUCTION',
        type: 'LATE_ARRIVAL',
        description: `${lateArrivalsCount} late arrivals (${lateDeductionDays} day deduction: rule 1 day per ${lateThreshold} lates)`,
        amount: lateDeductionAmount,
        rate: dailyRate,
        quantity: lateDeductionDays,
        related_entity_type: 'ATTENDANCE',
        related_entity_ids: lateRecords.map((r) => r.id)
      });
    } else {
      lineItems.push({
        category: 'DEDUCTION',
        type: 'LATE_ARRIVAL',
        description: `${lateArrivalsCount} late arrival${lateArrivalsCount > 1 ? 's' : ''} (below ${lateThreshold} deduction threshold: 0 deduction)`,
        amount: 0,
        rate: dailyRate,
        quantity: 0,
        related_entity_type: 'ATTENDANCE',
        related_entity_ids: lateRecords.map((r) => r.id)
      });
    }
  }

  // 4. Overtime calculation
  const overtimeMultiplier = Number(settings.overtime_multiplier) || 1.5;
  let totalOvertimeHours = 0;
  const overtimeAttendanceIds = [];

  for (const record of attendanceRecords) {
    const hrs = Number(record.total_hours) || 0;
    if (hrs > standardHours) {
      const extra = hrs - standardHours;
      totalOvertimeHours += extra;
      overtimeAttendanceIds.push(record.id);
    }
  }

  totalOvertimeHours = Math.round(totalOvertimeHours * 100) / 100;
  const overtimePay = roundToTwo(totalOvertimeHours * hourlyRate * overtimeMultiplier);

  if (totalOvertimeHours > 0) {
    lineItems.push({
      category: 'EARNING',
      type: 'OVERTIME',
      description: `Overtime (${totalOvertimeHours.toFixed(2)} hrs @ ${overtimeMultiplier}x of hourly rate PKR ${hourlyRate.toFixed(2)})`,
      amount: overtimePay,
      rate: roundToTwo(hourlyRate * overtimeMultiplier),
      quantity: totalOvertimeHours,
      related_entity_type: 'ATTENDANCE',
      related_entity_ids: overtimeAttendanceIds
    });
  }

  // 5. Fixed deductions
  if (fixedDeductions > 0) {
    lineItems.push({
      category: 'DEDUCTION',
      type: 'FIXED_DEDUCTION',
      description: 'Standard Fixed Deductions (Provident fund, healthcare, etc.)',
      amount: fixedDeductions,
      rate: null,
      quantity: null,
      related_entity_type: 'SALARY',
      related_entity_ids: [employee.id]
    });
  }

  // 6. Adjustments from previous locked months
  let adjustmentsAmount = 0;
  for (const adj of pendingAdjustments) {
    const adjAmt = roundToTwo(adj.amount);
    adjustmentsAmount = roundToTwo(adjustmentsAmount + adjAmt);

    lineItems.push({
      category: adjAmt >= 0 ? 'ADJUSTMENT' : 'DEDUCTION',
      type: 'ADJUSTMENT',
      description: `Adjustment [${adj.source_month}]: ${adj.reason}`,
      amount: Math.abs(adjAmt),
      rate: null,
      quantity: null,
      related_entity_type: adj.type || 'ATTENDANCE_CORRECTION',
      related_entity_ids: adj.reference_id ? [adj.reference_id] : []
    });
  }

  // Summary totals
  const grossPay = roundToTwo(proratedBasic + allowances + overtimePay);
  const totalDeductions = roundToTwo(
    fixedDeductions +
    unpaidLeaveDeduction +
    absenceDeduction +
    lateDeductionAmount
  );
  const netPay = roundToTwo(grossPay - totalDeductions + adjustmentsAmount);

  // Warning check: Negative or zero net pay
  if (netPay <= 0) {
    warnings.push({
      type: 'NEGATIVE_OR_ZERO_NET_PAY',
      message: `Negative or zero net pay calculated: PKR ${netPay.toLocaleString()} (Gross: PKR ${grossPay.toLocaleString()}, Deductions: PKR ${totalDeductions.toLocaleString()}).`
    });
  }

  return {
    employee_id: employee.id,
    month: yearMonth,
    basic_salary: basicSalary,
    daily_rate: dailyRate,
    hourly_rate: hourlyRate,
    working_days_in_month: workingDaysCount,
    payable_days: payableWorkingDaysCount,
    prorated_basic: proratedBasic,
    allowances,
    overtime_hours: totalOvertimeHours,
    overtime_multiplier: overtimeMultiplier,
    overtime_pay: overtimePay,
    fixed_deductions: fixedDeductions,
    unpaid_leave_days: unpaidWorkingDaysCount,
    unpaid_leave_deduction: unpaidLeaveDeduction,
    absent_days: absentDaysCount,
    absence_deduction: absenceDeduction,
    late_arrivals_count: lateArrivalsCount,
    late_deduction_days: lateDeductionDays,
    late_deduction_amount: lateDeductionAmount,
    adjustments_amount: adjustmentsAmount,
    gross_pay: grossPay,
    total_deductions: totalDeductions,
    net_pay: netPay,
    warnings,
    lineItems
  };
}

module.exports = {
  roundToTwo,
  formatDate,
  getWorkingDaysInMonth,
  getPayableWorkingDays,
  calculateEmployeePayslip
};
