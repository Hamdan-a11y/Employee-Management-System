/**
 * Headcount calculation helpers for Workforce Planning.
 */

/**
 * Calculates headcount status based on approved and current headcount.
 *
 * Rules:
 * - approved = 0 => "Not Set"
 * - gap > 0 => "Needs Hiring"
 * - gap = 0 => "Balanced"
 * - gap < 0 => "Overstaffed - Review"
 *
 * where gap = approved - current.
 *
 * @param {number} approved Approved headcount
 * @param {number} current Active employees count
 * @returns {"Needs Hiring" | "Balanced" | "Overstaffed - Review" | "Not Set"}
 */
function calculateHeadcountStatus(approved, current) {
  const app = Number(approved) || 0;
  const cur = Number(current) || 0;

  if (app === 0) {
    return 'Not Set';
  }

  const gap = app - cur;
  if (gap > 0) {
    return 'Needs Hiring';
  }
  if (gap === 0) {
    return 'Balanced';
  }
  return 'Overstaffed - Review';
}

/**
 * Formats a raw database row into the standardized headcount response object.
 *
 * @param {object} row
 * @returns {{ id: number, name: string, approved: number, current: number, gap: number, status: string }}
 */
function formatHeadcountRow(row) {
  const approved = Number(row.approved ?? row.approved_headcount ?? 0);
  const current = Number(row.current ?? row.current_headcount ?? 0);
  const gap = approved - current;
  const status = calculateHeadcountStatus(approved, current);

  return {
    id: Number(row.id),
    name: String(row.name),
    approved,
    current,
    gap,
    status,
  };
}

/**
 * Calculates attrition rate and status.
 *
 * Rules:
 * - If approved target headcount > 0, base = approved; otherwise base = current active headcount
 * - attritionRate = leavers ÷ base × 100 (return 0 if base is 0)
 * - status:
 *   - under 10% = "Low"
 *   - 10 to 20% = "Medium"
 *   - over 20% = "High"
 *
 * @param {number} leavers Number of leavers in period
 * @param {number} current Current active headcount
 * @param {number} [approved=0] Approved target headcount
 * @returns {{ attritionRate: number, status: "Low" | "Medium" | "High" }}
 */
function calculateAttrition(leavers, current, approved = 0) {
  const l = Number(leavers) || 0;
  const c = Number(current) || 0;
  const a = Number(approved) || 0;

  const base = a > 0 ? a : c;

  if (base <= 0) {
    return {
      attritionRate: 0,
      status: 'Low',
    };
  }

  const rawRate = (l / base) * 100;
  const attritionRate = Math.round(rawRate * 10) / 10;

  let status = 'Low';
  if (attritionRate > 20) {
    status = 'High';
  } else if (attritionRate >= 10) {
    status = 'Medium';
  } else {
    status = 'Low';
  }

  return {
    attritionRate,
    status,
  };
}

/**
 * Formats a raw database row into the standardized attrition response object.
 *
 * @param {object} row
 * @returns {{ id: number, name: string, approved: number, leavers: number, current: number, attritionRate: number, status: string }}
 */
function formatAttritionRow(row) {
  const leavers = Number(row.leavers) || 0;
  const current = Number(row.current) || 0;
  const approved = Number(row.approved ?? row.approved_headcount ?? 0);
  const { attritionRate, status } = calculateAttrition(leavers, current, approved);

  return {
    id: Number(row.id),
    name: String(row.name),
    approved,
    leavers,
    current,
    attritionRate,
    status,
  };
}

/**
 * Calculates overtime percentage and status based on average daily hours and attendance days.
 *
 * Rules:
 * - avgDailyHours = average working hours per attendance day within last X months
 * - If no attendance data (attendanceDays = 0 or avgDailyHours = 0):
 *   avgDailyHours = 0, overtimePercent = 0, status = "No Data"
 * - overtimePercent = (avgDailyHours - 8) ÷ 8 × 100 (0 if negative)
 * - status:
 *   - under 5% = "Normal"
 *   - 5 to 15% = "High"
 *   - over 15% = "Very High"
 *
 * @param {number} avgDailyHours Average daily working hours
 * @param {number} [attendanceDays] Number of valid attendance days
 * @returns {{ avgDailyHours: number, overtimePercent: number, status: "Normal" | "High" | "Very High" | "No Data" }}
 */
function calculateOvertime(avgDailyHours, attendanceDays = 1) {
  const hours = Number(avgDailyHours) || 0;
  const days = attendanceDays !== undefined ? Number(attendanceDays) : 1;

  if (days <= 0 || hours <= 0) {
    return {
      avgDailyHours: 0,
      overtimePercent: 0,
      status: 'No Data',
    };
  }

  const roundedHours = Math.round(hours * 10) / 10;

  if (roundedHours <= 8) {
    return {
      avgDailyHours: roundedHours,
      overtimePercent: 0,
      status: 'Normal',
    };
  }

  const rawOvertime = ((roundedHours - 8) / 8) * 100;
  const overtimePercent = Math.max(0, Math.round(rawOvertime * 10) / 10);

  let status = 'Normal';
  if (overtimePercent > 15) {
    status = 'Very High';
  } else if (overtimePercent >= 5) {
    status = 'High';
  } else {
    status = 'Normal';
  }

  return {
    avgDailyHours: roundedHours,
    overtimePercent,
    status,
  };
}

/**
 * Formats a raw database row into the standardized overtime response object.
 *
 * @param {object} row
 * @returns {{ id: number, name: string, attendanceDays: number, avgDailyHours: number, overtimePercent: number, status: string }}
 */
function formatOvertimeRow(row) {
  const attendanceDays = Number(row.attendance_days) || 0;
  const rawAvg = Number(row.avg_daily_hours) || 0;
  const { avgDailyHours, overtimePercent, status } = calculateOvertime(rawAvg, attendanceDays);

  return {
    id: Number(row.id),
    name: String(row.name),
    attendanceDays,
    avgDailyHours,
    overtimePercent,
    status,
  };
}

/**
 * Calculates leave pressure percentage and status.
 *
 * Rules:
 * - avgOnLeave = average of daily counts of employees on approved leave across working days
 * - leavePressure = avgOnLeave ÷ active headcount × 100 (return 0 if headcount is 0)
 * - status:
 *   - under 5% = "Low"
 *   - 5 to 10% = "Medium"
 *   - over 10% = "High"
 *
 * @param {number} avgOnLeaveOrLeaveDays Average on leave per day, or total leave days if totalWorkDays is supplied
 * @param {number} activeHeadcount Current active headcount
 * @param {number} [totalWorkDays=null] Optional total working days in period
 * @returns {{ avgOnLeave: number, leavePressure: number, status: "Low" | "Medium" | "High" }}
 */
function calculateLeavePressure(avgOnLeaveOrLeaveDays, activeHeadcount, totalWorkDays = null) {
  let avgOnLeave = 0;
  const headcount = Number(activeHeadcount) || 0;

  if (totalWorkDays !== null && totalWorkDays !== undefined) {
    const leaveDays = Number(avgOnLeaveOrLeaveDays) || 0;
    const workDays = Number(totalWorkDays) || 0;
    if (workDays > 0) {
      avgOnLeave = leaveDays / workDays;
    }
  } else {
    avgOnLeave = Number(avgOnLeaveOrLeaveDays) || 0;
  }

  if (headcount <= 0 || avgOnLeave <= 0) {
    return {
      avgOnLeave: Math.round(avgOnLeave * 10) / 10,
      leavePressure: 0,
      status: 'Low',
    };
  }

  const rawPressure = (avgOnLeave / headcount) * 100;
  const leavePressure = Math.round(rawPressure * 10) / 10;
  const roundedAvg = Math.round(avgOnLeave * 10) / 10;

  let status = 'Low';
  if (leavePressure > 10) {
    status = 'High';
  } else if (leavePressure >= 5) {
    status = 'Medium';
  } else {
    status = 'Low';
  }

  return {
    avgOnLeave: roundedAvg,
    leavePressure,
    status,
  };
}

/**
 * Formats a raw database row into the standardized leave pressure response object.
 *
 * @param {object} row
 * @returns {{ id: number, name: string, activeHeadcount: number, totalLeaveDays: number, avgOnLeave: number, leavePressure: number, status: string }}
 */
function formatLeavePressureRow(row) {
  const totalLeaveDays = Number(row.total_leave_days) || 0;
  const totalWorkDays = Number(row.total_work_days) || 0;
  const activeHeadcount = Number(row.active_headcount) || 0;

  const { avgOnLeave, leavePressure, status } = calculateLeavePressure(
    totalLeaveDays,
    activeHeadcount,
    totalWorkDays
  );

  return {
    id: Number(row.id),
    name: String(row.name),
    activeHeadcount,
    totalLeaveDays,
    avgOnLeave,
    leavePressure,
    status,
  };
}

module.exports = {
  calculateHeadcountStatus,
  formatHeadcountRow,
  calculateAttrition,
  formatAttritionRow,
  calculateOvertime,
  formatOvertimeRow,
  calculateLeavePressure,
  formatLeavePressureRow,
};

