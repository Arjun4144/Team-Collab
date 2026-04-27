const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Notification = require('../models/Notification');

// Get all notifications for current user
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching notifications' });
  }
});

// Mark read
router.post('/mark-read', auth, async (req, res) => {
  try {
    const { notifIds } = req.body;
    const io = req.app.get('io');
    if (notifIds && Array.isArray(notifIds) && notifIds.length > 0) {
      await Notification.updateMany({ userId: req.user._id, _id: { $in: notifIds } }, { isRead: true });
      if (io) io.to(req.user._id.toString()).emit('notification:read_some', notifIds);
    } else {
      await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
      if (io) io.to(req.user._id.toString()).emit('notification:read_all');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error marking notifications read' });
  }
});

// Clear all notifications
router.post('/clear', auth, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    const io = req.app.get('io');
    if (io) io.to(req.user._id.toString()).emit('notification:cleared');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error clearing notifications' });
  }
});

// Delete specific notification
router.delete('/:id', auth, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    const io = req.app.get('io');
    if (io) io.to(req.user._id.toString()).emit('notification:deleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting notification' });
  }
});

module.exports = router;
