const pool = require('../db');
const { getDayType, getWorkingDays, formatDate, isMonthLocked } = require('./calendarService');

/**
 * Normalizes start and end month strings ('YYYY-MM') into full dates ('YYYY-MM-DD').
 */
function resolveDateRange(startMonth, endMonth) {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const startM = startMonth ? String(startMonth).slice(0, 7) : currentMonthStr;
  const endM = endMonth ? String(endMonth).slice(0, 7) : startM;

  const [startY, startMM] = startM.split('-').map(Number);
  const [endY, endMM] = endM.split('-').map(Number);

  const startDate = `${startY}-${String(startMM).padStart(2, '0')}-01`;
  const lastDay = new Date(endY, endMM, 0).getDate();
  const endDate = `${endY}-${String(endMM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate, startMonth: startM, endMonth: endM };
}

/**
 * 1. Department Attendance %
 * Formula: present days / expected working days (exclude holidays, weekends, approved leave)
 * Uses aggregated queries (no N+1).
 */
async function getDepartmentAttendance({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  // 1. Fetch departments in scope
  let deptSql = 'SELECT id, name FROM departments WHERE 1=1';
  const deptParams = [];
  if (departmentId && departmentId !== 'all') {
    deptSql += ' AND id = ?';
    deptParams.push(parseInt(departmentId, 10));
  }
  deptSql += ' ORDER BY name ASC';
  const [departments] = await pool.query(deptSql, deptParams);

  if (departments.length === 0) {
    return [];
  }

  // 2. Present days count aggregated in one query
  let presentSql = `
    SELECT e.department_id, COUNT(a.id) AS present_count
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.date BETWEEN ? AND ?
      AND a.status != 'Absent'
      AND a.check_in IS NOT NULL
  `;
  const presentParams = [startDate, endDate];
  if (departmentId && departmentId !== 'all') {
    presentSql += ' AND e.department_id = ?';
    presentParams.push(parseInt(departmentId, 10));
  }
  presentSql += ' GROUP BY e.department_id';
  const [presentRows] = await pool.query(presentSql, presentParams);
  const presentMap = new Map();
  for (const r of presentRows) {
    presentMap.set(r.department_id, Number(r.present_count || 0));
  }

  // 3. Active employees in scope
  let empSql = `
    SELECT id, department_id 
    FROM employees 
    WHERE deleted_at IS NULL AND (status = 'Active' OR status IS NULL)
  `;
  const empParams = [];
  if (departmentId && departmentId !== 'all') {
    empSql += ' AND department_id = ?';
    empParams.push(parseInt(departmentId, 10));
  }
  const [allEmployees] = await pool.query(empSql, empParams);

  const deptEmpMap = new Map();
  for (const emp of allEmployees) {
    if (!deptEmpMap.has(emp.department_id)) {
      deptEmpMap.set(emp.department_id, []);
    }
    deptEmpMap.get(emp.department_id).push(emp);
  }

  // 4. Pre-fetch holidays and approved leaves in range
  const [holidaysInRange] = await pool.query(
    `SELECT * FROM holidays WHERE (? BETWEEN date AND COALESCE(end_date, date)) OR (date BETWEEN ? AND ?)`,
    [startDate, startDate, endDate]
  );

  const [leavesInRange] = await pool.query(
    `SELECT * FROM leave_requests WHERE status = 'APPROVED' AND NOT (end_date < ? OR start_date > ?)`,
    [startDate, endDate]
  );

  // Pre-calculate calendar dates in range
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const dates = [];
  const cur = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);
  while (cur <= endD) {
    dates.push({
      dateStr: formatDate(cur),
      dayOfWeek: cur.getDay() // 0 = Sun, 6 = Sat
    });
    cur.setDate(cur.getDate() + 1);
  }

  const results = [];

  for (const dept of departments) {
    const emps = deptEmpMap.get(dept.id) || [];
    let expectedWorkingDays = 0;

    for (const emp of emps) {
      for (const { dateStr, dayOfWeek } of dates) {
        // Exclude Public Holiday
        const isHoliday = holidaysInRange.some((h) => {
          const inRange = (dateStr >= formatDate(h.date) && dateStr <= formatDate(h.end_date || h.date));
          if (!inRange) return false;
          return h.scope === 'all' || (h.scope === 'department' && h.department_id === dept.id);
        });
        if (isHoliday) continue;

        // Exclude Weekend (Saturday and Sunday)
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        // Exclude Approved Leave
        const leave = leavesInRange.find((lr) =>
          lr.employee_id === emp.id &&
          dateStr >= formatDate(lr.start_date) &&
          dateStr <= formatDate(lr.end_date)
        );
        if (leave) {
          if (leave.is_half_day) {
            expectedWorkingDays += 0.5;
          }
          continue;
        }

        expectedWorkingDays += 1;
      }
    }

    const presentDays = presentMap.get(dept.id) || 0;
    const attendancePct = expectedWorkingDays > 0
      ? Math.min(100, Math.round((presentDays / expectedWorkingDays) * 1000) / 10)
      : (presentDays > 0 ? 100 : 0);

    results.push({
      department_id: dept.id,
      department_name: dept.name,
      employee_count: emps.length,
      present_days: presentDays,
      expected_days: expectedWorkingDays,
      attendance_pct: attendancePct,
      low_data: expectedWorkingDays < 5,
    });
  }

  return results;
}

/**
 * 2. Punctuality Ranking
 * Formula: on-time days / days present. Top and bottom 10.
 * Ignores employees with fewer than 5 days present.
 * Uses CTE and RANK() OVER.
 */
async function getPunctualityRanking({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  let deptCondition = '';
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  const sql = `
    WITH emp_stats AS (
      SELECT 
        a.employee_id,
        e.name AS employee_name,
        e.department_id,
        COALESCE(d.name, 'No Department') AS department_name,
        COUNT(a.id) AS days_present,
        SUM(CASE WHEN a.is_late = 0 THEN 1 ELSE 0 END) AS on_time_days,
        ROUND(SUM(CASE WHEN a.is_late = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(a.id), 1) AS punctuality_pct
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE a.date BETWEEN ? AND ?
        AND a.status != 'Absent'
        AND a.check_in IS NOT NULL
        ${deptCondition}
      GROUP BY a.employee_id, e.name, e.department_id, d.name
      HAVING days_present >= 5
    ),
    ranked_top AS (
      SELECT *,
        RANK() OVER (ORDER BY punctuality_pct DESC, days_present DESC) AS rk
      FROM emp_stats
    ),
    ranked_bottom AS (
      SELECT *,
        RANK() OVER (ORDER BY punctuality_pct ASC, days_present ASC) AS rk
      FROM emp_stats
    )
    SELECT * FROM (
      SELECT 'top' as category, rk as rank_pos, employee_id, employee_name, department_id, department_name, days_present, on_time_days, punctuality_pct
      FROM ranked_top
      WHERE rk <= 10
      UNION ALL
      SELECT 'bottom' as category, rk as rank_pos, employee_id, employee_name, department_id, department_name, days_present, on_time_days, punctuality_pct
      FROM ranked_bottom
      WHERE rk <= 10
    ) combined
    ORDER BY category DESC, rank_pos ASC;
  `;

  const [rows] = await pool.query(sql, params);

  const top10 = rows.filter((r) => r.category === 'top');
  const bottom10 = rows.filter((r) => r.category === 'bottom');

  return {
    top10,
    bottom10,
    total_qualifying: rows.length,
    low_data: rows.length === 0,
  };
}

/**
 * 3. Monthly Absenteeism Trend
 * Absent days per month with change from the previous month using LAG().
 */
async function getMonthlyAbsenteeismTrend({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  let deptCondition = '';
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  const sql = `
    WITH monthly_absences AS (
      SELECT 
        DATE_FORMAT(a.date, '%Y-%m') AS month,
        COUNT(a.id) AS absent_days
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date BETWEEN ? AND ?
        AND a.status = 'Absent'
        ${deptCondition}
      GROUP BY DATE_FORMAT(a.date, '%Y-%m')
    ),
    with_lag AS (
      SELECT 
        month,
        absent_days,
        LAG(absent_days, 1, 0) OVER (ORDER BY month) AS prev_month_absent_days,
        absent_days - LAG(absent_days, 1, 0) OVER (ORDER BY month) AS change_from_prev
      FROM monthly_absences
    )
    SELECT 
      month,
      absent_days,
      prev_month_absent_days,
      change_from_prev,
      CASE 
        WHEN prev_month_absent_days = 0 THEN 0
        ELSE ROUND((change_from_prev * 100.0) / prev_month_absent_days, 1)
      END AS pct_change
    FROM with_lag
    ORDER BY month ASC;
  `;

  const [rows] = await pool.query(sql, params);

  return rows.map((r) => ({
    month: r.month,
    absent_days: Number(r.absent_days),
    prev_month_absent_days: Number(r.prev_month_absent_days),
    change_from_prev: Number(r.change_from_prev),
    pct_change: Number(r.pct_change),
  }));
}

/**
 * 4. Average Working Hours
 * Per department and per month.
 */
async function getAverageWorkingHours({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  let deptCondition = '';
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  const sql = `
    SELECT 
      DATE_FORMAT(a.date, '%Y-%m') AS month,
      e.department_id,
      COALESCE(d.name, 'No Department') AS department_name,
      ROUND(AVG(a.total_hours), 2) AS avg_hours,
      COUNT(a.id) AS days_count
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE a.date BETWEEN ? AND ?
      AND a.status != 'Absent'
      AND a.total_hours > 0
      ${deptCondition}
    GROUP BY DATE_FORMAT(a.date, '%Y-%m'), e.department_id, d.name
    ORDER BY month ASC, department_name ASC;
  `;

  const [rows] = await pool.query(sql, params);

  return rows.map((r) => ({
    month: r.month,
    department_id: r.department_id,
    department_name: r.department_name,
    avg_hours: Number(r.avg_hours),
    days_count: Number(r.days_count),
  }));
}

/**
 * 5. Overtime Trend
 * Approved overtime hours per month by type (regular, weekend, holiday).
 */
async function getOvertimeTrend({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  let deptCondition = '';
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  const sql = `
    SELECT 
      DATE_FORMAT(o.work_date, '%Y-%m') AS month,
      ROUND(SUM(CASE WHEN o.day_type = 'regular' THEN o.minutes ELSE 0 END) / 60.0, 2) AS regular_hours,
      ROUND(SUM(CASE WHEN o.day_type = 'weekend' THEN o.minutes ELSE 0 END) / 60.0, 2) AS weekend_hours,
      ROUND(SUM(CASE WHEN o.day_type = 'holiday' THEN o.minutes ELSE 0 END) / 60.0, 2) AS holiday_hours,
      ROUND(SUM(o.minutes) / 60.0, 2) AS total_hours
    FROM overtime_requests o
    JOIN employees e ON o.employee_id = e.id
    WHERE o.status = 'approved'
      AND o.work_date BETWEEN ? AND ?
      ${deptCondition}
    GROUP BY DATE_FORMAT(o.work_date, '%Y-%m')
    ORDER BY month ASC;
  `;

  const [rows] = await pool.query(sql, params);

  return rows.map((r) => ({
    month: r.month,
    regular_hours: Number(r.regular_hours),
    weekend_hours: Number(r.weekend_hours),
    holiday_hours: Number(r.holiday_hours),
    total_hours: Number(r.total_hours),
  }));
}

/**
 * 6. Frequent Late Arrivals
 * Employees with the most late days and total late minutes, paginated.
 */
async function getFrequentLateArrivals({ startMonth, endMonth, departmentId = null, page = 1, limit = 10 }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  let deptCondition = '';
  const params = [startDate, endDate];

  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  // Count total distinct employees with late days
  const countSql = `
    SELECT COUNT(DISTINCT a.employee_id) AS total
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.date BETWEEN ? AND ?
      AND a.is_late = 1
      ${deptCondition}
  `;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;

  const dataSql = `
    SELECT 
      a.employee_id,
      e.name AS employee_name,
      e.department_id,
      COALESCE(d.name, 'No Department') AS department_name,
      COUNT(a.id) AS late_days,
      SUM(a.late_minutes) AS total_late_minutes,
      ROUND(AVG(a.late_minutes), 1) AS avg_late_minutes
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE a.date BETWEEN ? AND ?
      AND a.is_late = 1
      ${deptCondition}
    GROUP BY a.employee_id, e.name, e.department_id, d.name
    ORDER BY late_days DESC, total_late_minutes DESC
    LIMIT ? OFFSET ?;
  `;

  const [rows] = await pool.query(dataSql, [...params, limitNum, offset]);

  return {
    items: rows.map((r) => ({
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      department_id: r.department_id,
      department_name: r.department_name,
      late_days: Number(r.late_days),
      total_late_minutes: Number(r.total_late_minutes),
      avg_late_minutes: Number(r.avg_late_minutes),
    })),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    low_data: total === 0,
  };
}

/**
 * 7. Employee Attendance Calendar
 * For one employee and month, each day with its type and check-in/out times.
 */
async function getEmployeeAttendanceCalendar({ employeeId, month }) {
  if (!employeeId) return null;

  const monthStr = month ? String(month).slice(0, 7) : resolveDateRange().startMonth;
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  // Employee details
  const [empRows] = await pool.query(
    `SELECT e.id, e.name, e.department_id, d.name AS department_name
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE e.id = ?`,
    [employeeId]
  );

  if (empRows.length === 0) {
    return null;
  }

  const employee = empRows[0];

  // Fetch all attendance rows for this employee in this month
  const [attRows] = await pool.query(
    `SELECT id, date, check_in, check_out, total_hours, is_late, late_minutes, status
     FROM attendance
     WHERE employee_id = ? AND date BETWEEN ? AND ?`,
    [employeeId, startDate, endDate]
  );

  const attMap = new Map();
  for (const row of attRows) {
    attMap.set(formatDate(row.date), row);
  }

  const now = new Date();
  const todayStr = formatDate(now);

  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const dayInfo = await getDayType(employeeId, dayStr);
    const attRecord = attMap.get(dayStr);

    let type = 'working';
    let checkIn = null;
    let checkOut = null;
    let totalHours = 0;
    let isLate = false;
    let lateMinutes = 0;
    let statusLabel = 'Working Day';

    if (attRecord) {
      checkIn = attRecord.check_in;
      checkOut = attRecord.check_out;
      totalHours = Number(attRecord.total_hours || 0);
      isLate = Boolean(attRecord.is_late);
      lateMinutes = Number(attRecord.late_minutes || 0);

      if (attRecord.status === 'Absent') {
        type = 'absent';
        statusLabel = 'Absent';
      } else if (isLate || attRecord.status === 'Late') {
        type = 'late';
        statusLabel = `Late (${lateMinutes}m)`;
      } else {
        type = 'present';
        statusLabel = 'Present';
      }
    } else {
      // No attendance row recorded
      if (dayInfo.dayType === 'holiday') {
        type = 'holiday';
        statusLabel = dayInfo.name ? `Holiday: ${dayInfo.name}` : 'Public Holiday';
      } else if (dayInfo.dayType === 'weekend') {
        type = 'weekend';
        statusLabel = 'Weekend Off';
      } else if (dayInfo.dayType === 'on_leave') {
        type = 'leave';
        statusLabel = dayInfo.leave?.leave_type ? `${dayInfo.leave.leave_type} Leave` : 'Approved Leave';
      } else if (dayInfo.dayType === 'half_day_leave') {
        type = 'half_day_leave';
        statusLabel = 'Half Day Leave';
      } else {
        // Working day with no check-in
        if (dayStr < todayStr) {
          type = 'absent';
          statusLabel = 'Absent (No Check-in)';
        } else {
          type = 'expected_working';
          statusLabel = 'Scheduled Working Day';
        }
      }
    }

    days.push({
      day,
      date: dayStr,
      type,
      status_label: statusLabel,
      check_in: checkIn,
      check_out: checkOut,
      total_hours: totalHours,
      is_late: isLate,
      late_minutes: lateMinutes,
    });
  }

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      department_id: employee.department_id,
      department_name: employee.department_name,
    },
    month: monthStr,
    days,
  };
}

/**
 * 8. Analytics Comparison
 * Departments side by side, and month vs month, for attendance %, late count, absences, and average hours.
 */
async function getAnalyticsComparison({ startMonth, endMonth, departmentId = null, mode = 'department' }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  if (mode === 'department') {
    // Compare departments side by side
    const deptAttendance = await getDepartmentAttendance({ startMonth, endMonth, departmentId });

    let deptCondition = '';
    const params = [startDate, endDate];
    if (departmentId && departmentId !== 'all') {
      deptCondition = ' AND e.department_id = ?';
      params.push(parseInt(departmentId, 10));
    }

    // Late count, absences, and avg hours by department
    const [statsRows] = await pool.query(
      `SELECT 
         e.department_id,
         SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absences,
         ROUND(AVG(CASE WHEN a.status != 'Absent' AND a.total_hours > 0 THEN a.total_hours ELSE NULL END), 2) AS avg_hours
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date BETWEEN ? AND ?
         ${deptCondition}
       GROUP BY e.department_id`,
      params
    );

    const statsMap = new Map();
    for (const r of statsRows) {
      statsMap.set(r.department_id, r);
    }

    return deptAttendance.map((d) => {
      const s = statsMap.get(d.department_id) || {};
      return {
        department_id: d.department_id,
        department_name: d.department_name,
        attendance_pct: d.attendance_pct,
        present_days: d.present_days,
        expected_days: d.expected_days,
        late_count: Number(s.late_count || 0),
        absences: Number(s.absences || 0),
        avg_hours: Number(s.avg_hours || 0),
      };
    });
  } else {
    // Compare month vs month
    let deptCondition = '';
    const params = [startDate, endDate];
    if (departmentId && departmentId !== 'all') {
      deptCondition = ' AND e.department_id = ?';
      params.push(parseInt(departmentId, 10));
    }

    const [monthStats] = await pool.query(
      `SELECT 
         DATE_FORMAT(a.date, '%Y-%m') AS month,
         COUNT(a.id) AS total_records,
         SUM(CASE WHEN a.status != 'Absent' AND a.check_in IS NOT NULL THEN 1 ELSE 0 END) AS present_days,
         SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absences,
         ROUND(AVG(CASE WHEN a.status != 'Absent' AND a.total_hours > 0 THEN a.total_hours ELSE NULL END), 2) AS avg_hours
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date BETWEEN ? AND ?
         ${deptCondition}
       GROUP BY DATE_FORMAT(a.date, '%Y-%m')
       ORDER BY month ASC`,
      params
    );

    return monthStats.map((m) => {
      const pres = Number(m.present_days || 0);
      const abs = Number(m.absences || 0);
      const totalExpected = pres + abs;
      const attendancePct = totalExpected > 0 ? Math.round((pres / totalExpected) * 1000) / 10 : 0;
      return {
        month: m.month,
        attendance_pct: attendancePct,
        late_count: Number(m.late_count || 0),
        absences: abs,
        avg_hours: Number(m.avg_hours || 0),
      };
    });
  }
}

/**
 * 9. Top-Level Summary Metrics
 * Overall attendance %, average hours, total late, total absences.
 */
async function getAnalyticsSummary({ startMonth, endMonth, departmentId = null }) {
  const { startDate, endDate } = resolveDateRange(startMonth, endMonth);

  let deptCondition = '';
  const params = [startDate, endDate];
  if (departmentId && departmentId !== 'all') {
    deptCondition = ' AND e.department_id = ?';
    params.push(parseInt(departmentId, 10));
  }

  const [rows] = await pool.query(
    `SELECT 
       COUNT(a.id) AS total_logs,
       SUM(CASE WHEN a.status != 'Absent' AND a.check_in IS NOT NULL THEN 1 ELSE 0 END) AS total_present,
       SUM(CASE WHEN a.is_late = 1 THEN 1 ELSE 0 END) AS total_late,
       SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS total_absences,
       ROUND(AVG(CASE WHEN a.status != 'Absent' AND a.total_hours > 0 THEN a.total_hours ELSE NULL END), 1) AS avg_hours
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.date BETWEEN ? AND ?
       ${deptCondition}`,
    params
  );

  const stats = rows[0] || {};
  const totalPresent = Number(stats.total_present || 0);
  const totalAbsences = Number(stats.total_absences || 0);
  const totalLate = Number(stats.total_late || 0);
  const avgHours = Number(stats.avg_hours || 0);

  const denom = totalPresent + totalAbsences;
  const overallAttendancePct = denom > 0
    ? Math.min(100, Math.round((totalPresent / denom) * 1000) / 10)
    : 0;

  return {
    overall_attendance_pct: overallAttendancePct,
    avg_hours: avgHours,
    total_late: totalLate,
    total_absences: totalAbsences,
    total_present: totalPresent,
    low_data: denom < 5,
  };
}

module.exports = {
  resolveDateRange,
  getDepartmentAttendance,
  getPunctualityRanking,
  getMonthlyAbsenteeismTrend,
  getAverageWorkingHours,
  getOvertimeTrend,
  getFrequentLateArrivals,
  getEmployeeAttendanceCalendar,
  getAnalyticsComparison,
  getAnalyticsSummary,
};
