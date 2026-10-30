/**
 * RBAC Permissions Matrix
 */
const PERMISSIONS = {
  // Employees
  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_CREATE: 'employee.create',
  EMPLOYEE_UPDATE: 'employee.update',
  EMPLOYEE_DELETE: 'employee.delete',
  EMPLOYEE_EXPORT: 'employee.export',

  // Departments
  DEPARTMENT_VIEW: 'department.view',
  DEPARTMENT_MANAGE: 'department.manage',

  // Attendance
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_PUNCH: 'attendance.punch',
  ATTENDANCE_MANAGE: 'attendance.manage',

  // Leaves
  LEAVE_VIEW: 'leave.view',
  LEAVE_REQUEST: 'leave.request',
  LEAVE_MANAGE: 'leave.manage',

  // Audit Logs
  AUDIT_VIEW: 'audit.view',
};

const ROLE_PERMISSIONS = {
  admin: Object.values(PERMISSIONS),

  hr_manager: [
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_CREATE,
    PERMISSIONS.EMPLOYEE_UPDATE,
    PERMISSIONS.EMPLOYEE_EXPORT,
    PERMISSIONS.DEPARTMENT_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_PUNCH,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_REQUEST,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],

  department_manager: [
    PERMISSIONS.EMPLOYEE_VIEW,   // Scoped to own department
    PERMISSIONS.EMPLOYEE_UPDATE, // Scoped to own department
    PERMISSIONS.DEPARTMENT_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW, // Scoped to own department
    PERMISSIONS.ATTENDANCE_PUNCH,
    PERMISSIONS.ATTENDANCE_MANAGE, // Scoped to own department
    PERMISSIONS.LEAVE_VIEW,      // Scoped to own department
    PERMISSIONS.LEAVE_REQUEST,
    PERMISSIONS.LEAVE_MANAGE,    // Scoped to own department
  ],

  employee: [
    PERMISSIONS.DEPARTMENT_VIEW,
    PERMISSIONS.ATTENDANCE_PUNCH,
    PERMISSIONS.LEAVE_REQUEST,
  ],
};

function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.employee;
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
};

