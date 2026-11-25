const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'employee_test_db';
require('dotenv').config({ path: path.join(__dirname, '../.env') });
process.env.DB_NAME = 'employee_test_db';

const pool = require('../db');
const cacheHelper = require('../services/cacheHelper');
const { getDashboardStats, invalidateDashboardCache } = require('../services/dashboardStatsService');
const { formatDate } = require('../services/shiftService');

describe('Performance Optimization Test Suite', () => {
  let testEmployeeId = null;
  const testDate = '2026-12-15';

  before(async () => {
    // Find or create test employee in employee_test_db
    const [rows] = await pool.query('SELECT id FROM employees WHERE deleted_at IS NULL LIMIT 1');
    if (rows.length > 0) {
      testEmployeeId = rows[0].id;
    } else {
      const [ins] = await pool.query(
        "INSERT INTO employees (name, email, role, status, joining_date) VALUES ('Perf Test Emp', 'perftest@example.com', 'employee', 'Active', '2023-01-01')"
      );
      testEmployeeId = ins.insertId;
    }

    // Clean up test attendance records for test date
    await pool.query('DELETE FROM attendance WHERE date = ?', [testDate]);
  });

  after(async () => {
    // Clean up test attendance records
    if (testEmployeeId) {
      await pool.query('DELETE FROM attendance WHERE date = ?', [testDate]);
    }
  });

  test('Manager vs admin cache keys differ', () => {
    const adminKey = cacheHelper.getDashboardKey({
      role: 'admin',
      departmentId: null,
      date: '2024-03-15'
    });

    const managerKey = cacheHelper.getDashboardKey({
      role: 'department_manager',
      departmentId: 2,
      date: '2024-03-15'
    });

    assert.notStrictEqual(adminKey, managerKey, 'Admin and manager keys must not be equal');
    assert.match(adminKey, /role:admin/);
    assert.match(adminKey, /dept:all/);
    assert.match(managerKey, /role:department_manager/);
    assert.match(managerKey, /dept:2/);
  });

  test('Cache equals DB data', async () => {
    const filters = { date: '2024-03-15' };
    const user = { role: 'admin' };

    // Force DB retrieval
    const dbData = await getDashboardStats({ user, filters, forceDb: true });
    assert.ok(dbData, 'DB data should be returned');
    assert.ok(typeof dbData.totalEmployees === 'number');

    // Retrieve from cache
    const cachedData = await getDashboardStats({ user, filters, forceDb: false });
    assert.ok(cachedData, 'Cached data should be returned');

    // Verify all key fields are identical
    assert.strictEqual(cachedData.totalEmployees, dbData.totalEmployees);
    assert.strictEqual(cachedData.activeEmployees, dbData.activeEmployees);
    assert.strictEqual(cachedData.todayPresent, dbData.todayPresent);
    assert.strictEqual(cachedData.todayLate, dbData.todayLate);
    assert.strictEqual(cachedData.todayAbsent, dbData.todayAbsent);
    assert.strictEqual(cachedData.todayMissingCheckout, dbData.todayMissingCheckout);
    assert.strictEqual(cachedData.totalDepartments, dbData.totalDepartments);
  });

  test('Cache invalidated on write', async () => {
    const filters = { date: '2024-03-15' };
    const user = { role: 'admin' };
    const cacheKey = cacheHelper.getDashboardKey({ role: 'admin', departmentId: null, date: '2024-03-15' });

    // Populate cache
    await getDashboardStats({ user, filters, forceDb: true });
    let val = await cacheHelper.get(cacheKey);
    assert.ok(val, 'Cache should contain dashboard stats before invalidation');

    // Invalidate
    await invalidateDashboardCache();

    // Verify cache was purged
    val = await cacheHelper.get(cacheKey);
    assert.strictEqual(val, null, 'Cache must be null after invalidation');
  });

  test('Works with Redis down', async () => {
    const filters = { date: '2024-03-15' };
    const user = { role: 'admin' };

    // Simulate Redis offline
    cacheHelper.simulateRedisDown(true);
    assert.strictEqual(cacheHelper.isDown(), true);

    try {
      // Must not throw; must fetch directly from DB
      const result = await getDashboardStats({ user, filters });
      assert.ok(result, 'Dashboard stats should still return when Redis is down');
      assert.ok(typeof result.totalEmployees === 'number');
      assert.ok(result.totalEmployees > 0);
    } finally {
      cacheHelper.simulateRedisDown(false);
    }
  });

  test('Keyset equals offset results', async () => {
    // 1. Fetch Page 1 via offset
    const limit = 10;
    const [page1Rows] = await pool.query(
      `SELECT id, employee_id, date, status
       FROM attendance
       WHERE date BETWEEN '2024-01-01' AND '2024-01-31'
       ORDER BY date DESC, id DESC
       LIMIT ? OFFSET 0`,
      [limit]
    );

    assert.strictEqual(page1Rows.length, limit, 'Page 1 should have limit items');
    const lastRecord = page1Rows[page1Rows.length - 1];
    const cursorDate = formatDate(lastRecord.date);
    const cursorId = lastRecord.id;

    // 2. Fetch Page 2 via standard OFFSET (10)
    const [offsetRows] = await pool.query(
      `SELECT id, employee_id, date, status
       FROM attendance
       WHERE date BETWEEN '2024-01-01' AND '2024-01-31'
       ORDER BY date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [limit, limit]
    );

    // 3. Fetch Page 2 via KEYSET pagination using cursor
    const [keysetRows] = await pool.query(
      `SELECT id, employee_id, date, status
       FROM attendance
       WHERE date BETWEEN '2024-01-01' AND '2024-01-31'
         AND (date < ? OR (date = ? AND id < ?))
       ORDER BY date DESC, id DESC
       LIMIT ?`,
      [cursorDate, cursorDate, cursorId, limit]
    );

    assert.strictEqual(offsetRows.length, keysetRows.length, 'Both pagination methods must return equal number of records');

    for (let i = 0; i < offsetRows.length; i++) {
      assert.strictEqual(
        keysetRows[i].id,
        offsetRows[i].id,
        `Record at index ${i} ID must match (keyset: ${keysetRows[i].id}, offset: ${offsetRows[i].id})`
      );
      assert.strictEqual(
        formatDate(keysetRows[i].date),
        formatDate(offsetRows[i].date),
        `Record at index ${i} date must match`
      );
    }
  });

  test('Concurrent check-ins for one employee create one record', async () => {
    const concurrentCount = 5;
    const promises = [];

    // Simulate 5 simultaneous check-in attempts on testDate
    for (let i = 0; i < concurrentCount; i++) {
      promises.push(
        (async () => {
          const conn = await pool.getConnection();
          await conn.beginTransaction();
          try {
            // Check existing
            const [existing] = await conn.query(
              'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
              [testEmployeeId, testDate]
            );

            if (existing.length > 0) {
              await conn.rollback();
              conn.release();
              return { success: false, reason: 'ALREADY_CHECKED_IN' };
            }

            // Insert
            const [result] = await conn.query(
              `INSERT INTO attendance (employee_id, date, status, check_in)
               VALUES (?, ?, 'Present', NOW())`,
              [testEmployeeId, testDate]
            );

            await conn.commit();
            conn.release();
            return { success: true, id: result.insertId };
          } catch (err) {
            await conn.rollback();
            conn.release();
            if (err.code === 'ER_DUP_ENTRY') {
              return { success: false, reason: 'ER_DUP_ENTRY' };
            }
            throw err;
          }
        })()
      );
    }

    const results = await Promise.all(promises);

    const successfulInserts = results.filter((r) => r.success);
    assert.strictEqual(successfulInserts.length, 1, 'Exactly one concurrent check-in should succeed');

    // Confirm only 1 record exists in DB
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM attendance WHERE employee_id = ? AND date = ?',
      [testEmployeeId, testDate]
    );
    assert.strictEqual(Number(countRows[0].cnt), 1, 'Exactly 1 attendance row must exist for employee and date');
  });
});
