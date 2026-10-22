/**
 * Shared validation rules and helpers for Employee Management System.
 * Matches backend validation rules exactly.
 */

export const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const PASSWORD_RULES = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (pwd) => typeof pwd === 'string' && pwd.length >= 8,
  },
  {
    id: 'uppercase',
    label: '1 uppercase letter (A-Z)',
    test: (pwd) => /[A-Z]/.test(pwd || ''),
  },
  {
    id: 'lowercase',
    label: '1 lowercase letter (a-z)',
    test: (pwd) => /[a-z]/.test(pwd || ''),
  },
  {
    id: 'number',
    label: '1 number (0-9)',
    test: (pwd) => /[0-9]/.test(pwd || ''),
  },
  {
    id: 'symbol',
    label: '1 symbol (!@#$%^&*)',
    test: (pwd) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd || ''),
  },
];

/**
 * Returns evaluated checklist for each password requirement.
 */
export const getPasswordChecklist = (password = '') => {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    isMet: rule.test(password),
  }));
};

/**
 * Evaluates password strength (Weak, Fair, Strong).
 */
export const calculatePasswordStrength = (password = '') => {
  if (!password) {
    return { level: 'none', label: '', percent: 0, color: 'transparent' };
  }

  const checklist = getPasswordChecklist(password);
  const metCount = checklist.filter((r) => r.isMet).length;
  const isLong = password.length >= 12;

  if (metCount <= 2) {
    return {
      level: 'weak',
      label: 'Weak',
      percent: 33,
      color: 'var(--danger, #ef4444)',
    };
  }

  if (metCount <= 4 || (!isLong && metCount === 5)) {
    return {
      level: 'fair',
      label: 'Fair',
      percent: 66,
      color: '#f59e0b',
    };
  }

  return {
    level: 'strong',
    label: 'Strong',
    percent: 100,
    color: '#10b981',
  };
};

/**
 * Validates password and returns first error message or null.
 */
export const validatePassword = (password = '') => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9).';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character (e.g. !@#$%^&*).';
  }
  return null;
};

/**
 * Validates full name.
 */
export const validateName = (name = '') => {
  if (!name || !name.trim()) {
    return 'Full name is required.';
  }
  if (name.trim().length < 2) {
    return 'Full name must be at least 2 characters.';
  }
  return null;
};

/**
 * Validates email address.
 */
export const validateEmail = (email = '') => {
  if (!email || !email.trim()) {
    return 'Email address is required.';
  }
  if (!emailRegex.test(email.trim())) {
    return 'Please provide a valid email address (e.g. user@company.com).';
  }
  return null;
};
