const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Channel = require('../models/Channel');
const Workspace = require('../models/Workspace');
const { JWT_SECRET } = require('../middleware/auth');

const onlineUsers = new Map();

function initSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    onlineUsers.set(userId, socket.id);
    // Update DB status so fetchUsers() returns accurate data
    User.findByIdAndUpdate(userId, { status: 'online' }).catch(() => {});
    io.emit('user:online', { userId, status: 'online' });

    // Auto-join all channels the user is a member of
    Channel.find({ members: userId, isArchived: false }).then(channels => {
      channels.forEach(ch => socket.join(`channel:${ch._id}`));
    }).catch(() => {});

    // Auto-join all workspace rooms the user is a member of
    Workspace.find({ members: userId }).then(workspaces => {
      workspaces.forEach(ws => socket.join(`workspace:${ws._id}`));
    }).catch(() => {});

    socket.on('channel:join', async (channelId) => {
      // Keep for explicit joins when creating/joining new channels dynamically
      try {
        const channel = await Channel.findById(channelId);
        if (channel && channel.members.some(m => m.toString() === userId)) {
          socket.join(`channel:${channelId}`);
        }
      } catch {}
    });

    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on('workspace:join', async (workspaceId) => {
      try {
        const workspace = await Workspace.findById(workspaceId);
        if (workspace && workspace.members.some(m => m.toString() === userId)) {
          socket.join(`workspace:${workspaceId}`);
        }
      } catch {}
    });

    socket.on('message:send', (message) => {
      const channelId = message.channel?._id || message.channel;
      socket.to(`channel:${channelId}`).emit('message:new', message);
    });

    socket.on('message:resolve', (data) => {
      const channelId = data.channel?._id || data.channel;
      socket.to(`channel:${channelId}`).emit('message:resolved', data);
    });

    socket.on('task:update', (task) => {
      const channelId = task.channel?._id || task.channel;
      if (channelId) {
        io.to(`channel:${channelId}`).emit('task:updated', task);
      } else {
        io.emit('task:updated', task);
      }
    });

    socket.on('typing:start', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:start', {
        userId, userName: socket.user.name, channelId
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:stop', { userId, channelId });
    });

    socket.on('messageUpdated', async (data) => {
      const { messageId, channelId, updates } = data;
      if (!messageId || !channelId || !updates) return;
      try {
        const Message = require('../models/Message');
        const Channel = require('../models/Channel');
        
        const msg = await Message.findById(messageId);
        if (!msg) return;
        
        const channel = await Channel.findById(channelId);
        if (!channel) return;
        
        const isAdmin = channel.admins.some(a => a.toString() === userId);
        const isSender = msg.sender.toString() === userId;
        
        if (!isAdmin && !isSender) return;
        
        await Message.findByIdAndUpdate(messageId, { $set: updates });
        io.to(`channel:${channelId}`).emit('messageUpdated', data);
      } catch (err) {}
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      io.emit('user:offline', { userId, status: 'offline' });
      await User.findByIdAndUpdate(userId, { status: 'offline' });
    });
  });
}

module.exports = { initSocket, onlineUsers };
