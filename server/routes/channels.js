const router = require('express').Router();
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const { auth } = require('../middleware/auth');

// Helper to check if a user is an admin of a channel
const isChannelAdmin = (channel, userId) => {
  return channel.admins.some(adminId => adminId.toString() === userId.toString());
};

// GET all channels the current user is a member of
router.get('/', auth, async (req, res) => {
  try {
    const channels = await Channel.find({
      members: req.user._id,
      isArchived: false
    }).populate('members', 'name email avatar status').populate('createdBy', 'name');
    res.json(channels);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE a new channel (creator is auto-added as member and admin)
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, members } = req.body;
    const channel = await Channel.create({
      name, description, type: 'private',
      createdBy: req.user._id,
      members: [...new Set([req.user._id.toString(), ...(members || [])])],
      admins: [req.user._id]
    });
    await channel.populate('members', 'name email avatar status');
    res.status(201).json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single channel — membership required
router.get('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('members', 'name email avatar status role')
      .populate('createdBy', 'name email');
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const isMember = channel.members.some(m => m._id.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GENERATE invite link — channel admin only
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can generate invites' });
    
    channel.generateInviteCode();
    await channel.save();
    res.json({ inviteCode: channel.inviteCode, inviteLink: `/invite/${channel.inviteCode}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// JOIN via invite code — any authenticated user
router.post('/join/:inviteCode', auth, async (req, res) => {
  try {
    const channel = await Channel.findOne({ inviteCode: req.params.inviteCode, isArchived: false });
    if (!channel) return res.status(404).json({ error: 'Invalid or expired invite link' });
    
    const alreadyMember = channel.members.some(m => m.toString() === req.user._id.toString());
    if (alreadyMember) {
      await channel.populate('members', 'name email avatar status');
      return res.json({ channel, alreadyMember: true });
    }
    
    channel.members.push(req.user._id);
    await channel.save();
    await channel.populate('members', 'name email avatar status');
    res.json({ channel, alreadyMember: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RENAME / UPDATE channel — channel admin only
router.patch('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can modify the channel' });
    
    const { name, description } = req.body;
    if (name) channel.name = name;
    if (description !== undefined) channel.description = description;
    await channel.save();
    await channel.populate('members', 'name email avatar status');

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers) {
      channel.members.forEach(member => {
        const socketId = onlineUsers.get(member._id.toString());
        if (socketId) io.to(socketId).emit('channel:updated', channel);
      });
    }

    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE channel — channel admin only (cascade deletes)
router.delete('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can delete the channel' });
    
    // Cascade deletes
    await Promise.all([
      Message.deleteMany({ channel: channel._id }),
      Task.deleteMany({ channel: channel._id }),
      Decision.deleteMany({ channel: channel._id }),
      Channel.findByIdAndDelete(channel._id)
    ]);

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers) {
      channel.members.forEach(memberId => {
        const socketId = onlineUsers.get(memberId.toString());
        if (socketId) io.to(socketId).emit('channel:deleted', channel._id);
      });
    }

    res.json({ success: true, message: 'Channel deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REMOVE member — channel admin only
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can remove members' });
    
    // Cannot remove yourself this way (admins should delete or demote first, or leave route)
    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ error: 'Cannot kick yourself. Use the leave functionality.' });
    }

    channel.members = channel.members.filter(m => m.toString() !== req.params.userId);
    channel.admins = channel.admins.filter(a => a.toString() !== req.params.userId);
    await channel.save();
    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PROMOTE member to admin — channel admin only
router.post('/:id/admins/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can promote members' });
    
    if (!channel.admins.includes(req.params.userId)) {
      channel.admins.push(req.params.userId);
      await channel.save();
    }
    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DEMOTE admin to member — channel admin only
router.delete('/:id/admins/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isChannelAdmin(channel, req.user._id)) return res.status(403).json({ error: 'Only channel admins can demote members' });
    
    if (channel.admins.length <= 1 && channel.admins.includes(req.params.userId)) {
      return res.status(400).json({ error: 'Cannot demote the last admin of the channel.' });
    }

    channel.admins = channel.admins.filter(a => a.toString() !== req.params.userId);
    await channel.save();
    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
