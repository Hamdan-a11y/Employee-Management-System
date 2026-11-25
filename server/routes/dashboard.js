const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getDashboardStats } = require('../services/dashboardStatsService');

router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    const stats = await getDashboardStats({
      user: req.user,
      filters: req.query
    });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard statistics.', error: error.message });
  }
});

module.exports = router;
