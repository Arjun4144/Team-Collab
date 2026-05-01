// server/socket/callHandler.js
// Handles WebRTC signaling for multi-user channel calls.
// Signals are routed by socketId (not userId) to avoid lookup failures.

module.exports = function callHandler(io, socket) {
  const userId   = socket.user._id.toString();
  const userName = socket.user.name || socket.user.username || 'Unknown';

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
    socket.callMeta = { channelId, userId, userName, videoOff, muted };

    // Tell the NEW joiner who is already in the room
    // so they can initiate an offer to each existing member
    socket.emit('call:existing-members', {
      members: existingSocketIds.map(sid => {
        const s = io.sockets.sockets.get(sid);
        return {
          socketId: sid,
          userId:   s?.callMeta?.userId   || null,
          userName: s?.callMeta?.userName || 'Unknown',
          videoOff: s?.callMeta?.videoOff ?? false,
          muted: s?.callMeta?.muted ?? false,
          userObject: s?.user ? {
            _id: s.user._id,
            name: s.user.name,
            username: s.user.username,
            avatar: s.user.avatar,
          } : null,
        };
      }),
    });

    // Tell everyone ELSE in the call room that this user joined
    socket.to(callRoom).emit('call:user-joined', {
      socketId: socket.id,
      userId,
      userName,
      videoOff,
      muted,
      userObject: {
        _id: socket.user._id,
        name: socket.user.name,
        username: socket.user.username,
        avatar: socket.user.avatar,
      },
    });

    // Broadcast to the entire CHANNEL that call participant count changed
    // This notifies users not yet in the call that they can see "Join (X)"
    const currentCallSize = io.sockets.adapter.rooms.get(callRoom)?.size || 0;
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
    const currentCallSize = io.sockets.adapter.rooms.get(callRoom)?.size || 0;
    io.to(channelRoom).emit('call:participants-count', { count: currentCallSize });
    
    socket.callMeta = null;
    console.log(`[Call] ${userName} left call:${channelId} | remaining: ${currentCallSize}`);
  });

  // ── WebRTC offer (new joiner → existing member, by socketId) ───────────────
  socket.on('call:offer', ({ toSocketId, offer }) => {
    io.to(toSocketId).emit('call:offer', {
      fromSocketId: socket.id,
      fromUserId:   userId,
      fromUserName: userName,
      offer,
      userObject: {
        _id: socket.user._id,
        name: socket.user.name,
        username: socket.user.username,
        avatar: socket.user.avatar,
      },
    });
  });

  // ── WebRTC answer (existing member → new joiner, by socketId) ──────────────
  socket.on('call:answer', ({ toSocketId, answer }) => {
    io.to(toSocketId).emit('call:answer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      fromUserName: userName,
      answer,
      userObject: {
        _id: socket.user._id,
        name: socket.user.name,
        username: socket.user.username,
        avatar: socket.user.avatar,
      },
    });
  });

  // ── ICE candidates (by socketId) ────────────────────────────────────────────
  socket.on('call:ice-candidate', ({ toSocketId, candidate }) => {
    io.to(toSocketId).emit('call:ice-candidate', {
      fromSocketId: socket.id,
      fromUserId: userId,
      fromUserName: userName,
      candidate,
      userObject: {
        _id: socket.user._id,
        name: socket.user.name,
        username: socket.user.username,
        avatar: socket.user.avatar,
      },
    });
  });

  // ── Participant state broadcasts ────────────────────────────────────────────
  socket.on('call:mute-toggle',  ({ channelId, muted })    => {
    if (socket.callMeta) socket.callMeta.muted = muted;
    socket.to(`call:${channelId}`).emit('call:participant-update', { socketId: socket.id, userId, muted });
  });
  socket.on('call:video-toggle', ({ channelId, videoOff }) => {
    if (socket.callMeta) socket.callMeta.videoOff = videoOff;
    socket.to(`call:${channelId}`).emit('call:participant-update', { socketId: socket.id, userId, videoOff });
  });
  socket.on('call:screen-share', ({ channelId, sharing })  => socket.to(`call:${channelId}`).emit('call:participant-update', { socketId: socket.id, userId, screenSharing: sharing }));
  socket.on('call:hand-raise',   ({ channelId, raised })   => socket.to(`call:${channelId}`).emit('call:participant-update', { socketId: socket.id, userId, hand: raised }));

  // ── In-call chat ────────────────────────────────────────────────────────────
  socket.on('call:chat-message', ({ channelId, id, userId: msgUserId, userName: msgUserName, text, time }) => {
    // Broadcast the complete message with all fields to other participants
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
      const currentCallSize = io.sockets.adapter.rooms.get(callRoom)?.size || 0;
      io.to(channelRoom).emit('call:participants-count', { count: currentCallSize });
      
      console.log(`[Call] ${userName} disconnected from call:${channelId} | remaining: ${currentCallSize}`);
    }
  });
};