const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, JWT_SECRET } = require('../middleware/auth');

const signToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  try {
    let { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    name = name.trim();
    email = email.trim().toLowerCase();
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered' });
    
    const user = await User.create({ name, email, password });
    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    
    email = email.trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Safety guard: normalize legacy avatar before save to prevent MongoDB sub-path update crashes
    if (typeof user.avatar === 'string' || user.avatar === null || user.avatar === undefined) {
      const avatarObj = { 
        url: (typeof user.avatar === 'string' && user.avatar.startsWith('http')) ? user.avatar : '', 
        public_id: '' 
      };
      await User.updateOne({ _id: user._id }, { $set: { avatar: avatarObj } });
      user.avatar = avatarObj;
    }
    user.status = 'online';
    await user.save();
    const token = signToken(user._id);
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await User.findByIdAndUpdate(req.user._id, { status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
