// server/socket/callHandler.js
// Handles WebRTC signaling for multi-user channel calls.
// Signals are routed by socketId (not userId) to avoid lookup failures.

module.exports = function callHandler(io, socket) {
  const userId = socket.user._id.toString();
  const userName = socket.user.name || socket.user.username || 'Unknown';

  // ── Helper: build userObject from socket ────────────────────────────────────
  function getUserObject(s) {
    if (!s?.user) return null;
    return {
      _id: s.user._id,
      name: s.user.name,
      username: s.user.username,
      avatar: s.user.avatar,
    };
  }

  // ── Helper: get current call room size ─────────────────────────────────────
  function getCallSize(callRoom) {
    return io.sockets.adapter.rooms.get(callRoom)?.size || 0;
  }

  // ── Join call room ──────────────────────────────────────────────────────────
  socket.on('call:join', ({ channelId, videoOff, muted }) => {
    const callRoom = `call:${channelId}`;
    const channelRoom = `channel:${channelId}`;

    // Collect everyone already in the room BEFORE this socket joins
    const existingSocketIds = [];
    const roomSockets = io.sockets.adapter.rooms.get(callRoom);
    if (roomSockets) {
      roomSockets.forEach(sid => existingSocketIds.push(sid));
    }

    // Join the call room
    socket.join(callRoom);

    // Store call meta on the socket for cleanup on disconnect
    socket.callMeta = { channelId, userId, userName, videoOff: !!videoOff, muted: !!muted };

    // Tell the NEW joiner who is already in the room
    // so they can initiate an offer to each existing member
    socket.emit('call:existing-members', {
      members: existingSocketIds.map(sid => {
        const s = io.sockets.sockets.get(sid);
        return {
          socketId: sid,
          userId: s?.callMeta?.userId || null,
          userName: s?.callMeta?.userName || 'Unknown',
          videoOff: s?.callMeta?.videoOff ?? false,
          muted: s?.callMeta?.muted ?? false,
          userObject: getUserObject(s),
        };
      }),
    });

    // Tell everyone ELSE in the call room that this user joined
    socket.to(callRoom).emit('call:user-joined', {
      socketId: socket.id,
      userId,
      userName,
      videoOff: !!videoOff,
      muted: !!muted,
      userObject: getUserObject(socket),
    });

    // Broadcast to the entire CHANNEL that call participant count changed
    const currentCallSize = getCallSize(callRoom);
    io.to(channelRoom).emit('call:participants-count', { count: currentCallSize });

    console.log(`[Call] ${userName} joined call:${channelId} | room size: ${currentCallSize}`);
  });

  // ── Leave call room ─────────────────────────────────────────────────────────
  socket.on('call:leave', ({ channelId }) => {
    const callRoom = `call:${channelId}`;
    const channelRoom = `channel:${channelId}`;

    socket.leave(callRoom);
    socket.to(callRoom).emit('call:user-left', { socketId: socket.id, userId });

    // Broadcast updated call participant count to entire channel
    const currentCallSize = getCallSize(callRoom);
    io.to(channelRoom).emit('call:participants-count', { count: currentCallSize });

    socket.callMeta = null;
    console.log(`[Call] ${userName} left call:${channelId} | remaining: ${currentCallSize}`);
  });

  // ── WebRTC offer (new joiner → existing member, by socketId) ───────────────
  socket.on('call:offer', ({ toSocketId, offer, isRenegotiation }) => {
    io.to(toSocketId).emit('call:offer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      fromUserName: userName,
      offer,
      isRenegotiation: !!isRenegotiation,
      userObject: getUserObject(socket),
    });
  });

  // ── WebRTC answer (existing member → new joiner, by socketId) ──────────────
  socket.on('call:answer', ({ toSocketId, answer }) => {
    io.to(toSocketId).emit('call:answer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      fromUserName: userName,
      answer,
      userObject: getUserObject(socket),
    });
  });

  // ── ICE candidates (by socketId) ────────────────────────────────────────────
  socket.on('call:ice-candidate', ({ toSocketId, candidate }) => {
    io.to(toSocketId).emit('call:ice-candidate', {
      fromSocketId: socket.id,
      fromUserId: userId,
      fromUserName: userName,
      candidate,
      userObject: getUserObject(socket),
    });
  });

  // ── Participant state broadcasts ────────────────────────────────────────────
  socket.on('call:mute-toggle', ({ channelId, muted }) => {
    if (socket.callMeta) socket.callMeta.muted = !!muted;
    socket.to(`call:${channelId}`).emit('call:participant-update', {
      socketId: socket.id,
      userId,
      muted: !!muted,
    });
  });

  // ✅ Correctly persists videoOff state so late joiners see accurate status
  socket.on('call:video-toggle', ({ channelId, videoOff }) => {
    if (socket.callMeta) socket.callMeta.videoOff = !!videoOff;
    socket.to(`call:${channelId}`).emit('call:participant-update', {
      socketId: socket.id,
      userId,
      videoOff: !!videoOff,
    });
  });

  socket.on('call:screen-share', ({ channelId, sharing }) => {
    socket.to(`call:${channelId}`).emit('call:participant-update', {
      socketId: socket.id,
      userId,
      screenSharing: !!sharing,
    });
  });

  socket.on('call:hand-raise', ({ channelId, raised }) => {
    socket.to(`call:${channelId}`).emit('call:participant-update', {
      socketId: socket.id,
      userId,
      hand: !!raised,
    });
  });

  // ── In-call chat ────────────────────────────────────────────────────────────
  socket.on('call:chat-message', ({ channelId, id, userId: msgUserId, userName: msgUserName, text, time }) => {
    socket.to(`call:${channelId}`).emit('call:chat-message', {
      id,
      userId: msgUserId,
      userName: msgUserName,
      text,
      time,
    });
  });

  // ── Auto-cleanup on browser close ──────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.callMeta) {
      const { channelId } = socket.callMeta;
      const callRoom = `call:${channelId}`;
      const channelRoom = `channel:${channelId}`;

      socket.to(callRoom).emit('call:user-left', { socketId: socket.id, userId });

      // Broadcast updated call participant count to entire channel
      const currentCallSize = getCallSize(callRoom);
      io.to(channelRoom).emit('call:participants-count', { count: currentCallSize });

      console.log(`[Call] ${userName} disconnected from call:${channelId} | remaining: ${currentCallSize}`);
    }
  });
};