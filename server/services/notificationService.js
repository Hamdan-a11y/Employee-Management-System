const pool = require('../db');
const { sendAccountChangeNotificationEmail } = require('./mailer');
const { getIO, emitDataChanged } = require('../socket');

/**
 * Creates an in-app notification for a specific user, saves to DB,
 * emits real-time "notification:new" via Socket.IO, and optionally triggers email alert.
 * 
 * Supports both:
 * notifyUser(userId, { type, title, message, link, ... })
 * notifyUser({ userId, type, title, message, link, ... })
 */
const notifyUser = async (arg1, arg2 = {}) => {
  let userId, notification;
  if (typeof arg1 === 'object' && arg1 !== null) {
    userId = arg1.userId || arg1.user_id;
    notification = arg1;
  } else {
    userId = arg1;
    notification = arg2 || {};
  }

  const {
    type = 'system',
    title,
    message,
    link = null,
    sendEmail = false,
    emailDetails = null,
  } = notification;

  if (!userId || !title || !message) return null;

  try {
    // 1. Save to database first
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
      [userId, type, title, message, link]
    );

    const notificationId = result.insertId;

    const savedNotification = {
      id: notificationId,
      user_id: userId,
      type,
      title,
      message,
      link,
      is_read: 0,
      created_at: new Date().toISOString()
    };

    // 2. Emit real-time "notification:new" to user's private room
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('notification:new', savedNotification);
      }
    } catch (socketErr) {
      console.error('[Notification Service] Socket emit error:', socketErr.message);
    }

    // 3. Trigger email notification for account/security changes or when requested
    if (sendEmail || type === 'account' || type === 'security') {
      try {
        const [users] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
        if (users.length > 0 && users[0].email) {
          sendAccountChangeNotificationEmail({
            toEmail: users[0].email,
            userName: users[0].name,
            changeType: title,
            details: emailDetails || message,
          }).catch((err) => console.error('[Notification Email Error]:', err.message));
        }
      } catch (emailErr) {
        console.error('[Notification Service] Failed to lookup user for email notification:', emailErr.message);
      }
    }

    return notificationId;
  } catch (error) {
    console.error('[Notification Service] Failed to create notification:', error.message);
    return null;
  }
};

/**
 * Finds user account linked to an employee_id and sends notification.
 */
const notifyEmployeeUser = async ({
  employeeId,
  type = 'profile',
  title,
  message,
  link = null,
  sendEmail = false,
  emailDetails = null,
}) => {
  if (!employeeId) return null;

  try {
    // 1. Check user linked by employee_id
    let [users] = await pool.query('SELECT id, name, email FROM users WHERE employee_id = ?', [employeeId]);

    // 2. Fallback: match by email in employees table
    if (users.length === 0) {
      const [emp] = await pool.query('SELECT email FROM employees WHERE id = ?', [employeeId]);
      if (emp.length > 0 && emp[0].email) {
        [users] = await pool.query('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER(?)', [emp[0].email]);
      }
    }

    if (users.length > 0) {
      return await notifyUser(users[0].id, {
        type,
        title,
        message,
        link: link || `/employees/${employeeId}`,
        sendEmail,
        emailDetails,
      });
    }
    return null;
  } catch (error) {
    console.error('[Notification Service] Error notifying employee user:', error.message);
    return null;
  }
};

/**
 * Notifies managers of a specific department.
 */
const notifyDepartmentManager = async ({
  departmentId,
  type = 'system',
  title,
  message,
  link = null,
}) => {
  if (!departmentId) return;
  try {
    const [managers] = await pool.query(
      "SELECT id FROM users WHERE role = 'department_manager' AND department_id = ?",
      [departmentId]
    );
    for (const mgr of managers) {
      await notifyUser(mgr.id, {
        type,
        title,
        message,
        link,
        sendEmail: false
      });
    }
  } catch (error) {
    console.error('[Notification Service] Error notifying department manager:', error.message);
  }
};

/**
 * Notifies all administrator accounts of important organizational or employee actions.
 */
const notifyAdmins = async ({
  type = 'system',
  title,
  message,
  link = null,
  excludeUserId = null,
}) => {
  try {
    let query = "SELECT id FROM users WHERE role = 'admin'";
    const params = [];
    if (excludeUserId) {
      query += ' AND id != ?';
      params.push(excludeUserId);
    }

    const [admins] = await pool.query(query, params);
    for (const admin of admins) {
      await notifyUser(admin.id, {
        type,
        title,
        message,
        link,
        sendEmail: false,
      });
    }
  } catch (error) {
    console.error('[Notification Service] Error notifying admins:', error.message);
  }
};

/**
 * Retrieves notifications for a user along with pagination metadata and unread count.
 */
const getNotifications = async ({
  userId,
  page = 1,
  limit = 20,
  unreadOnly = false,
  status = 'all',
  type = null,
}) => {
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly || status === 'unread') {
      whereClause += ' AND is_read = FALSE';
    }

    if (type && type !== 'all') {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM notifications ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const listQuery = `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [notifications] = await pool.query(listQuery, [...params, limitNum, offset]);

    const [unreadCountRows] = await pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    const unreadCount = unreadCountRows[0]?.unreadCount || 0;

    return {
      notifications,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      unreadCount,
    };
  } catch (error) {
    console.error('[Notification Service] Failed to get notifications:', error.message);
    throw error;
  }
};

/**
 * Gets the current unread notifications count for a user.
 */
const getUnreadCount = async (userId) => {
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    return rows[0]?.unreadCount || 0;
  } catch (error) {
    console.error('[Notification Service] Failed to get unread count:', error.message);
    throw error;
  }
};

/**
 * Marks a single notification as read.
 */
const markNotificationAsRead = async ({ notificationId, userId }) => {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('[Notification Service] Failed to mark notification as read:', error.message);
    throw error;
  }
};

/**
 * Marks all notifications for a user as read.
 */
const markAllNotificationsAsRead = async ({ userId }) => {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    return result.affectedRows;
  } catch (error) {
    console.error('[Notification Service] Failed to mark all as read:', error.message);
    throw error;
  }
};

/**
 * Deletes a single notification.
 */
const deleteNotification = async ({ notificationId, userId }) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('[Notification Service] Failed to delete notification:', error.message);
    throw error;
  }
};

/**
 * Deletes all read notifications for a user.
 */
const clearReadNotifications = async ({ userId }) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE',
      [userId]
    );
    return result.affectedRows;
  } catch (error) {
    console.error('[Notification Service] Failed to clear read notifications:', error.message);
    throw error;
  }
};

module.exports = {
  notifyUser,
  notifyEmployeeUser,
  notifyDepartmentManager,
  notifyAdmins,
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
  emitDataChanged,
};
