/**
 * Headcount status calculation and styling metadata for Frontend Workforce Planning.
 *
 * Rules:
 * - approved = 0 => "Not Set"
 * - gap > 0 => "Needs Hiring"
 * - gap = 0 => "Balanced"
 * - gap < 0 => "Overstaffed - Review"
 *
 * where gap = approved - current.
 */

export function calculateHeadcountStatus(approved, current) {
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

export const STATUS_META = {
  'Needs Hiring': {
    label: 'Needs Hiring',
    className: 'badge-needs-hiring',
    badgeVariant: 'warning',
    description: 'Active staff is below approved headcount target.',
  },
  Balanced: {
    label: 'Balanced',
    className: 'badge-balanced',
    badgeVariant: 'success',
    description: 'Active staff exactly matches approved headcount target.',
  },
  'Overstaffed - Review': {
    label: 'Overstaffed - Review',
    className: 'badge-overstaffed',
    badgeVariant: 'danger',
    description: 'Active staff exceeds approved headcount target.',
  },
  'Not Set': {
    label: 'Not Set',
    className: 'badge-not-set',
    badgeVariant: 'neutral',
    description: 'Approved headcount has not yet been established (0).',
  },
};

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
export function calculateAttrition(leavers, current, approved = 0) {
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

export const ATTRITION_STATUS_META = {
  Low: {
    label: 'Low',
    className: 'attrition-status-low',
    color: '#059669',
    description: 'Attrition rate is below 10%',
  },
  Medium: {
    label: 'Medium',
    className: 'attrition-status-medium',
    color: '#d97706',
    description: 'Attrition rate is between 10% and 20%',
  },
  High: {
    label: 'High',
    className: 'attrition-status-high',
    color: '#dc2626',
    description: 'Attrition rate exceeds 20%',
  },
};

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
export function calculateOvertime(avgDailyHours, attendanceDays = 1) {
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

export const OVERTIME_STATUS_META = {
  Normal: {
    label: 'Normal',
    className: 'overtime-status-normal',
    color: '#059669',
    description: 'Overtime is under 5%',
  },
  High: {
    label: 'High',
    className: 'overtime-status-high',
    color: '#d97706',
    description: 'Overtime is between 5% and 15%',
  },
  'Very High': {
    label: 'Very High',
    className: 'overtime-status-very-high',
    color: '#dc2626',
    description: 'Overtime exceeds 15%',
  },
  'No Data': {
    label: 'No Data',
    className: 'overtime-status-no-data',
    color: '#64748b',
    description: 'No attendance records in period',
  },
};

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
 * @param {number} avgOnLeaveOrLeaveDays
 * @param {number} activeHeadcount
 * @param {number} [totalWorkDays=null]
 * @returns {{ avgOnLeave: number, leavePressure: number, status: "Low" | "Medium" | "High" }}
 */
export function calculateLeavePressure(avgOnLeaveOrLeaveDays, activeHeadcount, totalWorkDays = null) {
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

export const LEAVE_PRESSURE_STATUS_META = {
  Low: {
    label: 'Low',
    className: 'leave-pressure-status-low',
    color: '#059669',
    description: 'Leave pressure is under 5%',
  },
  Medium: {
    label: 'Medium',
    className: 'leave-pressure-status-medium',
    color: '#d97706',
    description: 'Leave pressure is between 5% and 10%',
  },
  High: {
    label: 'High',
    className: 'leave-pressure-status-high',
    color: '#dc2626',
    description: 'Leave pressure exceeds 10%',
  },
};




