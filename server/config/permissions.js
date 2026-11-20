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

  // Payroll & Salary Structure
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',
  PAYROLL_APPROVE: 'payroll.approve',
  SALARY_VIEW: 'salary.view',
  SALARY_MANAGE: 'salary.manage',

  // Shift Management
  SHIFT_VIEW: 'shift.view',
  SHIFT_MANAGE: 'shift.manage',
  SHIFT_ASSIGN: 'shift.assign',

  // Geolocation & Offices
  LOCATION_VIEW: 'location.view',
  LOCATION_MANAGE: 'location.manage',
  LOCATION_EXEMPT: 'location.exempt',

  // Holidays & Working Week
  HOLIDAY_VIEW: 'holiday.view',
  HOLIDAY_MANAGE: 'holiday.manage',
  WORKING_WEEK_MANAGE: 'working_week.manage',
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
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.SALARY_VIEW,
    PERMISSIONS.SALARY_MANAGE,
    PERMISSIONS.SHIFT_VIEW,
    PERMISSIONS.SHIFT_MANAGE,
    PERMISSIONS.SHIFT_ASSIGN,
    PERMISSIONS.LOCATION_VIEW,
    PERMISSIONS.LOCATION_MANAGE,
    PERMISSIONS.LOCATION_EXEMPT,
    PERMISSIONS.HOLIDAY_VIEW,
    PERMISSIONS.HOLIDAY_MANAGE,
    PERMISSIONS.WORKING_WEEK_MANAGE,
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
    PERMISSIONS.SHIFT_VIEW,      // Scoped to own department
    PERMISSIONS.SHIFT_ASSIGN,    // Scoped to own department
    PERMISSIONS.LOCATION_VIEW,   // Scoped to own department
    PERMISSIONS.HOLIDAY_VIEW,    // View holidays & team calendar
  ],

  employee: [
    PERMISSIONS.DEPARTMENT_VIEW,
    PERMISSIONS.ATTENDANCE_PUNCH,
    PERMISSIONS.LEAVE_REQUEST,
    PERMISSIONS.SHIFT_VIEW,      // Scoped to own shift
    PERMISSIONS.LOCATION_VIEW,   // Scoped to own check-in locations
    PERMISSIONS.HOLIDAY_VIEW,    // View holidays & personal calendar
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

