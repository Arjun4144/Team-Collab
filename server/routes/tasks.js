const router = require('express').Router();
const Task = require('../models/Task');
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
    const task = await Task.create({ ...req.body, createdBy: req.user._id });
    await task.populate('assignee', 'name avatar email');
    await task.populate('createdBy', 'name');
    res.status(201).json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.status === 'done') update.completedAt = new Date();
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignee', 'name avatar email')
      .populate('createdBy', 'name');
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
