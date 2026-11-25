const pool = require('../db');
const cacheHelper = require('./cacheHelper');

/**
 * Fetch and aggregate dashboard statistics with Redis caching (TTL 60s).
 * Cache key includes user role, department scoping, and date filters.
 * Gracefully falls back to database if Redis is offline or down.
 */
async function getDashboardStats({ user = {}, filters = {}, forceDb = false, connection = null } = {}) {
  const executor = connection || pool;
  const role = user.role || 'all';
  const departmentId = role === 'department_manager' ? user.department_id : (filters.department_id || null);
  const date = filters.date || new Date().toISOString().split('T')[0];

  const cacheKey = cacheHelper.getDashboardKey({ role, departmentId, date });

  // 1. Check cache unless forced to DB
  if (!forceDb) {
    const cached = await cacheHelper.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }
  }

  // 2. Fetch fresh stats from database
  let empWhere = ' WHERE deleted_at IS NULL';
  const empParams = [];
  if (departmentId && departmentId !== 'all') {
    empWhere += ' AND department_id = ?';
    empParams.push(departmentId);
  }

  const [employeeStats] = await executor.query(`
    SELECT 
      COUNT(*) AS totalEmployees,
      SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeEmployees,
      SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactiveEmployees
    FROM employees
    ${empWhere}
  `, empParams);

  const [deptStats] = await executor.query(`
    SELECT COUNT(*) AS totalDepartments FROM departments
  `);

  const [departmentBreakdown] = await executor.query(`
    SELECT 
      d.id, 
      d.name, 
      COUNT(e.id) AS employeeCount
    FROM departments d
    LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
    GROUP BY d.id, d.name
    ORDER BY employeeCount DESC
  `);

  const [recentEmployees] = await executor.query(`
    SELECT 
      e.id, 
      e.name, 
      e.email, 
      d.name AS department_name, 
      e.designation, 
      e.status,
      e.created_at
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    ${empWhere}
    ORDER BY e.id DESC
    LIMIT 5
  `, empParams);

  // Today/Date attendance metrics
  let attWhere = ' WHERE a.date = ?';
  const attParams = [date];
  if (departmentId && departmentId !== 'all') {
    attWhere += ' AND e.department_id = ?';
    attParams.push(departmentId);
  }

  const [attMetrics] = await executor.query(`
    SELECT 
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS todayPresent,
      SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS todayLate,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS todayAbsent,
      SUM(CASE WHEN a.is_missing_checkout = 1 THEN 1 ELSE 0 END) AS todayMissingCheckout
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    ${attWhere}
  `, attParams);

  // Monthly hiring statistics based on actual employee created_at timestamps
  const [monthlyHiringRows] = await executor.query(`
    SELECT 
      YEAR(created_at) AS hireYear,
      MONTH(created_at) AS hireMonth,
      COUNT(*) AS count
    FROM employees
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      AND deleted_at IS NULL
    GROUP BY hireYear, hireMonth
    ORDER BY hireYear ASC, hireMonth ASC
  `);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const monthlyHiringStats = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const monthLabel = `${monthNames[m - 1]} ${y}`;
    const found = monthlyHiringRows.find(
      (row) => Number(row.hireYear) === y && Number(row.hireMonth) === m
    );

    monthlyHiringStats.push({
      year: y,
      month: m,
      monthLabel,
      count: found ? Number(found.count) : 0
    });
  }

  const result = {
    totalEmployees: Number(employeeStats[0]?.totalEmployees || 0),
    activeEmployees: Number(employeeStats[0]?.activeEmployees || 0),
    inactiveEmployees: Number(employeeStats[0]?.inactiveEmployees || 0),
    totalDepartments: Number(deptStats[0]?.totalDepartments || 0),
    todayPresent: Number(attMetrics[0]?.todayPresent || 0),
    todayLate: Number(attMetrics[0]?.todayLate || 0),
    todayAbsent: Number(attMetrics[0]?.todayAbsent || 0),
    todayMissingCheckout: Number(attMetrics[0]?.todayMissingCheckout || 0),
    departmentBreakdown,
    recentEmployees,
    monthlyHiringStats
  };

  // 3. Store in cache (TTL 60s)
  await cacheHelper.set(cacheKey, result, 60);

  return result;
}

/**
 * Invalidate all cached dashboard metrics.
 * Called on attendance writes (check-in, check-out, corrections, overtime approvals).
 */
async function invalidateDashboardCache() {
  await cacheHelper.invalidatePattern('dashboard:stats:*');
}

module.exports = {
  getDashboardStats,
  invalidateDashboardCache
};
