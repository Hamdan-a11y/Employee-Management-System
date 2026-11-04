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
function calculateAttrition(leavers, current) {
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

/**
 * Formats a raw database row into the standardized attrition response object.
 *
 * @param {object} row
 * @returns {{ id: number, name: string, leavers: number, current: number, attritionRate: number, status: string }}
 */
function formatAttritionRow(row) {
  const leavers = Number(row.leavers) || 0;
  const current = Number(row.current) || 0;
  const { attritionRate, status } = calculateAttrition(leavers, current);

  return {
    id: Number(row.id),
    name: String(row.name),
    leavers,
    current,
    attritionRate,
    status,
  };
}

module.exports = {
  calculateHeadcountStatus,
  formatHeadcountRow,
  calculateAttrition,
  formatAttritionRow,
};

