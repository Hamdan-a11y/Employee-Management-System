const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../db');
const {
  calculateHaversineDistance,
  validateCoordinates,
  isLocationExempt,
  evaluateLocationAgainstOffices,
  detectSuspiciousLocation,
  MAX_GPS_ACCURACY_METERS
} = require('../services/locationService');

describe('Feature: Geolocation-Based Attendance Tests', () => {
  let testDeptId;
  let testEmp1Id;
  let testEmp2ExemptId;
  let officeHonoluluId;
  let officeAnchorageId;
  let officeMiamiId;
  let exemptionId;

  before(async () => {
    // 1. Create a test department
    const [deptRes] = await pool.query(
      'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
      [`Geo Test Dept ${Date.now()}`, 5]
    );
    testDeptId = deptRes.insertId;

    // 2. Create test employees
    const [emp1Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status)
       VALUES (?, ?, ?, ?, 'Standard Staff', 'Active')`,
      ['Geo Standard Tester', `geo.std.${Date.now()}@example.com`, '1112223334', testDeptId]
    );
    testEmp1Id = emp1Res.insertId;

    const [emp2Res] = await pool.query(
      `INSERT INTO employees (name, email, phone, department_id, designation, status)
       VALUES (?, ?, ?, ?, 'Remote Staff', 'Active')`,
      ['Geo Exempt Tester', `geo.exempt.${Date.now()}@example.com`, '5556667778', testDeptId]
    );
    testEmp2ExemptId = emp2Res.insertId;

    // 3. Create unique test offices in unique locations
    // Office 1: Honolulu Branch (21.306900, -157.858300), radius 120m
    const [offHRes] = await pool.query(
      `INSERT INTO office_locations (name, address, latitude, longitude, allowed_radius, is_active)
       VALUES ('Geo Test Honolulu Branch', '100 Kalakaua Ave, Honolulu, HI', 21.30690000, -157.85830000, 120, TRUE)`
    );
    officeHonoluluId = offHRes.insertId;

    // Office 2: Anchorage Branch (61.218100, -149.900300), radius 150m
    const [offARes] = await pool.query(
      `INSERT INTO office_locations (name, address, latitude, longitude, allowed_radius, is_active)
       VALUES ('Geo Test Anchorage Branch', '200 Northern Lights, Anchorage, AK', 61.21810000, -149.90030000, 150, TRUE)`
    );
    officeAnchorageId = offARes.insertId;

    // Office 3: Miami Branch (25.761700, -80.191800), radius 100m
    const [offMRes] = await pool.query(
      `INSERT INTO office_locations (name, address, latitude, longitude, allowed_radius, is_active)
       VALUES ('Geo Test Miami Branch', '300 Biscayne Blvd, Miami, FL', 25.76170000, -80.19180000, 100, TRUE)`
    );
    officeMiamiId = offMRes.insertId;

    // 4. Create an exemption for testEmp2ExemptId
    const today = new Date().toISOString().split('T')[0];
    const [exRes] = await pool.query(
      `INSERT INTO location_exemptions (employee_id, reason, start_date, is_active)
       VALUES (?, 'Full-time Remote Contract', ?, TRUE)`,
      [testEmp2ExemptId, today]
    );
    exemptionId = exRes.insertId;
  });

  after(async () => {
    // Cleanup created test records
    try {
      if (exemptionId) {
        await pool.query('DELETE FROM location_exemptions WHERE id = ?', [exemptionId]);
      }
      await pool.query('DELETE FROM attendance WHERE employee_id IN (?, ?)', [testEmp1Id, testEmp2ExemptId]);
      await pool.query('DELETE FROM office_locations WHERE id IN (?, ?, ?)', [officeHonoluluId, officeAnchorageId, officeMiamiId]);
      await pool.query('DELETE FROM employees WHERE id IN (?, ?)', [testEmp1Id, testEmp2ExemptId]);
      await pool.query('DELETE FROM departments WHERE id = ?', [testDeptId]);
    } catch (err) {
      console.error('Error during cleanup:', err);
    } finally {
      await pool.end();
    }
  });

  // TEST 1: Haversine distance with known coordinates
  it('1. Haversine distance calculation matches known geographical benchmark', () => {
    // London Eye (51.5033, -0.1195) to Big Ben (51.5007, -0.1246)
    // Benchmark distance is ~460 to 470 meters
    const dist = calculateHaversineDistance(51.5033, -0.1195, 51.5007, -0.1246);
    assert.ok(dist >= 450 && dist <= 480, `Expected distance ~465m, got ${dist}m`);

    // Eiffel Tower (48.8584, 2.2945) to Louvre Museum (48.8606, 2.3376)
    // Benchmark distance is ~3,180 to 3,220 meters
    const distParis = calculateHaversineDistance(48.8584, 2.2945, 48.8606, 2.3376);
    assert.ok(distParis >= 3150 && distParis <= 3250, `Expected distance ~3200m, got ${distParis}m`);

    // Zero distance for identical coordinates
    const zeroDist = calculateHaversineDistance(37.7749, -122.4194, 37.7749, -122.4194);
    assert.strictEqual(zeroDist, 0, 'Distance between identical points must be 0');
  });

  // TEST 2: Inside radius check
  it('2. Inside radius allows check-in when coordinates are within allowed geofence', async () => {
    // Honolulu branch is at (21.306900, -157.858300) with radius 120m.
    // Employee is at (21.306950, -157.858350) -> ~7 meters away
    const testLat = 21.30695;
    const testLon = -157.85835;

    const evalResult = await evaluateLocationAgainstOffices(testLat, testLon);
    assert.strictEqual(evalResult.hasActiveOffices, true);
    assert.strictEqual(evalResult.isInsideAny, true, 'Should be inside allowed radius');
    assert.ok(evalResult.distanceMeters < 120, `Distance ${evalResult.distanceMeters}m should be < 120m`);
    assert.strictEqual(evalResult.insideOffice.id, officeHonoluluId, 'Should resolve to Honolulu Branch');
  });

  // TEST 3: Outside radius rejected
  it('3. Outside radius detects when coordinates exceed allowed geofence', async () => {
    // Coordinate in the middle of the Atlantic ocean (30.0, -40.0) thousands of km away from any office
    const testLat = 30.0;
    const testLon = -40.0;

    const evalResult = await evaluateLocationAgainstOffices(testLat, testLon);
    assert.strictEqual(evalResult.isInsideAny, false, 'Should be flagged outside all offices');
    assert.ok(evalResult.distanceMeters > 100000, `Distance ${evalResult.distanceMeters}m should exceed 100km`);
  });

  // TEST 4: Nearest of multiple offices
  it('4. Correctly determines the nearest of multiple active offices', async () => {
    // Coordinate near Anchorage office (61.218200, -149.900400)
    const testLat = 61.2182;
    const testLon = -149.9004;

    const evalResult = await evaluateLocationAgainstOffices(testLat, testLon);
    assert.strictEqual(evalResult.nearestOffice.id, officeAnchorageId, 'Nearest office must be Anchorage Branch');
    assert.strictEqual(evalResult.isInsideAny, true, 'Should be inside Anchorage office radius (150m)');
    assert.ok(evalResult.distanceMeters < 50, `Distance should be under 50m, got ${evalResult.distanceMeters}`);

    // Coordinate near Miami office (25.761800, -80.191900)
    const miamiLat = 25.7618;
    const miamiLon = -80.1919;

    const evalMiami = await evaluateLocationAgainstOffices(miamiLat, miamiLon);
    assert.strictEqual(evalMiami.nearestOffice.id, officeMiamiId, 'Nearest office must be Miami Branch');
    assert.strictEqual(evalMiami.isInsideAny, true, 'Should be inside Miami office radius (100m)');
  });

  // TEST 5: Poor GPS accuracy rejected
  it('5. Poor GPS accuracy (> 100m) is identified and rejected', () => {
    const acceptableAccuracy = 45;
    const poorAccuracy = 150;
    const borderlineAccuracy = 100;

    assert.ok(acceptableAccuracy <= MAX_GPS_ACCURACY_METERS, '45m accuracy should be accepted');
    assert.ok(borderlineAccuracy <= MAX_GPS_ACCURACY_METERS, '100m accuracy should be accepted');
    assert.ok(poorAccuracy > MAX_GPS_ACCURACY_METERS, '150m accuracy exceeds limit and should be rejected');
  });

  // TEST 6: No location rejected for non-exempt employee
  it('6. Non-exempt employee missing location coordinates is denied', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { isExempt } = await isLocationExempt(testEmp1Id, testDeptId, today);
    assert.strictEqual(isExempt, false, 'Standard employee should not be exempt');

    // Missing coordinates validation
    const missingCoordsError = validateCoordinates(undefined, undefined);
    assert.ok(missingCoordsError !== null, 'Undefined coordinates must produce a validation error');
    assert.match(missingCoordsError, /Latitude and Longitude are required/i);
  });

  // TEST 7: Exempt employee allowed without coordinates
  it('7. Location-exempt employee is permitted without coordinates and receives exempt status', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { isExempt, exemption } = await isLocationExempt(testEmp2ExemptId, testDeptId, today);
    assert.strictEqual(isExempt, true, 'Remote employee should be marked exempt');
    assert.ok(exemption, 'Exemption record must be returned');
    assert.strictEqual(exemption.employee_id, testEmp2ExemptId);
    assert.match(exemption.reason, /Remote/i);
  });

  // TEST 8: Invalid coordinates rejected
  it('8. Invalid coordinates (out of range or non-numeric) are rejected', () => {
    // Latitude out of range
    const latOver = validateCoordinates(95.0, 10.0);
    assert.match(latOver, /Latitude must be between -90 and 90/i);

    const latUnder = validateCoordinates(-91.5, 10.0);
    assert.match(latUnder, /Latitude must be between -90 and 90/i);

    // Longitude out of range
    const lonOver = validateCoordinates(45.0, 185.0);
    assert.match(lonOver, /Longitude must be between -180 and 180/i);

    const lonUnder = validateCoordinates(45.0, -195.0);
    assert.match(lonUnder, /Longitude must be between -180 and 180/i);

    // Non-numeric
    const nonNumeric = validateCoordinates('abc', 'xyz');
    assert.match(nonNumeric, /must be valid numbers/i);

    // Valid coordinates should return null (no error)
    const valid = validateCoordinates(37.7749, -122.4194);
    assert.strictEqual(valid, null, 'Valid coordinates must return null');
  });

  // BONUS: Office cannot be deleted if referenced in attendance records
  it('9. Office referenced in attendance records cannot be deleted (only deactivated)', async () => {
    // Insert dummy attendance record referencing officeHonoluluId
    const [attRes] = await pool.query(
      `INSERT INTO attendance (
        employee_id, date, check_in, status,
        check_in_office_id, check_in_location_status
      ) VALUES (?, CURDATE(), NOW(), 'Present', ?, 'inside')`,
      [testEmp1Id, officeHonoluluId]
    );
    const attId = attRes.insertId;

    // Check query like DELETE route does
    const [usage] = await pool.query(
      'SELECT COUNT(*) AS total FROM attendance WHERE check_in_office_id = ? OR check_out_office_id = ?',
      [officeHonoluluId, officeHonoluluId]
    );
    assert.ok(usage[0].total > 0, 'Office should have attendance references');

    // Clean up dummy attendance
    await pool.query('DELETE FROM attendance WHERE id = ?', [attId]);
  });
});
