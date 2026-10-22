const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearReadNotifications,
} = require('../services/notificationService');

// All notification endpoints require authenticated user session
router.use(authenticateToken);

// GET /api/notifications - List user's notifications and unread count
router.get('/', async (req, res) => {
  try {
    const { limit, unreadOnly } = req.query;
    const result = await getNotifications({
      userId: req.user.id,
      limit: limit ? parseInt(limit, 10) : 25,
      unreadOnly: unreadOnly === 'true',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.', error: error.message });
  }
});

// PATCH /api/notifications/read-all - Mark all as read
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
    const success = await markNotificationAsRead({
      notificationId: parseInt(id, 10),
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

// DELETE /api/notifications - Clear all read notifications
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
    const success = await deleteNotification({
      notificationId: parseInt(id, 10),
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
