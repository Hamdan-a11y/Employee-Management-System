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

module.exports = {
  calculateHeadcountStatus,
  formatHeadcountRow,
};

