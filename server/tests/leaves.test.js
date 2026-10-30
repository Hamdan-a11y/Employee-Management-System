const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeRequest, loginAsAdmin, loginAsEmployee, runTestQuery } = require('./helpers');

describe('Feature 17: Leave Request & Approval Workflow Tests', () => {
  let admin;
  let employee;
  let testEmpId;
  let testRequestId;

  it('should authenticate Admin and Employee users and prepare test state', async () => {
    admin = await loginAsAdmin();
    assert.ok(admin.cookies);

    employee = await loginAsEmployee();
    assert.ok(employee.cookies);
    testEmpId = employee.user.employee_id;
    assert.ok(testEmpId, 'Employee user must be linked to an employee_id');

    // Clean up test data for this employee to keep test run idempotent
    await runTestQuery('DELETE FROM leave_requests WHERE employee_id = ?', [testEmpId]);
    await runTestQuery('DELETE FROM leave_balances WHERE employee_id = ?', [testEmpId]);
  });

  it('GET /api/leaves/balances should auto-initialize and return leave balances', async () => {
    const res = await makeRequest('GET', '/leaves/balances', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.employeeId, testEmpId);
    assert.strictEqual(res.data.annual.total, 15);
    assert.strictEqual(res.data.annual.used, 0);
    assert.strictEqual(res.data.annual.remaining, 15);
    assert.strictEqual(res.data.sick.total, 10);
    assert.strictEqual(res.data.sick.remaining, 10);
    assert.strictEqual(res.data.casual.total, 5);
    assert.strictEqual(res.data.casual.remaining, 5);
    assert.strictEqual(res.data.totalAllocated, 30);
    assert.strictEqual(res.data.totalRemaining, 30);
  });

  it('POST /api/leaves/requests should reject invalid payloads', async () => {
    // Missing fields
    const res1 = await makeRequest('POST', '/leaves/requests', {
      leave_type: '',
      start_date: '',
      end_date: '',
      reason: '',
    }, employee.cookies, employee.headers);
    assert.strictEqual(res1.statusCode, 400);

    // End date before start date
    const res2 = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Annual',
      start_date: '2026-11-10',
      end_date: '2026-11-05',
      reason: 'Vacation trip',
    }, employee.cookies, employee.headers);
    assert.strictEqual(res2.statusCode, 400);
    assert.match(res2.data.message, /start date cannot be after end date/i);

    // Invalid leave type
    const res3 = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'UnknownType',
      start_date: '2026-11-01',
      end_date: '2026-11-03',
      reason: 'Personal',
    }, employee.cookies, employee.headers);
    assert.strictEqual(res3.statusCode, 400);
    assert.match(res3.data.message, /invalid leave type/i);
  });

  it('POST /api/leaves/requests should reject submission when requested days exceed available balance', async () => {
    // Casual balance is 5; requesting 10 days (Nov 1 to Nov 10 inclusive = 10 days)
    const res = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Casual',
      start_date: '2026-11-01',
      end_date: '2026-11-10',
      reason: 'Family urgent trip',
    }, employee.cookies, employee.headers);

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /insufficient leave balance/i);
  });

  it('POST /api/leaves/requests should successfully create a valid leave request', async () => {
    // Request 3 days of Annual leave: Nov 02 to Nov 04 (3 days)
    const res = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Annual',
      start_date: '2026-11-02',
      end_date: '2026-11-04',
      reason: 'Family wedding ceremony',
    }, employee.cookies, employee.headers);

    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data.requestId);
    assert.strictEqual(res.data.days_count, 3);
    testRequestId = res.data.requestId;
  });

  it('POST /api/leaves/requests should PREVENT overlapping leave requests', async () => {
    // Overlapping window 1: starts inside previous request (Nov 03 to Nov 06)
    const res1 = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Sick',
      start_date: '2026-11-03',
      end_date: '2026-11-06',
      reason: 'Medical rest',
    }, employee.cookies, employee.headers);
    assert.strictEqual(res1.statusCode, 400);
    assert.match(res1.data.message, /overlapping leave request detected/i);

    // Overlapping window 2: encompasses previous request (Nov 01 to Nov 05)
    const res2 = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Casual',
      start_date: '2026-11-01',
      end_date: '2026-11-05',
      reason: 'Personal work',
    }, employee.cookies, employee.headers);
    assert.strictEqual(res2.statusCode, 400);
    assert.match(res2.data.message, /overlapping leave request detected/i);
  });

  it('GET /api/leaves/requests should list requests scoped to employee', async () => {
    const res = await makeRequest('GET', '/leaves/requests', null, employee.cookies);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.requests));
    assert.strictEqual(res.data.pagination.total >= 1, true);

    const found = res.data.requests.find((r) => r.id === testRequestId);
    assert.ok(found);
    assert.strictEqual(found.employee_id, testEmpId);
    assert.strictEqual(found.status, 'PENDING');
    assert.strictEqual(found.days_count, 3);
  });

  it('PATCH /api/leaves/requests/:id/approve should forbid regular employee', async () => {
    const res = await makeRequest('PATCH', `/leaves/requests/${testRequestId}/approve`, {}, employee.cookies, employee.headers);
    assert.strictEqual(res.statusCode, 403);
  });

  it('PATCH /api/leaves/requests/:id/approve should allow admin to approve and deduct balance', async () => {
    const res = await makeRequest('PATCH', `/leaves/requests/${testRequestId}/approve`, {}, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.status, 'APPROVED');

    // Verify balance deduction in leave_balances
    const balRes = await makeRequest('GET', `/leaves/balances?employee_id=${testEmpId}`, null, admin.cookies);
    assert.strictEqual(balRes.statusCode, 200);
    assert.strictEqual(balRes.data.annual.used, 3);
    assert.strictEqual(balRes.data.annual.remaining, 12);
  });

  it('PATCH /api/leaves/requests/:id/approve should reject re-approval of non-pending request', async () => {
    const res = await makeRequest('PATCH', `/leaves/requests/${testRequestId}/approve`, {}, admin.cookies, admin.headers);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.data.message, /already been approved/i);
  });

  it('POST /api/leaves/requests and PATCH reject should handle manager rejection without balance deduction', async () => {
    // Submit second leave request for Nov 10 to Nov 11 (2 days of Sick leave)
    const subRes = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Sick',
      start_date: '2026-11-10',
      end_date: '2026-11-11',
      reason: 'Dental surgery follow-up',
    }, employee.cookies, employee.headers);

    assert.strictEqual(subRes.statusCode, 201);
    const rejReqId = subRes.data.requestId;

    // Admin rejects with reason
    const rejRes = await makeRequest('PATCH', `/leaves/requests/${rejReqId}/reject`, {
      rejection_reason: 'Major project deployment milestone scheduled for this date.',
    }, admin.cookies, admin.headers);

    assert.strictEqual(rejRes.statusCode, 200);
    assert.strictEqual(rejRes.data.status, 'REJECTED');

    // Verify Sick balance was NOT deducted
    const balRes = await makeRequest('GET', `/leaves/balances?employee_id=${testEmpId}`, null, admin.cookies);
    assert.strictEqual(balRes.statusCode, 200);
    assert.strictEqual(balRes.data.sick.used, 0);
    assert.strictEqual(balRes.data.sick.remaining, 10);

    // Verify rejection reason is persisted
    const rows = await runTestQuery('SELECT status, rejection_reason FROM leave_requests WHERE id = ?', [rejReqId]);
    assert.strictEqual(rows[0].status, 'REJECTED');
    assert.match(rows[0].rejection_reason, /deployment milestone/i);
  });

  it('DELETE /api/leaves/requests/:id should allow employee to cancel their pending leave request', async () => {
    // Submit third leave request for Nov 20 to Nov 21 (2 days of Casual leave)
    const subRes = await makeRequest('POST', '/leaves/requests', {
      leave_type: 'Casual',
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      reason: 'Personal travel plans',
    }, employee.cookies, employee.headers);

    assert.strictEqual(subRes.statusCode, 201);
    const cancelReqId = subRes.data.requestId;

    // Employee cancels
    const delRes = await makeRequest('DELETE', `/leaves/requests/${cancelReqId}`, null, employee.cookies, employee.headers);
    assert.strictEqual(delRes.statusCode, 200);
    assert.match(delRes.data.message, /cancelled successfully/i);

    // Verify record is gone
    const checkRows = await runTestQuery('SELECT id FROM leave_requests WHERE id = ?', [cancelReqId]);
    assert.strictEqual(checkRows.length, 0);
  });
});
