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
 * - attritionRate = leavers ÷ current active headcount × 100 (return 0 if headcount is 0)
 * - status:
 *   - under 10% = "Low"
 *   - 10 to 20% = "Medium"
 *   - over 20% = "High"
 *
 * @param {number} leavers Number of leavers in period
 * @param {number} current Current active headcount
 * @returns {{ attritionRate: number, status: "Low" | "Medium" | "High" }}
 */
export function calculateAttrition(leavers, current) {
  const l = Number(leavers) || 0;
  const c = Number(current) || 0;

  if (c <= 0) {
    return {
      attritionRate: 0,
      status: 'Low',
    };
  }

  const rawRate = (l / c) * 100;
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


