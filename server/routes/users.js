const router = require('express').Router();
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Channel = require('../models/Channel');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryHelper');


/**
 * @route   DELETE /api/users/:id
 * @desc    Completely delete a user and their references
 * @access  Private (Admin or Self)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const requesterId = req.user._id.toString();

    if (targetId !== requesterId) {
      return res.status(403).json({ error: 'Unauthorized to delete this user' });
    }

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 1. Cleanup Cloudinary if avatar exists
    if (user.avatar && user.avatar.public_id) {
      try { await deleteFromCloudinary(user.avatar.public_id); } catch (err) {}
    }

    // 2. Remove from all Workspaces (members and admins)
    await Workspace.updateMany(
      { $or: [{ members: targetId }, { admins: targetId }] },
      { $pull: { members: targetId, admins: targetId } }
    );

    // 3. Remove from all Channels (members and admins)
    await Channel.updateMany(
      { $or: [{ members: targetId }, { admins: targetId }] },
      { $pull: { members: targetId, admins: targetId } }
    );

    // 4. Cleanup Notifications
    await Notification.deleteMany({ userId: targetId });

    // 5. Cleanup Tasks (Unset assignee if matched)
    await Task.updateMany({ assignee: targetId }, { $unset: { assignee: "" } });

    // 6. Delete User
    await User.findByIdAndDelete(targetId);

    res.json({ success: true, message: 'User deleted and references cleaned up' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const requesterId = req.user._id;

    // 1. Get all workspaces where current user is a member
    const userWorkspaces = await Workspace.find({ members: requesterId });
    
    // 2. Collect all unique member IDs from those workspaces
    const memberIds = new Set();
    userWorkspaces.forEach(ws => {
      ws.members.forEach(id => memberIds.add(id.toString()));
    });
    
    // Always include self
    memberIds.add(requesterId.toString());

    // 3. Return only those users
    const users = await User.find({ 
      _id: { $in: Array.from(memberIds) },
      isActive: true 
    }).select('-password');

    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile (name, bio, avatar)
 * @access  Private
 */
router.put('/profile', auth, upload.single('avatar'), async (req, res) => {
  try {
    const { name, bio, removeAvatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;

    // Handle avatar removal
    if (removeAvatar === 'true' || removeAvatar === true) {
      if (user.avatar && user.avatar.public_id) {
        try {
          await deleteFromCloudinary(user.avatar.public_id);
        } catch (error) {
          console.error('Error deleting avatar during removal:', error);
        }
      }
      updates.avatar = { url: '', public_id: '' };
    } 
    // Handle new avatar upload
    else if (req.file) {
      // If user already has an avatar with a public_id, delete it from Cloudinary
      if (user.avatar && user.avatar.public_id) {
        try {
          await deleteFromCloudinary(user.avatar.public_id);
        } catch (error) {
          console.error('Error deleting old avatar:', error);
        }
      }

      // Upload new avatar
      const result = await uploadToCloudinary(req.file.buffer);
      updates.avatar = {
        url: result.url,
        public_id: result.public_id,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/me', auth, async (req, res) => {
  try {
    const { name, avatar, status, bio } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        ...(name && { name }), 
        ...(avatar && { avatar }), 
        ...(status && { status }),
        ...(bio && { bio })
      },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
