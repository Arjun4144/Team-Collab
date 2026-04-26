/**
 * Video Call Socket Handler — Isolated module for channel-based video calls.
 * All events are prefixed with "call:" or "webrtc:" to avoid conflicts.
 * Does NOT interact with any existing chat socket logic.
 */

// In-memory store: { channelId: { participants: Map<socketId, { userId, userName }>, chatMessages: [] } }
const activeCalls = new Map();

function initVideoCallSocket(io) {
  // Use the same io instance but a namespaced approach via event prefixes
  io.on('connection', (socket) => {
    if (!socket.user) return; // Auth already handled by main socketHandler middleware

    const userId = socket.user._id.toString();
    const userName = socket.user.name || 'Unknown';

    // ── call:start ─────────────────────────────────────────────
    socket.on('call:start', ({ channelId }) => {
      if (!channelId) return;

      // Create session if none exists
      if (!activeCalls.has(channelId)) {
        activeCalls.set(channelId, {
          participants: new Map(),
          chatMessages: [],
          startedBy: userId,
          startedAt: Date.now()
        });
      }

      const session = activeCalls.get(channelId);

      // Prevent duplicate participant entries for the same user
      const alreadyIn = Array.from(session.participants.values()).some(p => p.userId === userId);
      if (alreadyIn) return;

      session.participants.set(socket.id, { userId, userName });
      socket.join(`call:${channelId}`);

      // Notify everyone in the channel that a call is active
      io.to(`channel:${channelId}`).emit('call:active', {
        channelId,
        participants: Array.from(session.participants.values()),
        startedBy: session.startedBy
      });

      // Send existing participants list to the joiner
      socket.emit('call:participants', {
        channelId,
        participants: Array.from(session.participants.entries()).map(([sid, p]) => ({
          socketId: sid,
          ...p
        })),
        chatHistory: session.chatMessages
      });
    });

    // ── call:join ──────────────────────────────────────────────
    socket.on('call:join', ({ channelId }) => {
      if (!channelId) return;

      const session = activeCalls.get(channelId);
      if (!session) {
        socket.emit('call:error', { message: 'No active call in this channel' });
        return;
      }

      // Prevent duplicate
      const alreadyIn = Array.from(session.participants.values()).some(p => p.userId === userId);
      if (alreadyIn) return;

      session.participants.set(socket.id, { userId, userName });
      socket.join(`call:${channelId}`);

      // Notify other call participants that someone new joined
      socket.to(`call:${channelId}`).emit('call:user-joined', {
        channelId,
        socketId: socket.id,
        userId,
        userName
      });

      // Send existing participants and chat history to the new joiner
      socket.emit('call:participants', {
        channelId,
        participants: Array.from(session.participants.entries()).map(([sid, p]) => ({
          socketId: sid,
          ...p
        })),
        chatHistory: session.chatMessages
      });

      // Update everyone in the channel about the call state
      io.to(`channel:${channelId}`).emit('call:active', {
        channelId,
        participants: Array.from(session.participants.values()),
        startedBy: session.startedBy
      });
    });

    // ── call:leave ─────────────────────────────────────────────
    socket.on('call:leave', ({ channelId }) => {
      handleLeaveCall(io, socket, channelId);
    });

    // ── call:check ─────────────────────────────────────────────
    socket.on('call:check', ({ channelId }) => {
      if (!channelId) return;
      const session = activeCalls.get(channelId);
      if (session && session.participants.size > 0) {
        socket.emit('call:active', {
          channelId,
          participants: Array.from(session.participants.values()),
          startedBy: session.startedBy
        });
      } else {
        socket.emit('call:ended', { channelId });
      }
    });

    // ── WebRTC Signaling ───────────────────────────────────────
    socket.on('webrtc:offer', ({ channelId, targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', {
        channelId,
        fromSocketId: socket.id,
        fromUserId: userId,
        fromUserName: userName,
        offer
      });
    });

    socket.on('webrtc:answer', ({ channelId, targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', {
        channelId,
        fromSocketId: socket.id,
        answer
      });
    });

    socket.on('webrtc:ice-candidate', ({ channelId, targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        channelId,
        fromSocketId: socket.id,
        candidate
      });
    });

    // ── In-call chat ───────────────────────────────────────────
    socket.on('call:chat-message', ({ channelId, text }) => {
      if (!channelId || !text) return;
      const session = activeCalls.get(channelId);
      if (!session) return;

      // Verify sender is in the call
      if (!session.participants.has(socket.id)) return;

      const chatMsg = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId,
        userName,
        text,
        timestamp: Date.now()
      };

      session.chatMessages.push(chatMsg);
      // Keep only last 100 messages
      if (session.chatMessages.length > 100) {
        session.chatMessages = session.chatMessages.slice(-100);
      }

      io.to(`call:${channelId}`).emit('call:chat-message', chatMsg);
    });

    // ── Media state broadcast ──────────────────────────────────
    socket.on('call:media-state', ({ channelId, isCameraOn, isMicOn }) => {
      if (!channelId) return;
      // Relay to all call participants (including sender for confirmation)
      io.to(`call:${channelId}`).emit('call:media-state', {
        userId,
        isCameraOn,
        isMicOn
      });
    });

    // ── Handle disconnect (clean up all calls) ─────────────────
    socket.on('disconnect', () => {
      // Find all calls this socket is part of and leave them
      for (const [channelId, session] of activeCalls.entries()) {
        if (session.participants.has(socket.id)) {
          handleLeaveCall(io, socket, channelId);
        }
      }
    });
  });
}

function handleLeaveCall(io, socket, channelId) {
  if (!channelId) return;

  const session = activeCalls.get(channelId);
  if (!session) return;

  const participant = session.participants.get(socket.id);
  if (!participant) return;

  session.participants.delete(socket.id);
  socket.leave(`call:${channelId}`);

  // Notify remaining participants
  socket.to(`call:${channelId}`).emit('call:user-left', {
    channelId,
    socketId: socket.id,
    userId: participant.userId,
    userName: participant.userName
  });

  // If no participants left, end the call
  if (session.participants.size === 0) {
    activeCalls.delete(channelId);
    io.to(`channel:${channelId}`).emit('call:ended', { channelId });
  } else {
    // Update channel about active call state
    io.to(`channel:${channelId}`).emit('call:active', {
      channelId,
      participants: Array.from(session.participants.values()),
      startedBy: session.startedBy
    });
  }
}

module.exports = { initVideoCallSocket };
