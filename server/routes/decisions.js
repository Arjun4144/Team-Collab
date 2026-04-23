const router = require('express').Router();
const Decision = require('../models/Decision');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { channel } = req.query;
    const q = channel ? { channel } : {};
    const decisions = await Decision.find(q)
      .sort({ createdAt: -1 })
      .populate('owner', 'name avatar email')
      .populate('channel', 'name');
    res.json(decisions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const decision = await Decision.create({ ...req.body, owner: req.user._id });
    await decision.populate('owner', 'name avatar email');
    res.status(201).json(decision);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/acknowledge', auth, async (req, res) => {
  try {
    const d = await Decision.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { acknowledgedBy: req.user._id } },
      { new: true }
    ).populate('owner', 'name avatar');
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
