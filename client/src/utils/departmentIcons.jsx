import React from 'react';
import {
  Code2,
  Layers,
  ShieldCheck,
  Database,
  TrendingUp,
  Megaphone,
  Users,
  Palette,
  Compass,
  Wallet,
  Workflow,
  Headphones,
  CheckCircle2,
  Server,
  Laptop,
  Scale,
  Crown,
  BarChart3,
  FlaskConical,
  Building2,
} from 'lucide-react';

/**
 * Premium department metadata mapping.
 * Each department receives:
 * - A tailored, high-craft Lucide icon
 * - Refined primary accent color
 * - Soft tinted background
 * - Delicate border tint
 * - Custom progress bar gradient
 */
const DEPARTMENT_DEFINITIONS = [
  // 1. Cybersecurity & Security
  {
    id: 'cybersecurity',
    patterns: [/cyber/i, /infosec/i, /security/i, /secops/i, /appsec/i],
    icon: ShieldCheck,
    label: 'Cybersecurity',
    color: '#e11d48', // Rose 600
    bgColor: 'rgba(225, 29, 72, 0.08)',
    borderColor: 'rgba(225, 29, 72, 0.22)',
    barColor: 'linear-gradient(90deg, #e11d48, #f43f5e)',
  },
  // 2. Full Stack
  {
    id: 'fullstack',
    patterns: [/full[\s-]?stack/i, /\bmern\b/i, /\bmean\b/i, /web\s?dev(?:elopment)?/i],
    icon: Layers,
    label: 'Full Stack',
    color: '#0284c7', // Sky 600
    bgColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.22)',
    barColor: 'linear-gradient(90deg, #0284c7, #38bdf8)',
  },
  // 3. Database & Data Storage (placed before general engineering)
  {
    id: 'database',
    patterns: [/database/i, /\bdb\b/i, /\bdba\b/i, /\bsql\b/i, /\bnosql\b/i, /data\s?warehouse/i, /storage/i],
    icon: Database,
    label: 'Database',
    color: '#d97706', // Amber 600
    bgColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.22)',
    barColor: 'linear-gradient(90deg, #d97706, #f59e0b)',
  },
  // 4. Quality Assurance & Testing
  {
    id: 'qa',
    patterns: [/\bqa\b/i, /quality\s?assurance/i, /test(?:ing|er)?\b/i, /automation\s?test/i],
    icon: CheckCircle2,
    label: 'Quality Assurance',
    color: '#059669', // Emerald 600
    bgColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #059669, #10b981)',
  },
  // 5. DevOps, Cloud & Infrastructure
  {
    id: 'devops',
    patterns: [/devops/i, /cloud/i, /infrastructure/i, /\binfra\b/i, /\bsre\b/i, /sysadmin/i, /platform/i],
    icon: Server,
    label: 'DevOps & Cloud',
    color: '#4f46e5', // Indigo 600
    bgColor: 'rgba(79, 70, 229, 0.08)',
    borderColor: 'rgba(79, 70, 229, 0.22)',
    barColor: 'linear-gradient(90deg, #4f46e5, #6366f1)',
  },
  // 6. Engineering & Software Development
  {
    id: 'engineering',
    patterns: [/engineer/i, /software/i, /developer/i, /frontend/i, /backend/i, /coding/i, /tech(?:nology)?\b/i],
    icon: Code2,
    label: 'Engineering',
    color: '#2563eb', // Blue 600
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    barColor: 'linear-gradient(90deg, #2563eb, #3b82f6)',
  },
  // 7. Sales & Business Development
  {
    id: 'sales',
    patterns: [/sale/i, /revenue/i, /commercial/i, /biz\s?dev/i, /account\s?exec/i],
    icon: TrendingUp,
    label: 'Sales',
    color: '#10b981', // Emerald 500
    bgColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.22)',
    barColor: 'linear-gradient(90deg, #10b981, #34d399)',
  },
  // 8. Marketing & Growth
  {
    id: 'marketing',
    patterns: [/market/i, /growth/i, /brand/i, /advertising/i, /\bpr\b/i, /content/i, /seo/i],
    icon: Megaphone,
    label: 'Marketing',
    color: '#ea580c', // Orange 600
    bgColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.22)',
    barColor: 'linear-gradient(90deg, #ea580c, #f97316)',
  },
  // 9. Human Resources & People
  {
    id: 'human-resources',
    patterns: [/human\s?resource/i, /\bhr\b/i, /people/i, /talent/i, /recruiting/i, /recruitment/i, /culture/i],
    icon: Users,
    label: 'Human Resources',
    color: '#7c3aed', // Violet 600
    bgColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.22)',
    barColor: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
  },
  // 10. Design & Creative
  {
    id: 'design',
    patterns: [/design/i, /\bui\b/i, /\bux\b/i, /creative/i, /graphic/i, /art/i],
    icon: Palette,
    label: 'Design',
    color: '#db2777', // Pink 600
    bgColor: 'rgba(219, 39, 119, 0.08)',
    borderColor: 'rgba(219, 39, 119, 0.22)',
    barColor: 'linear-gradient(90deg, #db2777, #ec4899)',
  },
  // 11. Product Management
  {
    id: 'product',
    patterns: [/product/i, /\bpm\b/i, /roadmap/i],
    icon: Compass,
    label: 'Product',
    color: '#0891b2', // Cyan 600
    bgColor: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.22)',
    barColor: 'linear-gradient(90deg, #0891b2, #06b6d4)',
  },
  // 12. Finance & Accounting
  {
    id: 'finance',
    patterns: [/finance/i, /account/i, /payroll/i, /billing/i, /audit/i, /tax/i],
    icon: Wallet,
    label: 'Finance',
    color: '#0d9488', // Teal 600
    bgColor: 'rgba(13, 148, 136, 0.08)',
    borderColor: 'rgba(13, 148, 136, 0.22)',
    barColor: 'linear-gradient(90deg, #0d9488, #14b8a6)',
  },
  // 13. Operations & Logistics
  {
    id: 'operations',
    patterns: [/operation/i, /\bops\b/i, /logistics/i, /supply/i, /facility/i],
    icon: Workflow,
    label: 'Operations',
    color: '#475569', // Slate 600
    bgColor: 'rgba(71, 85, 105, 0.08)',
    borderColor: 'rgba(71, 85, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #475569, #64748b)',
  },
  // 14. Customer Support & Success
  {
    id: 'support',
    patterns: [/support/i, /customer\s?service/i, /customer\s?success/i, /help\s?desk/i, /client/i],
    icon: Headphones,
    label: 'Customer Support',
    color: '#0284c7', // Sky 600
    bgColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.22)',
    barColor: 'linear-gradient(90deg, #0284c7, #38bdf8)',
  },
  // 15. IT & Hardware Support
  {
    id: 'it',
    patterns: [/\bit\b/i, /hardware/i, /helpdesk/i, /desktop/i],
    icon: Laptop,
    label: 'Information Technology',
    color: '#0369a1', // Blue 700
    bgColor: 'rgba(3, 105, 161, 0.08)',
    borderColor: 'rgba(3, 105, 161, 0.22)',
    barColor: 'linear-gradient(90deg, #0369a1, #0ea5e9)',
  },
  // 16. Legal & Compliance
  {
    id: 'legal',
    patterns: [/legal/i, /counsel/i, /law/i, /regulatory/i, /compliance/i],
    icon: Scale,
    label: 'Legal & Compliance',
    color: '#4b5563', // Gray 600
    bgColor: 'rgba(75, 85, 99, 0.08)',
    borderColor: 'rgba(75, 85, 99, 0.22)',
    barColor: 'linear-gradient(90deg, #4b5563, #6b7280)',
  },
  // 17. Executive Leadership & Management
  {
    id: 'leadership',
    patterns: [/leadership/i, /executive/i, /c-suite/i, /management/i, /director/i],
    icon: Crown,
    label: 'Executive Leadership',
    color: '#b45309', // Amber 700
    bgColor: 'rgba(180, 83, 9, 0.08)',
    borderColor: 'rgba(180, 83, 9, 0.22)',
    barColor: 'linear-gradient(90deg, #b45309, #d97706)',
  },
  // 18. Analytics & Business Intelligence
  {
    id: 'analytics',
    patterns: [/analytics/i, /\bbi\b/i, /business intelligence/i, /data science/i],
    icon: BarChart3,
    label: 'Data & Analytics',
    color: '#6366f1', // Indigo 500
    bgColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.22)',
    barColor: 'linear-gradient(90deg, #6366f1, #818cf8)',
  },
  // 19. Research & Development
  {
    id: 'research',
    patterns: [/research/i, /r&d/i, /science/i, /lab/i],
    icon: FlaskConical,
    label: 'Research & Development',
    color: '#8b5cf6', // Violet 500
    bgColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.22)',
    barColor: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
  },
];

const DEFAULT_CONFIG = {
  id: 'general',
  icon: Building2,
  label: 'Department',
  color: '#475569',
  bgColor: 'rgba(71, 85, 105, 0.08)',
  borderColor: 'rgba(71, 85, 105, 0.2)',
  barColor: 'linear-gradient(90deg, #334155, #64748b)',
};

/**
 * Returns the matching department design configuration based on department name.
 *
 * @param {string} departmentName
 * @returns {object} Design configuration with icon component and colors.
 */
export function getDepartmentConfig(departmentName) {
  if (!departmentName || typeof departmentName !== 'string') {
    return DEFAULT_CONFIG;
  }

  const trimmed = departmentName.trim();
  const match = DEPARTMENT_DEFINITIONS.find((def) =>
    def.patterns.some((pattern) => pattern.test(trimmed))
  );

  return match || DEFAULT_CONFIG;
}

/**
 * Premium Department Icon component.
 * Supports:
 * - variant="badge" (default): Styled squircle badge with soft tinted background and crisp icon
 * - variant="plain": Naked icon with curated brand color
 *
 * @param {object} props
 * @param {string} props.name - Department name
 * @param {number} [props.size=15] - Icon size in px
 * @param {'badge'|'plain'} [props.variant='badge'] - Display variant
 * @param {number} [props.badgeSize=28] - Badge dimension in px (variant="badge")
 * @param {string} [props.className] - Additional CSS class name
 */
export function DepartmentIcon({
  name,
  size = 15,
  variant = 'badge',
  badgeSize = 28,
  className = '',
  style = {},
}) {
  const config = getDepartmentConfig(name);
  const IconComponent = config.icon;

  if (variant === 'plain') {
    return (
      <IconComponent
        size={size}
        color={config.color}
        strokeWidth={2.2}
        className={`dept-plain-icon ${className}`}
        style={style}
      />
    );
  }

  return (
    <div
      className={`dept-icon-badge ${className}`}
      style={{
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
        minWidth: `${badgeSize}px`,
        minHeight: `${badgeSize}px`,
        borderRadius: '7px',
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
        color: config.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 150ms cubic-bezier(0.23, 1, 0.32, 1)',
        ...style,
      }}
      aria-label={`${name || 'Department'} icon`}
      title={name || 'Department'}
    >
      <IconComponent size={size} strokeWidth={2.2} />
    </div>
  );
}

export default DepartmentIcon;
