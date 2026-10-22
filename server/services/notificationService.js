const pool = require('../db');
const { sendAccountChangeNotificationEmail } = require('./mailer');

/**
 * Creates an in-app notification for a specific user and optionally triggers an email alert.
 */
const notifyUser = async ({
  userId,
  type = 'system', // 'account' | 'profile' | 'security' | 'system'
  title,
  message,
  link = null,
  sendEmail = false,
  emailDetails = null,
}) => {
  if (!userId || !title || !message) return null;

  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, link]
    );

    const notificationId = result.insertId;

    // Trigger email notification for account/security changes or when requested
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
      return await notifyUser({
        userId: users[0].id,
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
      await notifyUser({
        userId: admin.id,
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
 * Retrieves notifications for a user along with unread count.
 */
const getNotifications = async ({ userId, limit = 20, unreadOnly = false }) => {
  try {
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit) || 20);

    const [notifications] = await pool.query(query, params);

    const [unreadCountRows] = await pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    return {
      notifications,
      unreadCount: unreadCountRows[0]?.unreadCount || 0,
    };
  } catch (error) {
    console.error('[Notification Service] Failed to get notifications:', error.message);
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
  notifyAdmins,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
};
