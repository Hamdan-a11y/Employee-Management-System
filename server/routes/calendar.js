const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const {
  formatDate,
  parseLocalDate,
  getDayType,
  getWorkingDays,
  getAbsentDays
} = require('../services/calendarService');

router.use(authenticateToken);

/**
 * Helper to resolve target employee_id for user
 */
async function resolveEmployeeId(req, targetId = null) {
  if (targetId && (req.user.role === 'admin' || req.user.role === 'hr_manager' || req.user.role === 'department_manager')) {
    return parseInt(targetId, 10);
  }
  if (req.user.employee_id) {
    return req.user.employee_id;
  }
  const [matched] = await pool.query(
    'SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL',
    [req.user.email]
  );
  return matched.length > 0 ? matched[0].id : null;
}

// ==========================================
// 1. GET /api/calendar/day-type
// ==========================================
router.get('/day-type', async (req, res) => {
  try {
    const { employee_id, date } = req.query;
    const empId = await resolveEmployeeId(req, employee_id);
    const dateStr = formatDate(date || new Date());

    const result = await getDayType(empId, dateStr);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate day type.', error: err.message });
  }
});

// ==========================================
// 2. GET /api/calendar/working-days
// ==========================================
router.get('/working-days', async (req, res) => {
  try {
    const { employee_id, start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ message: 'start_date and end_date are required.' });
    }
    const empId = await resolveEmployeeId(req, employee_id);
    const result = await getWorkingDays(empId, start_date, end_date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate working days.', error: err.message });
  }
});

// ==========================================
// 3. GET /api/calendar/absent-days
// ==========================================
router.get('/absent-days', async (req, res) => {
  try {
    const { employee_id, month } = req.query;
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const empId = await resolveEmployeeId(req, employee_id);

    if (!empId) {
      return res.status(400).json({ message: 'Employee ID is required.' });
    }

    const result = await getAbsentDays(empId, targetMonth);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate absent days.', error: err.message });
  }
});

// ==========================================
// 4. GET /api/calendar/team-calendar
// ==========================================
router.get('/team-calendar', async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    let departmentId = req.query.department_id;

    // RBAC: Department Manager is locked to their own department
    if (req.user.role === 'department_manager') {
      departmentId = req.user.department_id;
      if (!departmentId) {
        return res.json({ days: [], employees: [], month: monthStr });
      }
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartDate = `${monthStr}-01`;
    const monthEndDate = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Fetch Month Days & Company-wide / Base Day Types
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const dObj = parseLocalDate(dStr);
      const dayOfWeek = dObj.getDay();

      const dayInfo = await getDayType(null, dStr);
      days.push({
        day,
        date: dStr,
        dayOfWeek,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        dayType: dayInfo.dayType,
        isWeekend: dayInfo.dayType === 'weekend',
        isHoliday: dayInfo.dayType === 'holiday',
        holidayName: dayInfo.holiday?.name || null
      });
    }

    // 2. Fetch Employees in scope
    let empQuery = `
      SELECT e.id, e.name, e.designation, d.name AS department_name, e.department_id
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'Active' AND e.deleted_at IS NULL
    `;
    const empParams = [];

    if (departmentId && departmentId !== 'all') {
      empQuery += ' AND e.department_id = ?';
      empParams.push(parseInt(departmentId, 10));
    }

    empQuery += ' ORDER BY d.name ASC, e.name ASC';

    const [employees] = await pool.query(empQuery, empParams);

    if (employees.length === 0) {
      return res.json({ days, employees: [], month: monthStr });
    }

    const empIds = employees.map((e) => e.id);

    // 3. Fetch Attendance Records for these employees in this month
    const [attendanceRows] = await pool.query(
      `SELECT employee_id, date, check_in, check_out, status, is_late, total_hours
       FROM attendance
       WHERE employee_id IN (?) AND date BETWEEN ? AND ?`,
      [empIds, monthStartDate, monthEndDate]
    );
    const attendanceMap = new Map();
    for (const a of attendanceRows) {
      const key = `${a.employee_id}_${formatDate(a.date)}`;
      attendanceMap.set(key, a);
    }

    // 4. Fetch Approved Leaves for these employees in this month
    const [leaveRows] = await pool.query(
      `SELECT lr.*
       FROM leave_requests lr
       WHERE lr.employee_id IN (?)
         AND lr.status = 'APPROVED'
         AND (lr.start_date <= ? AND lr.end_date >= ?)`,
      [empIds, monthEndDate, monthStartDate]
    );
    const leaveMap = new Map();
    for (const lr of leaveRows) {
      let cur = new Date(parseLocalDate(lr.start_date));
      const end = parseLocalDate(lr.end_date);
      while (cur.getTime() <= end.getTime()) {
        const key = `${lr.employee_id}_${formatDate(cur)}`;
        leaveMap.set(key, lr);
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 5. Build Employee Daily Status Map
    const formattedEmployees = await Promise.all(
      employees.map(async (emp) => {
        const schedule = [];
        for (const day of days) {
          const key = `${emp.id}_${day.date}`;
          const att = attendanceMap.get(key);
          const leave = leaveMap.get(key);
          const empDayType = await getDayType(emp.id, day.date);

          let cellStatus = 'working';
          let label = '';
          let color = 'default';

          if (empDayType.dayType === 'holiday') {
            if (att && att.check_in && att.status !== 'Absent') {
              cellStatus = 'holiday_work';
              label = `Holiday Work (${att.total_hours}h)`;
              color = 'purple';
            } else {
              cellStatus = 'holiday';
              label = empDayType.holiday?.name || 'Holiday';
              color = 'purple';
            }
          } else if (empDayType.dayType === 'weekend') {
            if (att && att.check_in && att.status !== 'Absent') {
              cellStatus = 'weekend_work';
              label = `Weekend Work (${att.total_hours}h)`;
              color = 'blue';
            } else {
              cellStatus = 'weekend';
              label = 'Weekend';
              color = 'gray';
            }
          } else if (leave) {
            cellStatus = leave.is_half_day ? 'half_day_leave' : 'leave';
            label = `${leave.leave_type} Leave${leave.is_half_day ? ' (0.5d)' : ''}`;
            color = 'amber';
          } else if (att && att.check_in && att.status !== 'Absent') {
            if (att.is_late) {
              cellStatus = 'late';
              label = 'Late';
              color = 'yellow';
            } else {
              cellStatus = 'present';
              label = 'Present';
              color = 'emerald';
            }
          } else {
            // Scheduled working day with no attendance
            const isPast = day.date <= formatDate(new Date());
            cellStatus = isPast ? 'absent' : 'scheduled';
            label = isPast ? 'Absent' : 'Scheduled';
            color = isPast ? 'rose' : 'default';
          }

          schedule.push({
            date: day.date,
            day: day.day,
            status: cellStatus,
            label,
            color,
            attendance: att || null,
            leave: leave || null
          });
        }

        return {
          ...emp,
          schedule
        };
      })
    );

    res.json({
      month: monthStr,
      year,
      monthNum: month,
      days,
      employees: formattedEmployees
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load team calendar.', error: err.message });
  }
});

// ==========================================
// 5. GET /api/calendar/employee-calendar
// ==========================================
router.get('/employee-calendar', async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const employeeId = await resolveEmployeeId(req, req.query.employee_id);

    if (!employeeId) {
      return res.status(404).json({ message: 'Employee profile not found.' });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartDate = `${monthStr}-01`;
    const monthEndDate = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Fetch attendance records
    const [attRows] = await pool.query(
      `SELECT a.*, o_in.name AS office_name
       FROM attendance a
       LEFT JOIN office_locations o_in ON a.check_in_office_id = o_in.id
       WHERE a.employee_id = ? AND a.date BETWEEN ? AND ?`,
      [employeeId, monthStartDate, monthEndDate]
    );
    const attendanceMap = new Map();
    for (const a of attRows) {
      attendanceMap.set(formatDate(a.date), a);
    }

    // 2. Fetch approved leaves
    const [leaveRows] = await pool.query(
      `SELECT * FROM leave_requests
       WHERE employee_id = ?
         AND status = 'APPROVED'
         AND (start_date <= ? AND end_date >= ?)`,
      [employeeId, monthEndDate, monthStartDate]
    );
    const leaveMap = new Map();
    for (const lr of leaveRows) {
      let cur = new Date(parseLocalDate(lr.start_date));
      const end = parseLocalDate(lr.end_date);
      while (cur.getTime() <= end.getTime()) {
        leaveMap.set(formatDate(cur), lr);
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 3. Generate calendar days
    const days = [];
    const todayStr = formatDate(new Date());

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${monthStr}-${String(day).padStart(2, '0')}`;
      const dObj = parseLocalDate(dStr);
      const dayOfWeek = dObj.getDay();

      const dayTypeInfo = await getDayType(employeeId, dStr);
      const att = attendanceMap.get(dStr);
      const leave = leaveMap.get(dStr);
      const isPastOrToday = dStr <= todayStr;

      let type = 'scheduled';
      let title = 'Working Day';
      let badge = 'Scheduled';

      if (dayTypeInfo.dayType === 'holiday') {
        holidayCount++;
        if (att && att.check_in && att.status !== 'Absent') {
          type = 'holiday_work';
          title = `${dayTypeInfo.holiday?.name || 'Holiday'} (Worked ${att.total_hours || 0}h)`;
          badge = 'Holiday Work';
        } else {
          type = 'holiday';
          title = dayTypeInfo.holiday?.name || 'Public Holiday';
          badge = 'Holiday';
        }
      } else if (dayTypeInfo.dayType === 'weekend') {
        if (att && att.check_in && att.status !== 'Absent') {
          type = 'weekend_work';
          title = `Weekend (Worked ${att.total_hours || 0}h)`;
          badge = 'Weekend Work';
        } else {
          type = 'weekend';
          title = 'Weekend Off';
          badge = 'Weekend';
        }
      } else if (leave) {
        leaveCount += leave.is_half_day ? 0.5 : 1.0;
        type = leave.is_half_day ? 'half_day_leave' : 'on_leave';
        title = `${leave.leave_type} Leave${leave.is_half_day ? ' (0.5 day)' : ''}`;
        badge = 'Leave';
      } else if (att && att.check_in && att.status !== 'Absent') {
        if (att.is_late) {
          lateCount++;
          type = 'late';
          title = `Late Check-In (${att.late_minutes}m late)`;
          badge = 'Late';
        } else {
          presentCount++;
          type = 'present';
          title = 'Present on Time';
          badge = 'Present';
        }
      } else if (isPastOrToday) {
        absentCount++;
        type = 'absent';
        title = 'Unapproved Absence';
        badge = 'Absent';
      }

      days.push({
        day,
        date: dStr,
        dayOfWeek,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        type,
        title,
        badge,
        holiday: dayTypeInfo.holiday || null,
        leave: leave || null,
        attendance: att || null
      });
    }

    res.json({
      month: monthStr,
      year,
      monthNum: month,
      summary: {
        presentCount,
        lateCount,
        absentCount,
        leaveCount,
        holidayCount
      },
      days
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load employee attendance calendar.', error: err.message });
  }
});

module.exports = router;
