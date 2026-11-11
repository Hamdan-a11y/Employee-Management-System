import React from 'react';
import {
  Brain,
  Headphones,
  Server,
  Layout,
  Smartphone,
  Cloud,
  ShieldCheck,
  Database,
  CheckCircle2,
  Code2,
  Layers,
  TrendingUp,
  Megaphone,
  Users,
  Palette,
  Compass,
  Wallet,
  Scale,
  Crown,
  BarChart3,
  FlaskConical,
  Truck,
  Boxes,
  ShoppingCart,
  HeartPulse,
  GraduationCap,
  Video,
  FileText,
  Cpu,
  Network,
  Target,
  Radio,
  Wrench,
  Workflow,
  Laptop,
  Building2,
  Sparkles,
  LifeBuoy,
  Briefcase,
} from 'lucide-react';

/**
 * Registry of available department icons.
 */
export const ICON_REGISTRY = {
  brain: Brain,
  headphones: Headphones,
  server: Server,
  layout: Layout,
  smartphone: Smartphone,
  cloud: Cloud,
  shield: ShieldCheck,
  database: Database,
  qa: CheckCircle2,
  code: Code2,
  layers: Layers,
  trending: TrendingUp,
  megaphone: Megaphone,
  users: Users,
  palette: Palette,
  compass: Compass,
  wallet: Wallet,
  scale: Scale,
  crown: Crown,
  analytics: BarChart3,
  flask: FlaskConical,
  truck: Truck,
  boxes: Boxes,
  cart: ShoppingCart,
  heart: HeartPulse,
  education: GraduationCap,
  video: Video,
  file: FileText,
  cpu: Cpu,
  network: Network,
  target: Target,
  radio: Radio,
  wrench: Wrench,
  workflow: Workflow,
  laptop: Laptop,
  building: Building2,
  sparkles: Sparkles,
  lifebuoy: LifeBuoy,
  briefcase: Briefcase,
};

/**
 * 35+ High-Craft Department Definitions in strict specificity order.
 * Specialized keywords (like Artificial Intelligence, Backend, Customer Operations)
 * are prioritized above general keywords (Engineering, Operations, Design).
 */
export const DEPARTMENT_DEFINITIONS = [
  // 1. Artificial Intelligence & Machine Learning
  {
    id: 'ai',
    patterns: [
      /\bai\b/i,
      /artificial\s?intelligence/i,
      /machine\s?learning/i,
      /\bml\b/i,
      /deep\s?learning/i,
      /neural/i,
      /\bnlp\b/i,
      /computer\s?vision/i,
      /\bllm\b/i,
      /generative\s?ai/i,
      /genai/i,
      /data\s?science/i,
      /algorithm/i,
    ],
    icon: Brain,
    label: 'Artificial Intelligence',
    color: '#9333ea', // Purple 600
    bgColor: 'rgba(147, 51, 234, 0.08)',
    borderColor: 'rgba(147, 51, 234, 0.22)',
    barColor: 'linear-gradient(90deg, #9333ea, #c084fc)',
  },

  // 2. Customer Operations, Support & Success
  {
    id: 'customer-ops',
    patterns: [
      /customer/i,
      /client\s?(?:ops|operations|support|success|care|services?)/i,
      /\bsupport\b/i,
      /help\s?desk/i,
      /service\s?desk/i,
      /call\s?center/i,
      /\bcx\b/i,
    ],
    icon: Headphones,
    label: 'Customer Operations',
    color: '#0284c7', // Sky 600
    bgColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.22)',
    barColor: 'linear-gradient(90deg, #0284c7, #38bdf8)',
  },

  // 3. Backend Engineering
  {
    id: 'backend',
    patterns: [
      /backend/i,
      /back[\s-]?end/i,
      /server[\s-]?side/i,
      /\bapi\b/i,
      /microservice/i,
      /distributed\s?system/i,
    ],
    icon: Server,
    label: 'Backend Engineering',
    color: '#4f46e5', // Indigo 600
    bgColor: 'rgba(79, 70, 229, 0.08)',
    borderColor: 'rgba(79, 70, 229, 0.22)',
    barColor: 'linear-gradient(90deg, #4f46e5, #818cf8)',
  },

  // 4. Frontend Engineering
  {
    id: 'frontend',
    patterns: [
      /frontend/i,
      /front[\s-]?end/i,
      /client[\s-]?side/i,
      /web\s?interface/i,
      /ui\s?engineer/i,
      /\breact\b/i,
      /\bvue\b/i,
      /\bangular\b/i,
    ],
    icon: Layout,
    label: 'Frontend Engineering',
    color: '#0ea5e9', // Sky 500
    bgColor: 'rgba(14, 165, 233, 0.08)',
    borderColor: 'rgba(14, 165, 233, 0.22)',
    barColor: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
  },

  // 5. Full Stack Development
  {
    id: 'fullstack',
    patterns: [/full[\s-]?stack/i, /\bmern\b/i, /\bmean\b/i, /web\s?dev(?:elopment)?/i],
    icon: Layers,
    label: 'Full Stack',
    color: '#0891b2', // Cyan 600
    bgColor: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.22)',
    barColor: 'linear-gradient(90deg, #0891b2, #06b6d4)',
  },

  // 6. Mobile Engineering
  {
    id: 'mobile',
    patterns: [
      /mobile/i,
      /\bios\b/i,
      /android/i,
      /flutter/i,
      /react[\s-]?native/i,
      /\bswift\b/i,
      /\bkotlin\b/i,
      /app\s?dev/i,
    ],
    icon: Smartphone,
    label: 'Mobile Engineering',
    color: '#7c3aed', // Violet 600
    bgColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.22)',
    barColor: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
  },

  // 7. Cloud, DevOps & Infrastructure
  {
    id: 'cloud',
    patterns: [
      /cloud/i,
      /\baws\b/i,
      /azure/i,
      /\bgcp\b/i,
      /devops/i,
      /\bsre\b/i,
      /kubernetes/i,
      /docker/i,
      /platform\s?eng/i,
      /infrastructure/i,
      /\binfra\b/i,
    ],
    icon: Cloud,
    label: 'Cloud & DevOps',
    color: '#2563eb', // Blue 600
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    barColor: 'linear-gradient(90deg, #2563eb, #60a5fa)',
  },

  // 8. Cybersecurity & Information Security
  {
    id: 'cybersecurity',
    patterns: [
      /cyber/i,
      /infosec/i,
      /security/i,
      /secops/i,
      /appsec/i,
      /firewall/i,
      /\bsoc\b/i,
      /pen[\s-]?test/i,
    ],
    icon: ShieldCheck,
    label: 'Cybersecurity',
    color: '#e11d48', // Rose 600
    bgColor: 'rgba(225, 29, 72, 0.08)',
    borderColor: 'rgba(225, 29, 72, 0.22)',
    barColor: 'linear-gradient(90deg, #e11d48, #f43f5e)',
  },

  // 9. Database & Storage
  {
    id: 'database',
    patterns: [
      /database/i,
      /\bdb\b/i,
      /\bdba\b/i,
      /\bsql\b/i,
      /\bnosql\b/i,
      /data\s?warehouse/i,
      /data\s?storage/i,
    ],
    icon: Database,
    label: 'Database Administration',
    color: '#d97706', // Amber 600
    bgColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.22)',
    barColor: 'linear-gradient(90deg, #d97706, #f59e0b)',
  },

  // 10. Quality Assurance & Testing
  {
    id: 'qa',
    patterns: [
      /\bqa\b/i,
      /quality\s?assurance/i,
      /test(?:ing|er|s)?\b/i,
      /automation\s?test/i,
      /\bqc\b/i,
    ],
    icon: CheckCircle2,
    label: 'Quality Assurance',
    color: '#059669', // Emerald 600
    bgColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #059669, #10b981)',
  },

  // 11. Hardware, Embedded & IoT
  {
    id: 'hardware',
    patterns: [
      /hardware/i,
      /embedded/i,
      /\biot\b/i,
      /firmware/i,
      /robotics/i,
      /robot/i,
      /electronic/i,
      /circuit/i,
      /\bchip\b/i,
      /semiconductor/i,
    ],
    icon: Cpu,
    label: 'Hardware & Embedded',
    color: '#ea580c', // Orange 600
    bgColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.22)',
    barColor: 'linear-gradient(90deg, #ea580c, #f97316)',
  },

  // 12. Networking & Telecommunications
  {
    id: 'networking',
    patterns: [
      /network/i,
      /telecom/i,
      /networking/i,
      /wifi/i,
      /\blan\b/i,
      /\bwan\b/i,
      /routing/i,
      /switch/i,
    ],
    icon: Network,
    label: 'Networking & Telecom',
    color: '#0891b2', // Cyan 600
    bgColor: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.22)',
    barColor: 'linear-gradient(90deg, #0891b2, #38bdf8)',
  },

  // 13. General Engineering & Software Development
  {
    id: 'engineering',
    patterns: [
      /engineer/i,
      /software/i,
      /developer/i,
      /coding/i,
      /\btech\b/i,
      /technology/i,
    ],
    icon: Code2,
    label: 'Engineering',
    color: '#2563eb', // Blue 600
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    barColor: 'linear-gradient(90deg, #2563eb, #3b82f6)',
  },

  // 14. Sales & Commercial
  {
    id: 'sales',
    patterns: [
      /\bsales?\b/i,
      /revenue/i,
      /commercial/i,
      /biz\s?dev/i,
      /business\s?development/i,
      /account\s?exec/i,
    ],
    icon: TrendingUp,
    label: 'Sales',
    color: '#10b981', // Emerald 500
    bgColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.22)',
    barColor: 'linear-gradient(90deg, #10b981, #34d399)',
  },

  // 15. Marketing & Growth
  {
    id: 'marketing',
    patterns: [
      /market/i,
      /growth/i,
      /brand/i,
      /advertising/i,
      /\bpr\b/i,
      /seo/i,
      /social\s?media/i,
      /campaign/i,
    ],
    icon: Megaphone,
    label: 'Marketing',
    color: '#ea580c', // Orange 600
    bgColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.22)',
    barColor: 'linear-gradient(90deg, #ea580c, #f97316)',
  },

  // 16. Human Resources & People
  {
    id: 'human-resources',
    patterns: [
      /human\s?resource/i,
      /\bhr\b/i,
      /people/i,
      /talent/i,
      /recruiting/i,
      /recruitment/i,
      /culture/i,
      /staffing/i,
    ],
    icon: Users,
    label: 'Human Resources',
    color: '#7c3aed', // Violet 600
    bgColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.22)',
    barColor: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
  },

  // 17. Design, UI/UX & Creative (Note: strictly word-bounded art to never match artificial)
  {
    id: 'design',
    patterns: [
      /design/i,
      /\bui\b/i,
      /\bux\b/i,
      /creative/i,
      /graphic/i,
      /\bart(?:s|work|istic)?\b/i,
      /visual/i,
      /illustration/i,
    ],
    icon: Palette,
    label: 'Design',
    color: '#db2777', // Pink 600
    bgColor: 'rgba(219, 39, 119, 0.08)',
    borderColor: 'rgba(219, 39, 119, 0.22)',
    barColor: 'linear-gradient(90deg, #db2777, #ec4899)',
  },

  // 18. Product Management
  {
    id: 'product',
    patterns: [/\bproducts?\b/i, /product\s?management/i, /\bpm\b/i, /roadmap/i, /feature/i],
    icon: Compass,
    label: 'Product',
    color: '#0891b2', // Cyan 600
    bgColor: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.22)',
    barColor: 'linear-gradient(90deg, #0891b2, #06b6d4)',
  },

  // 19. Finance, Accounting & Payroll
  {
    id: 'finance',
    patterns: [
      /finance/i,
      /account/i,
      /payroll/i,
      /billing/i,
      /audit/i,
      /\btax\b/i,
      /treasury/i,
      /bookkeep/i,
    ],
    icon: Wallet,
    label: 'Finance',
    color: '#0d9488', // Teal 600
    bgColor: 'rgba(13, 148, 136, 0.08)',
    borderColor: 'rgba(13, 148, 136, 0.22)',
    barColor: 'linear-gradient(90deg, #0d9488, #14b8a6)',
  },

  // 20. Legal, Governance & Compliance
  {
    id: 'legal',
    patterns: [
      /legal/i,
      /counsel/i,
      /\blaw\b/i,
      /regulatory/i,
      /compliance/i,
      /ethics/i,
      /governance/i,
      /policy/i,
      /patent/i,
    ],
    icon: Scale,
    label: 'Legal & Compliance',
    color: '#4b5563', // Gray 600
    bgColor: 'rgba(75, 85, 99, 0.08)',
    borderColor: 'rgba(75, 85, 99, 0.22)',
    barColor: 'linear-gradient(90deg, #4b5563, #6b7280)',
  },

  // 21. Executive Leadership & Management
  {
    id: 'leadership',
    patterns: [
      /leadership/i,
      /executive/i,
      /c-suite/i,
      /management/i,
      /director/i,
      /board/i,
      /\bceo\b/i,
      /\bcto\b/i,
      /\bcfo\b/i,
      /\bcoo\b/i,
      /president/i,
    ],
    icon: Crown,
    label: 'Executive Leadership',
    color: '#b45309', // Amber 700
    bgColor: 'rgba(180, 83, 9, 0.08)',
    borderColor: 'rgba(180, 83, 9, 0.22)',
    barColor: 'linear-gradient(90deg, #b45309, #d97706)',
  },

  // 22. Analytics & Business Intelligence
  {
    id: 'analytics',
    patterns: [
      /analytics/i,
      /\bbi\b/i,
      /business\s?intelligence/i,
      /data\s?science/i,
      /statistics/i,
      /metric/i,
      /insights/i,
    ],
    icon: BarChart3,
    label: 'Data & Analytics',
    color: '#6366f1', // Indigo 500
    bgColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.22)',
    barColor: 'linear-gradient(90deg, #6366f1, #818cf8)',
  },

  // 23. Research & Development (R&D)
  {
    id: 'research',
    patterns: [
      /research/i,
      /r&d/i,
      /science/i,
      /\blab\b/i,
      /laboratory/i,
      /innovation/i,
    ],
    icon: FlaskConical,
    label: 'Research & Development',
    color: '#8b5cf6', // Violet 500
    bgColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.22)',
    barColor: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
  },

  // 24. Logistics, Supply Chain & Fleet
  {
    id: 'logistics',
    patterns: [
      /logistics/i,
      /supply[\s-]?chain/i,
      /shipping/i,
      /freight/i,
      /transport/i,
      /dispatch/i,
      /fleet/i,
    ],
    icon: Truck,
    label: 'Logistics & Supply Chain',
    color: '#d97706', // Amber 600
    bgColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.22)',
    barColor: 'linear-gradient(90deg, #d97706, #fbbf24)',
  },

  // 25. Warehouse, Facilities & Inventory
  {
    id: 'facilities',
    patterns: [
      /warehouse/i,
      /inventory/i,
      /storage/i,
      /fulfillment/i,
      /facilities/i,
      /facility/i,
      /real\s?estate/i,
    ],
    icon: Boxes,
    label: 'Facilities & Warehouse',
    color: '#57534e', // Stone 600
    bgColor: 'rgba(87, 83, 78, 0.08)',
    borderColor: 'rgba(87, 83, 78, 0.22)',
    barColor: 'linear-gradient(90deg, #57534e, #78716c)',
  },

  // 26. Procurement & Purchasing
  {
    id: 'procurement',
    patterns: [
      /procurement/i,
      /purchasing/i,
      /sourcing/i,
      /vendor/i,
      /buyer/i,
      /e-?commerce/i,
      /\bshop\b/i,
      /retail/i,
    ],
    icon: ShoppingCart,
    label: 'Procurement',
    color: '#059669', // Emerald 600
    bgColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #059669, #34d399)',
  },

  // 27. Healthcare & Medical
  {
    id: 'healthcare',
    patterns: [
      /health/i,
      /medical/i,
      /clinic/i,
      /wellness/i,
      /pharma/i,
      /\bcare\b/i,
      /hospital/i,
      /nurs/i,
      /doctor/i,
    ],
    icon: HeartPulse,
    label: 'Health & Medical',
    color: '#e11d48', // Rose 600
    bgColor: 'rgba(225, 29, 72, 0.08)',
    borderColor: 'rgba(225, 29, 72, 0.22)',
    barColor: 'linear-gradient(90deg, #e11d48, #fb7185)',
  },

  // 28. Education, Training & Learning
  {
    id: 'education',
    patterns: [
      /education/i,
      /training/i,
      /learn/i,
      /academy/i,
      /curriculum/i,
      /onboarding/i,
      /mentor/i,
      /teach/i,
    ],
    icon: GraduationCap,
    label: 'Learning & Development',
    color: '#2563eb', // Blue 600
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    barColor: 'linear-gradient(90deg, #2563eb, #60a5fa)',
  },

  // 29. Media, Video & Audio Production
  {
    id: 'media',
    patterns: [
      /video/i,
      /audio/i,
      /media/i,
      /broadcast/i,
      /film/i,
      /podcast/i,
      /studio/i,
      /stream/i,
      /sound/i,
    ],
    icon: Video,
    label: 'Media & Production',
    color: '#9333ea', // Purple 600
    bgColor: 'rgba(147, 51, 234, 0.08)',
    borderColor: 'rgba(147, 51, 234, 0.22)',
    barColor: 'linear-gradient(90deg, #9333ea, #d8b4fe)',
  },

  // 30. Content & Documentation
  {
    id: 'content',
    patterns: [
      /content/i,
      /writing/i,
      /writer/i,
      /copywriting/i,
      /editorial/i,
      /documentation/i,
      /\bdocs\b/i,
      /blog/i,
    ],
    icon: FileText,
    label: 'Content & Editorial',
    color: '#0284c7', // Sky 600
    bgColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.22)',
    barColor: 'linear-gradient(90deg, #0284c7, #38bdf8)',
  },

  // 31. Strategy, Planning & Consulting
  {
    id: 'strategy',
    patterns: [
      /strategy/i,
      /strategic/i,
      /planning/i,
      /consulting/i,
      /advisory/i,
      /transformation/i,
      /\bvision\b/i,
    ],
    icon: Target,
    label: 'Strategy & Planning',
    color: '#dc2626', // Red 600
    bgColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.22)',
    barColor: 'linear-gradient(90deg, #dc2626, #f87171)',
  },

  // 32. Public Relations & Communications
  {
    id: 'pr',
    patterns: [
      /public\s?relation/i,
      /press/i,
      /communication/i,
      /spokesperson/i,
      /media\s?relation/i,
    ],
    icon: Radio,
    label: 'Public Relations',
    color: '#ec4899', // Pink 500
    bgColor: 'rgba(236, 72, 153, 0.08)',
    borderColor: 'rgba(236, 72, 153, 0.22)',
    barColor: 'linear-gradient(90deg, #ec4899, #f472b6)',
  },

  // 33. Maintenance & Equipment
  {
    id: 'maintenance',
    patterns: [/maintenance/i, /repair/i, /equipment/i, /tooling/i],
    icon: Wrench,
    label: 'Maintenance',
    color: '#52525b', // Zinc 600
    bgColor: 'rgba(82, 82, 91, 0.08)',
    borderColor: 'rgba(82, 82, 91, 0.22)',
    barColor: 'linear-gradient(90deg, #52525b, #71717a)',
  },

  // 34. IT & Desktop Support
  {
    id: 'it',
    patterns: [
      /\bit\b/i,
      /hardware/i,
      /helpdesk/i,
      /desktop/i,
      /information\s?technology/i,
      /sysadmin/i,
    ],
    icon: Laptop,
    label: 'Information Technology',
    color: '#0369a1', // Blue 700
    bgColor: 'rgba(3, 105, 161, 0.08)',
    borderColor: 'rgba(3, 105, 161, 0.22)',
    barColor: 'linear-gradient(90deg, #0369a1, #0ea5e9)',
  },

  // 35. General Operations & Workflow
  {
    id: 'operations',
    patterns: [/operation/i, /\bops\b/i, /workflow/i, /process/i],
    icon: Workflow,
    label: 'Operations',
    color: '#475569', // Slate 600
    bgColor: 'rgba(71, 85, 105, 0.08)',
    borderColor: 'rgba(71, 85, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #475569, #64748b)',
  },
];

/**
 * Curated color themes for deterministic dynamic fallback generation.
 */
const FALLBACK_PALETTES = [
  {
    color: '#2563eb', // Sapphire
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    barColor: 'linear-gradient(90deg, #2563eb, #3b82f6)',
    icon: Building2,
  },
  {
    color: '#059669', // Emerald
    bgColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.22)',
    barColor: 'linear-gradient(90deg, #059669, #10b981)',
    icon: Sparkles,
  },
  {
    color: '#7c3aed', // Violet
    bgColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.22)',
    barColor: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
    icon: Layers,
  },
  {
    color: '#d97706', // Amber
    bgColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.22)',
    barColor: 'linear-gradient(90deg, #d97706, #f59e0b)',
    icon: Briefcase,
  },
  {
    color: '#0284c7', // Sky
    bgColor: 'rgba(2, 132, 199, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.22)',
    barColor: 'linear-gradient(90deg, #0284c7, #38bdf8)',
    icon: Target,
  },
  {
    color: '#e11d48', // Rose
    bgColor: 'rgba(225, 29, 72, 0.08)',
    borderColor: 'rgba(225, 29, 72, 0.22)',
    barColor: 'linear-gradient(90deg, #e11d48, #f43f5e)',
    icon: Compass,
  },
];

/**
 * Standard default configuration when name is empty or nil.
 */
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
 * Simple deterministic string hashing function.
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Common stopwords to skip when tokenizing department names.
 */
const STOPWORDS = new Set([
  'and',
  'or',
  'of',
  'the',
  '&',
  'in',
  'for',
  'with',
  'department',
  'dept',
  'division',
  'team',
  'unit',
  'group',
  'branch',
  'center',
  'centre',
  'global',
  'regional',
  'corporate',
  'office',
]);

/**
 * Returns the matching department design configuration based on department name.
 * 
 * 1. Checks explicit icon override (if provided)
 * 2. Checks full string against 35+ primary semantic patterns
 * 3. Tokenizes multi-word department name and checks individual keywords
 * 4. Falls back to a deterministic, vibrant palette for novel department names
 *
 * @param {string} departmentName - Name of the department
 * @param {string} [explicitIconKey] - Optional icon key from ICON_REGISTRY
 * @returns {object} Design configuration with icon component and colors.
 */
export function getDepartmentConfig(departmentName, explicitIconKey) {
  if (explicitIconKey && ICON_REGISTRY[explicitIconKey.toLowerCase()]) {
    const CustomIcon = ICON_REGISTRY[explicitIconKey.toLowerCase()];
    // Find matching definition by icon or return tailored config
    const matchingDef = DEPARTMENT_DEFINITIONS.find((d) => d.icon === CustomIcon);
    if (matchingDef) {
      return matchingDef;
    }
    return {
      ...DEFAULT_CONFIG,
      id: `custom-${explicitIconKey}`,
      icon: CustomIcon,
      label: departmentName || 'Custom Department',
    };
  }

  if (!departmentName || typeof departmentName !== 'string') {
    return DEFAULT_CONFIG;
  }

  const trimmed = departmentName.trim();
  if (!trimmed) {
    return DEFAULT_CONFIG;
  }

  // 1. Direct Pattern Match against full department name
  const directMatch = DEPARTMENT_DEFINITIONS.find((def) =>
    def.patterns.some((pattern) => pattern.test(trimmed))
  );

  if (directMatch) {
    return directMatch;
  }

  // 2. Token-level Decomposition
  // Split into individual tokens (e.g., "Global", "AI", "Lab")
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  for (const token of tokens) {
    const tokenMatch = DEPARTMENT_DEFINITIONS.find((def) =>
      def.patterns.some((pattern) => pattern.test(token))
    );
    if (tokenMatch) {
      return tokenMatch;
    }
  }

  // 3. Fallback: Deterministic vibrant theme based on name hash
  const palette = FALLBACK_PALETTES[hashString(trimmed) % FALLBACK_PALETTES.length];
  return {
    id: 'general',
    icon: palette.icon,
    label: trimmed,
    color: palette.color,
    bgColor: palette.bgColor,
    borderColor: palette.borderColor,
    barColor: palette.barColor,
  };
}

/**
 * Premium Department Icon component.
 * Supports:
 * - variant="badge" (default): Styled squircle badge with soft tinted background and crisp icon
 * - variant="plain": Naked icon with curated brand color
 *
 * @param {object} props
 * @param {string} props.name - Department name
 * @param {string} [props.icon] - Optional explicit icon key
 * @param {number} [props.size=15] - Icon size in px
 * @param {'badge'|'plain'} [props.variant='badge'] - Display variant
 * @param {number} [props.badgeSize=28] - Badge dimension in px (variant="badge")
 * @param {string} [props.className] - Additional CSS class name
 * @param {object} [props.style] - Additional inline styles
 */
export function DepartmentIcon({
  name,
  icon,
  size = 15,
  variant = 'badge',
  badgeSize = 28,
  className = '',
  style = {},
}) {
  const config = getDepartmentConfig(name, icon);
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
        transition:
          'transform 150ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 150ms cubic-bezier(0.23, 1, 0.32, 1)',
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
