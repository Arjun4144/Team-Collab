const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Channel = require('../models/Channel');
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

    socket.on('message:send', (message) => {
      const channelId = message.channel?._id || message.channel;
      socket.to(`channel:${channelId}`).emit('message:new', message);
    });

    socket.on('message:resolve', (data) => {
      const channelId = data.channel?._id || data.channel;
      socket.to(`channel:${channelId}`).emit('message:resolved', data);
    });

    socket.on('task:update', (task) => {
      io.emit('task:updated', task);
    });

    socket.on('typing:start', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:start', {
        userId, userName: socket.user.name
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:stop', { userId });
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      io.emit('user:offline', { userId, status: 'offline' });
      await User.findByIdAndUpdate(userId, { status: 'offline' });
    });
  });
}

module.exports = { initSocket, onlineUsers };
