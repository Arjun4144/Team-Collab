const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Channel = require('../models/Channel');
const Workspace = require('../models/Workspace');
const { JWT_SECRET } = require('../middleware/auth');

const onlineUsers = new Map(); // userId -> Set<socketId>

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

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    socket.join(userId);

    // Track multiple tabs: store a Set of socket IDs per user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Update DB status
    await User.findByIdAndUpdate(userId, { status: 'online' }).catch(() => {});

    // Emit online ONLY to workspace rooms the user belongs to (not globally)
    const userWorkspaces = await Workspace.find({ members: userId }).select('_id').lean().catch(() => []);
    const wsIds = (userWorkspaces || []).map(ws => ws._id.toString());
    wsIds.forEach(wsId => {
      io.to(`workspace:${wsId}`).emit('user:online', { userId, status: 'online' });
    });

    // Auto-join all channels the user is a member of
    Channel.find({ members: userId, isArchived: false }).then(channels => {
      channels.forEach(ch => socket.join(`channel:${ch._id}`));
    }).catch(() => {});

    // Auto-join all workspace rooms
    wsIds.forEach(wsId => socket.join(`workspace:${wsId}`));

    socket.on('channel:join', async (channelId) => {
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

        const msg = await Message.findById(messageId);
        if (!msg) return;

        const channel = await Channel.findById(channelId);
        if (!channel) return;

        const isAdmin = channel.admins.some(a => a.toString() === userId);
        const isSender = msg.sender.toString() === userId;

        if (!isAdmin && !isSender) return;

        // Whitelist allowed update fields
        const allowedFields = ['content', 'isResolved', 'verdict'];
        const safeUpdates = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) safeUpdates[key] = updates[key];
        }

        await Message.findByIdAndUpdate(messageId, { $set: safeUpdates });
        io.to(`channel:${channelId}`).emit('messageUpdated', { ...data, updates: safeUpdates });
      } catch (err) {}
    });

    socket.on('disconnect', async () => {
      // Remove this socket from the user's set
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        // Only mark offline if ALL tabs are closed
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          await User.findByIdAndUpdate(userId, { status: 'offline' }).catch(() => {});
          // Emit offline ONLY to workspace rooms
          wsIds.forEach(wsId => {
            io.to(`workspace:${wsId}`).emit('user:offline', { userId, status: 'offline' });
          });
        }
      }
    });
  });
}

// Helper: get a single socket ID for a user (for targeted emits in REST routes)
function getUserSocketId(userId) {
  const sockets = onlineUsers.get(userId);
  if (sockets && sockets.size > 0) {
    return sockets.values().next().value;
  }
  return null;
}

module.exports = { initSocket, onlineUsers, getUserSocketId };
