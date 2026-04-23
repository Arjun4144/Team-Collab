const router = require('express').Router();
const Channel = require('../models/Channel');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const channels = await Channel.find({
      $or: [{ type: 'public' }, { members: req.user._id }],
      isArchived: false
    }).populate('members', 'name email avatar status').populate('createdBy', 'name');
    res.json(channels);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, type, members } = req.body;
    const channel = await Channel.create({
      name, description, type: type || 'public',
      createdBy: req.user._id,
      members: [...new Set([req.user._id.toString(), ...(members || [])])]
    });
    await channel.populate('members', 'name email avatar status');
    res.status(201).json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('members', 'name email avatar status role')
      .populate('createdBy', 'name email');
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/join', auth, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { members: req.user._id } },
      { new: true }
    ).populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
