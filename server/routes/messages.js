const router = require('express').Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    // Verify membership
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const isMember = channel.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });

    const { page = 1, limit = 50, intent } = req.query;
    const query = { channel: req.params.channelId, threadParent: null };
    if (intent) query.intentType = intent;
    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('sender', 'name avatar email status')
      .populate({ path: 'threadParent', populate: { path: 'sender', select: 'name' } });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/thread', auth, async (req, res) => {
  try {
    const replies = await Message.find({ threadParent: req.params.id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name avatar email status');
    res.json(replies);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { channel, content, intentType, priority, threadParent } = req.body;
    // Verify membership
    const ch = await Channel.findById(channel);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    const isMember = ch.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });
    const message = await Message.create({
      channel, content, intentType: intentType || 'discussion',
      priority: priority || 'normal',
      sender: req.user._id,
      threadParent: threadParent || null,
      readBy: [req.user._id]
    });

    if (threadParent) {
      await Message.findByIdAndUpdate(threadParent, { $inc: { replyCount: 1 } });
    }

    // Auto-create task if intent is 'action'
    if (intentType === 'action') {
      await Task.create({
        title: content.substring(0, 100),
        description: content,
        createdBy: req.user._id,
        channel, sourceMessage: message._id,
        priority: priority || 'normal'
      });
    }

    // Auto-log decision if intent is 'decision'
    if (intentType === 'decision') {
      await Decision.create({
        title: content.substring(0, 100),
        body: content,
        owner: req.user._id,
        channel, sourceMessage: message._id
      });
    }

    await message.populate('sender', 'name avatar email status');

    const mentionRegex = /@(\w+)/g;
    const mentions = [...content.matchAll(mentionRegex)].map(m => m[1].toLowerCase());
    if (mentions.length > 0) {
      // Find all users in the channel first to optimize
      const allUsers = await User.find({ _id: { $in: ch.members } });
      // Filter those whose space-stripped name matches a mention
      const mentionedUsers = allUsers.filter(u => 
        mentions.includes(u.name.replace(/\s+/g, '').toLowerCase())
      );
      
      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      
      mentionedUsers.forEach(u => {
        // Only notify if they are a member of the channel AND not the sender
        const isUserMember = ch.members.some(memberId => memberId.toString() === u._id.toString());
        if (isUserMember && u._id.toString() !== req.user._id.toString()) {
          const socketId = onlineUsers.get(u._id.toString());
          if (socketId && io) {
            io.to(socketId).emit('notification:mention', {
              message: `${req.user.name} mentioned you in a message`,
              channelId: channel,
              messageId: message._id
            });
          }
        }
      });
    }

    res.status(201).json(message);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/resolve', auth, async (req, res) => {
  try {
    const { verdict } = req.body;
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { isResolved: true, verdict },
      { new: true }
    ).populate('sender', 'name avatar');
    res.json(message);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.id, { $addToSet: { readBy: req.user._id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
