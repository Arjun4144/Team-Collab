const router = require('express').Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Task = require('../models/Task');
const Decision = require('../models/Decision');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

router.get('/channel/:channelId', auth, async (req, res) => {
  try {
    // Verify membership
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const isMember = channel.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this channel' });

    const { page = 1, limit = 50, intent } = req.query;
    const query = { channel: req.params.channelId, threadParent: null, hiddenBy: { $ne: req.user._id } };
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
    const replies = await Message.find({ threadParent: req.params.id, hiddenBy: { $ne: req.user._id } })
      .sort({ createdAt: 1 })
      .populate('sender', 'name avatar email status');
    res.json(replies);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    let { channel, content, intentType, priority, threadParent, attachments } = req.body;
    content = content || '';
    
    console.log("attachments received:", attachments);

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
      readBy: [req.user._id],
      attachments: attachments || []
    });

    if (threadParent) {
      await Message.findByIdAndUpdate(threadParent, { $inc: { replyCount: 1 } });
    }

    // Auto-create task if intent is 'action'
    if (intentType === 'action' && content) {
      await Task.create({
        title: content.substring(0, 100),
        description: content,
        createdBy: req.user._id,
        channel, sourceMessage: message._id,
        priority: priority || 'normal'
      });
    }

    // Auto-log decision if intent is 'decision'
    if (intentType === 'decision' && content) {
      await Decision.create({
        title: content.substring(0, 100),
        body: content,
        owner: req.user._id,
        channel, sourceMessage: message._id
      });
    }

    await message.populate('sender', 'name avatar email status');

    if (content) {
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

router.patch('/channel/:channelId/read', auth, async (req, res) => {
  try {
    await Message.updateMany(
      { channel: req.params.channelId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/hide', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (!message.hiddenBy.includes(req.user._id)) {
      message.hiddenBy.push(req.user._id);
      await message.save();
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/channel/:channelId/clear', auth, async (req, res) => {
  try {
    await Message.updateMany(
      { channel: req.params.channelId },
      { $addToSet: { hiddenBy: req.user._id } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/channel/:channelId/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('Upload Error: req.file is undefined');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify membership
    const ch = await Channel.findById(req.params.channelId);
    if (!ch) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Channel not found' });
    }
    const isMember = ch.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'You are not a member of this channel' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const filename = req.file.originalname || req.file.filename;
    const size = req.file.size || 0;
    
    res.status(201).json({
      fileUrl,
      filename,
      size
    });
  } catch (err) {
    console.error('Upload Route Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/files/:filename', auth, async (req, res) => {
  try {
    const filename = req.params.filename;
    // Find message containing this file
    const message = await Message.findOne({
      $or: [
        { 'attachments.url': filename },
        { 'attachments.url': `/uploads/${filename}` }
      ]
    });
    if (!message) return res.status(404).json({ error: 'File not found' });
    
    // Verify channel membership
    const ch = await Channel.findById(message.channel);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    const isMember = ch.members.some(m => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Unauthorized to access this file' });
    
    const filePath = path.join(__dirname, '../uploads', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    
    res.sendFile(filePath);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/everyone', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    
    const channel = await Channel.findById(message.channel);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    
    // Check if user is admin
    const isAdmin = channel.admins.some(a => a.toString() === req.user._id.toString());
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can delete messages for everyone' });
    
    // If it has attachments, delete from disk
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach(att => {
        const actualFilename = att.url.startsWith('/uploads/') ? att.url.split('/').pop() : att.url;
        const filePath = path.join(__dirname, '../uploads', actualFilename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    await Message.findByIdAndDelete(req.params.id);
    
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channel._id}`).emit('message:deleted', { _id: message._id, channel: channel._id });
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/channel/:channelId/read', auth, async (req, res) => {
  try {
    await Message.updateMany(
      { channel: req.params.channelId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

module.exports = router;
