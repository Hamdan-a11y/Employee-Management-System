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

