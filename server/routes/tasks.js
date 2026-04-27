const router = require('express').Router();
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const Channel = require('../models/Channel');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { channel, status, assignee } = req.query;
    const q = {};
    if (channel) q.channel = channel;
    if (status) q.status = status;
    if (assignee) q.assignee = assignee;
    const tasks = await Task.find(q)
      .sort({ createdAt: -1 })
      .populate('assignee', 'name avatar email')
      .populate('createdBy', 'name')
      .populate('channel', 'name');
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const taskData = { ...req.body, createdBy: req.user._id };
    if (taskData.assignee === '') delete taskData.assignee;
    
    const task = await Task.create(taskData);
    await task.populate('assignee', 'name avatar email');
    await task.populate('createdBy', 'name');
    
    // Notify assignee if not the creator
    if (req.body.assignee && req.body.assignee !== req.user._id.toString()) {
      try {
        const channelDoc = await Channel.findById(req.body.channel);
        const notif = await Notification.create({
          userId: req.body.assignee,
          type: 'task_assigned',
          title: 'New Task Assigned',
          body: `Task assigned to you`,
          workspaceId: channelDoc ? channelDoc.workspaceId : null,
          channelId: req.body.channel,
          referenceId: task._id
        });
        const io = req.app.get('io');
        if (io) io.to(req.body.assignee).emit('notification:new', notif);
      } catch (err) { console.error('Error creating notification', err); }
    }
    
    const io = req.app.get('io');
    if (io && task.channel) {
      io.to(`channel:${task.channel}`).emit('task:new', task);
    }
    
    res.status(201).json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const update = { ...req.body };
    const unset = {};
    if (update.assignee === '') {
      delete update.assignee;
      unset.assignee = 1;
    }
    if (update.status === 'done') update.completedAt = new Date();
    
    const task = await Task.findByIdAndUpdate(req.params.id, { $set: update, $unset: unset }, { new: true })
      .populate('assignee', 'name avatar email')
      .populate('createdBy', 'name');

    if (update.assignee && update.assignee !== req.user._id.toString()) {
      try {
        const notif = await Notification.create({
          userId: update.assignee,
          type: 'task_assigned',
          title: 'Task Assigned',
          body: `Task assigned to you`,
          workspaceId: task.channel.workspaceId || task.channel,
          channelId: task.channel._id || task.channel,
          referenceId: task._id
        });
        const io = req.app.get('io');
        if (io) io.to(update.assignee).emit('notification:new', notif);
      } catch (err) { console.error('Error creating notification', err); }
    }
      
    const io = req.app.get('io');
    if (io && task.channel) {
      io.to(`channel:${task.channel}`).emit('task:updated', task);
    }
    
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (task) {
      const io = req.app.get('io');
      if (io && task.channel) {
        io.to(`channel:${task.channel}`).emit('task:deleted', { taskId: task._id });
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
