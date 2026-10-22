const pool = require('../db');

/**
 * Records an immutable audit log entry in the database.
 * 
 * @param {Object} params
 * @param {Object} [params.req] - Express request object (extracts user and ip)
 * @param {number} [params.userId] - User ID who performed the action
 * @param {string} [params.userName] - Name of user who performed the action
 * @param {string} [params.userEmail] - Email of user who performed the action
 * @param {'CREATE' | 'UPDATE' | 'DELETE'} params.action - Action performed
 * @param {string} [params.entityType='EMPLOYEE'] - Type of entity involved
 * @param {number|null} [params.entityId] - ID of the entity involved
 * @param {string} params.employeeName - Name of the employee involved
 * @param {string} [params.details] - Additional contextual details
 * @param {string} [params.ipAddress] - IP address of the client
 */
async function logAudit({
  connection = null,
  req,
  userId,
  userName,
  userEmail,
  action,
  entityType = 'EMPLOYEE',
  entityId = null,
  employeeName,
  details = null,
  ipAddress = null
}) {
  try {
    const effectiveUserId = userId || req?.user?.id || null;
    const effectiveUserName = userName || req?.user?.name || 'System';
    const effectiveUserEmail = userEmail || req?.user?.email || 'system@ems.internal';
    const effectiveIp = ipAddress || req?.ip || req?.headers?.['x-forwarded-for'] || null;

    const query = `
      INSERT INTO audit_logs (
        user_id,
        user_name,
        user_email,
        action,
        entity_type,
        entity_id,
        employee_name,
        details,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const executor = connection || pool;
    await executor.query(query, [
      effectiveUserId,
      effectiveUserName,
      effectiveUserEmail,
      action,
      entityType,
      entityId,
      employeeName || 'Unknown Employee',
      details,
      effectiveIp
    ]);
  } catch (error) {
    // Non-blocking catch to ensure core employee operations succeed even if logging hits an issue
    console.error('[AuditLogger Warning] Failed to write audit log entry:', error.message);
  }
}

module.exports = {
  logAudit
};
