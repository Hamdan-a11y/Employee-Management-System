const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
} = require('../services/notificationService');

// All notification endpoints require authenticated user session
router.use(authenticateToken);

// GET /api/notifications/unread-count - Get user's unread count
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await getUnreadCount(req.user.id);
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unread notification count.', error: error.message });
  }
});

// GET /api/notifications - List user's notifications (paginated, filter by all/unread/type)
router.get('/', async (req, res) => {
  try {
    const { page, limit, status, unreadOnly, type } = req.query;
    const result = await getNotifications({
      userId: req.user.id,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
      status: status || (unreadOnly === 'true' ? 'unread' : 'all'),
      type: type || null,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.', error: error.message });
  }
});

// PATCH /api/notifications/read-all - Mark all as read for current user
router.patch('/read-all', async (req, res) => {
  try {
    const affected = await markAllNotificationsAsRead({ userId: req.user.id });
    res.json({ message: 'All notifications marked as read.', updatedCount: affected });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark notifications as read.', error: error.message });
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const notificationId = parseInt(id, 10);
    if (isNaN(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID.' });
    }

    const success = await markNotificationAsRead({
      notificationId,
      userId: req.user.id,
    });

    if (!success) {
      return res.status(404).json({ message: 'Notification not found or access denied.' });
    }

    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notification.', error: error.message });
  }
});

// DELETE /api/notifications - Clear all read notifications for current user
router.delete('/', async (req, res) => {
  try {
    const affected = await clearReadNotifications({ userId: req.user.id });
    res.json({ message: 'Read notifications cleared.', deletedCount: affected });
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear read notifications.', error: error.message });
  }
});

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const notificationId = parseInt(id, 10);
    if (isNaN(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID.' });
    }

    const success = await deleteNotification({
      notificationId,
      userId: req.user.id,
    });

    if (!success) {
      return res.status(404).json({ message: 'Notification not found or access denied.' });
    }

    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete notification.', error: error.message });
  }
});

module.exports = router;
