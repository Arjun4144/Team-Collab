const router = require('express').Router();
const Workspace = require('../models/Workspace');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const { auth } = require('../middleware/auth');

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
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers) {
      workspace.members.forEach(member => {
        const socketId = onlineUsers.get(member._id.toString());
        if (socketId) io.to(socketId).emit('workspace:updated', workspace);
      });
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
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers) {
      workspace.members.forEach(memberId => {
        const socketId = onlineUsers.get(memberId.toString());
        if (socketId) io.to(socketId).emit('workspace:deleted', workspace._id);
      });
    }

    res.json({ success: true, message: 'Workspace deleted successfully' });
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
    
    workspace.generateInviteCode();
    await workspace.save();
    res.json({ inviteCode: workspace.inviteCode, inviteLink: `/invite/${workspace.inviteCode}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// JOIN via invite code — any authenticated user
router.post('/join/:inviteCode', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findOne({ inviteCode: req.params.inviteCode });
    if (!workspace) return res.status(404).json({ error: 'Invalid or expired invite link' });
    
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
    res.json({ workspace, alreadyMember: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
