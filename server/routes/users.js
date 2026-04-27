const router = require('express').Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryHelper');

router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('-password');
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
    const { name, bio } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;

    if (req.file) {
      // If user already has an avatar with a public_id, delete it from Cloudinary
      if (user.avatar && user.avatar.public_id) {
        try {
          await deleteFromCloudinary(user.avatar.public_id);
        } catch (error) {
          console.error('Error deleting old avatar:', error);
          // Continue even if deletion fails (maybe it was already deleted)
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
