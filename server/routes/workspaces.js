const router = require('express').Router();
const Workspace = require('../models/Workspace');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const { auth } = require('../middleware/auth');
const Invite = require('../models/Invite');
const crypto = require('crypto');

// Helper to check if a user is a workspace admin
const isWorkspaceAdmin = (workspace, userId) => {
  return workspace.admins.some(adminId => adminId.toString() === userId.toString());
};

// GET all workspaces the current user belongs to
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      members: req.user._id
    })
      .populate('members', 'name email avatar status')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // For each workspace, compute whether it has any unread channel
    const enriched = await Promise.all(workspaces.map(async (ws) => {
      const channels = await Channel.find({ workspaceId: ws._id, isArchived: false }).lean();
      let hasUnread = false;
      for (const ch of channels) {
        const count = await Message.countDocuments({
          channel: ch._id,
          readBy: { $ne: req.user._id },
          hiddenBy: { $ne: req.user._id }
        });
        if (count > 0) { hasUnread = true; break; }
      }
      return { ...ws, hasUnread };
    }));

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE a new workspace (creator is auto-added as member and admin)
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Workspace name is required' });

    const workspace = await Workspace.create({
      name: name.trim(),
      createdBy: req.user._id,
      members: [req.user._id],
      admins: [req.user._id]
    });

    // Auto-create a #general channel
    await Channel.create({
      name: 'general',
      description: 'General discussion',
      type: 'private',
      createdBy: req.user._id,
      members: [req.user._id],
      admins: [req.user._id],
      workspaceId: workspace._id
    });

    await workspace.populate('members', 'name email avatar status');
    await workspace.populate('createdBy', 'name email');
    res.status(201).json(workspace);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single workspace — membership required
router.get('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('members', 'name email avatar status')
      .populate('createdBy', 'name email');
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const isMember = workspace.members.some(m => m._id.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this workspace' });
    res.json(workspace);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE workspace (rename) — admin only
router.put('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!isWorkspaceAdmin(workspace, req.user._id)) {
      return res.status(403).json({ error: 'Only workspace admins can modify the workspace' });
    }

    const { name } = req.body;
    if (name) workspace.name = name.trim();
    await workspace.save();
    await workspace.populate('members', 'name email avatar status');
    await workspace.populate('createdBy', 'name email');

    // Broadcast to all members
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${workspace._id}`).emit('workspace:updated', workspace);
    }

    res.json(workspace);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE workspace — admin only (cascade deletes all channels, messages, tasks, decisions)
router.delete('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!isWorkspaceAdmin(workspace, req.user._id)) {
      return res.status(403).json({ error: 'Only workspace admins can delete the workspace' });
    }

    // Find all channels in this workspace
    const channels = await Channel.find({ workspaceId: workspace._id });
    const channelIds = channels.map(ch => ch._id);

    // Cascade deletes
    await Promise.all([
      Message.deleteMany({ channel: { $in: channelIds } }),
      Task.deleteMany({ channel: { $in: channelIds } }),
      Decision.deleteMany({ channel: { $in: channelIds } }),
      Channel.deleteMany({ workspaceId: workspace._id }),
      Workspace.findByIdAndDelete(workspace._id)
    ]);

    // Broadcast deletion to all members
    const io = req.app.get('io');
    if (io) {
      io.to(`workspace:${workspace._id}`).emit('workspace:deleted', workspace._id);
    }

    res.json({ success: true, message: 'Workspace deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// Helper to generate a short invite code
const generateInviteCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ... (existing helper and routes)

/**
 * @route   GET /api/workspaces/:id/members
 * @desc    Get all members of a specific workspace
 * @access  Private (Membership required)
 */
router.get('/:id/members', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id).populate('members', 'name email avatar status bio');
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    
    const isMember = workspace.members.some(m => m._id.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this workspace' });
    
    res.json(workspace.members);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GENERATE invite link — workspace admin only
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!isWorkspaceAdmin(workspace, req.user._id)) {
      return res.status(403).json({ error: 'Only workspace admins can generate invites' });
    }
    
    // Generate a unique short code
    let code;
    let isUnique = false;
    while (!isUnique) {
      code = generateInviteCode();
      const existing = await Invite.findOne({ code });
      if (!existing) isUnique = true;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await Invite.create({
      code,
      workspaceId: workspace._id,
      expiresAt,
      createdBy: req.user._id
    });

    res.json({ inviteCode: code, inviteLink: `/invite/${code}`, expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// JOIN via invite code — any authenticated user
router.post('/join/:inviteCode', auth, async (req, res) => {
  try {
    const invite = await Invite.findOne({ code: req.params.inviteCode });
    if (!invite) return res.status(404).json({ error: 'Invalid or missing invite code' });
    
    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invite link has expired' });
    }

    const workspace = await Workspace.findById(invite.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace no longer exists' });
    
    const alreadyMember = workspace.members.some(m => m.toString() === req.user._id.toString());
    if (alreadyMember) {
      await workspace.populate('members', 'name email avatar status');
      return res.json({ workspace, alreadyMember: true });
    }
    
    // Add user to workspace
    workspace.members.push(req.user._id);
    await workspace.save();

    // Add user to all channels in this workspace
    await Channel.updateMany(
      { workspaceId: workspace._id, isArchived: false },
      { $addToSet: { members: req.user._id } }
    );
    
    await workspace.populate('members', 'name email avatar status');

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    if (io) {
      const payload = {
        workspaceId: workspace._id,
        newUser: { _id: req.user._id, name: req.user.name, avatar: req.user.avatar, status: req.user.status },
        updatedMembers: workspace.members
      };
      io.to(`workspace:${workspace._id}`).emit('workspace:userJoined', payload);
    }

    res.json({ workspace, alreadyMember: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// LEAVE workspace
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const targetUserId = req.user._id.toString();

    if (workspace.createdBy.toString() === targetUserId) {
      return res.status(403).json({ error: 'Owner cannot leave the workspace. You must delete it instead.' });
    }

    workspace.members = workspace.members.filter(m => m.toString() !== targetUserId);
    workspace.admins = workspace.admins.filter(a => a.toString() !== targetUserId);
    await workspace.save();

    await Channel.updateMany(
      { workspaceId: workspace._id },
      { $pull: { members: targetUserId, admins: targetUserId } }
    );

    await workspace.populate('members', 'name email avatar status');

    const io = req.app.get('io');
    if (io) {
      const payload = {
        workspaceId: workspace._id,
        userId: targetUserId,
        updatedMembers: workspace.members
      };
      io.to(`workspace:${workspace._id}`).emit('workspace:userRemoved', payload);
      io.to(targetUserId).emit('workspace:userRemoved', payload);
    }

    res.json({ success: true, message: 'Left workspace successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
