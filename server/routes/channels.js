const router = require('express').Router();
const Channel = require('../models/Channel');
const Workspace = require('../models/Workspace');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const { auth } = require('../middleware/auth');

// Helper to check if a user is an admin of a channel
const isChannelAdmin = (channel, userId) => {
  return channel.admins.some(adminId => adminId.toString() === userId.toString());
};

// Helper to check workspace membership
const checkWorkspaceMembership = async (workspaceId, userId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return { ok: false, status: 404, error: 'Workspace not found' };
  const isMember = workspace.members.some(m => m.toString() === userId.toString());
  if (!isMember) return { ok: false, status: 403, error: 'You are not a member of this workspace' };
  return { ok: true, workspace };
};

// GET channels for a workspace
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    const { ok, status, error } = await checkWorkspaceMembership(req.params.workspaceId, req.user._id);
    if (!ok) return res.status(status).json({ error });

    const channels = await Channel.find({
      workspaceId: req.params.workspaceId,
      isArchived: false
    }).populate('members', 'name email avatar status').populate('createdBy', 'name').lean();

    const channelsWithUnread = await Promise.all(channels.map(async (ch) => {
      const unreadCount = await Message.countDocuments({
        channel: ch._id,
        readBy: { $ne: req.user._id },
        hiddenBy: { $ne: req.user._id }
      });
      return { ...ch, unreadCount };
    }));

    res.json(channelsWithUnread);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET all channels the current user is a member of (backward compatible)
router.get('/', auth, async (req, res) => {
  try {
    const channels = await Channel.find({
      members: req.user._id,
      isArchived: false,
      workspaceId: { $ne: null }
    }).populate('members', 'name email avatar status').populate('createdBy', 'name').lean();

    const channelsWithUnread = await Promise.all(channels.map(async (ch) => {
      const unreadCount = await Message.countDocuments({
        channel: ch._id,
        readBy: { $ne: req.user._id },
        hiddenBy: { $ne: req.user._id }
      });
      return { ...ch, unreadCount };
    }));

    res.json(channelsWithUnread);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE a new channel inside a workspace (workspace admin only)
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, workspaceId } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    
    const isAdmin = workspace.admins.some(a => a.toString() === req.user._id.toString());
    if (!isAdmin) return res.status(403).json({ error: 'Only workspace admins can create channels' });

    const channel = await Channel.create({
      name, description, type: 'private',
      createdBy: req.user._id,
      members: workspace.members, // All workspace members get access
      admins: workspace.admins,
      workspaceId
    });
    await channel.populate('members', 'name email avatar status');

    // Broadcast to all workspace members
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers) {
      workspace.members.forEach(memberId => {
        const socketId = onlineUsers.get(memberId.toString());
        if (socketId) io.to(socketId).emit('channel:created', { channel, workspaceId });
      });
    }

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

// GENERATE invite link — channel admin only (kept for backward compat, but workspace invite is preferred)
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

// RENAME / UPDATE channel — workspace admin only
router.patch('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    
    // Check workspace admin status
    if (channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      if (workspace && !workspace.admins.some(a => a.toString() === req.user._id.toString())) {
        return res.status(403).json({ error: 'Only workspace admins can modify channels' });
      }
    } else if (!isChannelAdmin(channel, req.user._id)) {
      return res.status(403).json({ error: 'Only channel admins can modify the channel' });
    }
    
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

// DELETE channel — workspace admin only (cascade deletes)
router.delete('/:id', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Prevent deleting #general
    if (channel.name === 'general') {
      return res.status(400).json({ error: 'Cannot delete the #general channel' });
    }

    // Check workspace admin status
    if (channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      if (workspace && !workspace.admins.some(a => a.toString() === req.user._id.toString())) {
        return res.status(403).json({ error: 'Only workspace admins can delete channels' });
      }
    } else if (!isChannelAdmin(channel, req.user._id)) {
      return res.status(403).json({ error: 'Only channel admins can delete the channel' });
    }
    
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
        if (socketId) io.to(socketId).emit('channel:deleted', { channelId: channel._id, workspaceId: channel.workspaceId });
      });
    }

    res.json({ success: true, message: 'Channel deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REMOVE member — channel admin or workspace admin
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    
    // Authorization: channel admin or workspace admin
    let isAuthorized = isChannelAdmin(channel, req.user._id);
    if (!isAuthorized && channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      isAuthorized = workspace && workspace.admins.some(a => a.toString() === req.user._id.toString());
    }
    if (!isAuthorized) return res.status(403).json({ error: 'Only admins can remove members' });
    
    // Cannot remove yourself this way (admins should delete or demote first, or leave route)
    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ error: 'Cannot kick yourself. Use the leave functionality.' });
    }

    const targetUserId = req.params.userId;

    if (channel.workspaceId) {
      // 1. Remove from workspace
      const workspace = await Workspace.findById(channel.workspaceId);
      if (workspace) {
        const isTargetOwner = workspace.createdBy.toString() === targetUserId;
        if (isTargetOwner) return res.status(403).json({ error: 'Cannot remove the workspace owner.' });

        const isReqOwner = workspace.createdBy.toString() === req.user._id.toString();
        const isTargetAdmin = workspace.admins.some(a => a.toString() === targetUserId);

        if (isTargetAdmin && !isReqOwner) {
          return res.status(403).json({ error: 'Only the workspace owner can remove other admins.' });
        }

        workspace.members = workspace.members.filter(m => m.toString() !== targetUserId);
        workspace.admins = workspace.admins.filter(a => a.toString() !== targetUserId);
        await workspace.save();

        // 2. Remove from ALL channels in this workspace
        await Channel.updateMany(
          { workspaceId: workspace._id },
          { 
            $pull: { members: targetUserId, admins: targetUserId } 
          }
        );

        await workspace.populate('members', 'name email avatar status');

        // 3. Emit real-time sync event
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const payload = {
            workspaceId: workspace._id,
            userId: targetUserId,
            updatedMembers: workspace.members
          };
          
          // Tell everyone in the workspace that this user was removed
          workspace.members.forEach(member => {
            const socketId = onlineUsers.get(member._id.toString());
            if (socketId) io.to(socketId).emit('workspace:userRemoved', payload);
          });
          // Also explicitly tell the removed user if they are online
          const removedSocketId = onlineUsers.get(targetUserId);
          if (removedSocketId) {
            io.to(removedSocketId).emit('workspace:userRemoved', payload);
          }
        }
      }
    } else {
      // For non-workspace channels, just remove from channel
      channel.members = channel.members.filter(m => m.toString() !== targetUserId);
      channel.admins = channel.admins.filter(a => a.toString() !== targetUserId);
      await channel.save();
    }

    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PROMOTE member to admin — channel admin or workspace admin
router.post('/:id/admins/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    
    let isAuthorized = isChannelAdmin(channel, req.user._id);
    if (!isAuthorized && channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      isAuthorized = workspace && workspace.admins.some(a => a.toString() === req.user._id.toString());
    }
    if (!isAuthorized) return res.status(403).json({ error: 'Only admins can promote members' });
    
    const targetUserId = req.params.userId;

    if (channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      if (workspace && !workspace.admins.includes(targetUserId)) {
        workspace.admins.push(targetUserId);
        await workspace.save();

        await Channel.updateMany(
          { workspaceId: workspace._id },
          { $addToSet: { admins: targetUserId } }
        );

        await workspace.populate('members', 'name email avatar status');

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const payload = {
            workspaceId: workspace._id,
            userId: targetUserId,
            newRole: 'Admin',
            updatedMembers: workspace.members
          };
          workspace.members.forEach(member => {
            const socketId = onlineUsers.get(member._id.toString());
            if (socketId) io.to(socketId).emit('workspace:userRoleUpdated', payload);
          });
        }
      }
    } else {
      if (!channel.admins.includes(targetUserId)) {
        channel.admins.push(targetUserId);
        await channel.save();
      }
    }

    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DEMOTE admin to member — channel admin or workspace admin
router.delete('/:id/admins/:userId', auth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    let isAuthorized = isChannelAdmin(channel, req.user._id);
    if (!isAuthorized && channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      isAuthorized = workspace && workspace.admins.some(a => a.toString() === req.user._id.toString());
    }
    if (!isAuthorized) return res.status(403).json({ error: 'Only admins can demote members' });
    
    const targetUserId = req.params.userId;

    if (channel.workspaceId) {
      const workspace = await Workspace.findById(channel.workspaceId);
      if (workspace) {
        const isTargetOwner = workspace.createdBy.toString() === targetUserId;
        if (isTargetOwner) return res.status(403).json({ error: 'Cannot demote the workspace owner.' });

        const isReqOwner = workspace.createdBy.toString() === req.user._id.toString();
        const isTargetAdmin = workspace.admins.some(a => a.toString() === targetUserId);

        if (isTargetAdmin && !isReqOwner) {
          return res.status(403).json({ error: 'Only the workspace owner can demote admins.' });
        }

        if (workspace.admins.length <= 1 && workspace.admins.includes(targetUserId)) {
          return res.status(400).json({ error: 'Cannot demote the last admin of the workspace.' });
        }
        workspace.admins = workspace.admins.filter(a => a.toString() !== targetUserId);
        await workspace.save();

        await Channel.updateMany(
          { workspaceId: workspace._id },
          { $pull: { admins: targetUserId } }
        );

        await workspace.populate('members', 'name email avatar status');

        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const payload = {
            workspaceId: workspace._id,
            userId: targetUserId,
            newRole: 'Member',
            updatedMembers: workspace.members
          };
          workspace.members.forEach(member => {
            const socketId = onlineUsers.get(member._id.toString());
            if (socketId) io.to(socketId).emit('workspace:userRoleUpdated', payload);
          });
        }
      }
    } else {
      if (channel.admins.length <= 1 && channel.admins.includes(targetUserId)) {
        return res.status(400).json({ error: 'Cannot demote the last admin of the channel.' });
      }
      channel.admins = channel.admins.filter(a => a.toString() !== targetUserId);
      await channel.save();
    }

    await channel.populate('members', 'name email avatar status');
    res.json(channel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
