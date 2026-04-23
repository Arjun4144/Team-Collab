const router = require('express').Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('-password');
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/me', auth, async (req, res) => {
  try {
    const { name, avatar, status } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { ...(name && { name }), ...(avatar && { avatar }), ...(status && { status }) },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
