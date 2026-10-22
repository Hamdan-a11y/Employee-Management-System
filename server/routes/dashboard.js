const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    const [employeeStats] = await pool.query(`
      SELECT 
        COUNT(*) AS totalEmployees,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS activeEmployees,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) AS inactiveEmployees
      FROM employees
      WHERE deleted_at IS NULL
    `);

    const [deptStats] = await pool.query(`
      SELECT COUNT(*) AS totalDepartments FROM departments
    `);

    const [departmentBreakdown] = await pool.query(`
      SELECT 
        d.id, 
        d.name, 
        COUNT(e.id) AS employeeCount
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
      GROUP BY d.id, d.name
      ORDER BY employeeCount DESC
    `);

    const [recentEmployees] = await pool.query(`
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
      WHERE e.deleted_at IS NULL
      ORDER BY e.id DESC
      LIMIT 5
    `);

    // Monthly hiring statistics based on actual employee created_at timestamps
    const [monthlyHiringRows] = await pool.query(`
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

    const stats = {
      totalEmployees: Number(employeeStats[0].totalEmployees) || 0,
      activeEmployees: Number(employeeStats[0].activeEmployees) || 0,
      inactiveEmployees: Number(employeeStats[0].inactiveEmployees) || 0,
      totalDepartments: Number(deptStats[0].totalDepartments) || 0,
      departmentBreakdown,
      recentEmployees,
      monthlyHiringStats
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard statistics.', error: error.message });
  }
});

module.exports = router;
