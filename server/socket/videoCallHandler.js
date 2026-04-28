/**
 * Video Call Socket Handler — Isolated module for channel-based video calls.
 * All events are prefixed with "call:" or "webrtc:" to avoid conflicts.
 * Does NOT interact with any existing chat socket logic.
 */

const Channel = require('../models/Channel');

// In-memory store: { channelId: { participants: Map<socketId, { userId, userName }>, chatMessages: [] } }
const activeCalls = new Map();

const getCallRoomId = (channelId) => `call:${channelId}`;

const getParticipants = (session) => (
  Array.from(session.participants.entries()).map(([socketId, participant]) => ({
    socketId,
    ...participant
  }))
);

const isChannelMember = async (channelId, userId) => {
  const channel = await Channel.findById(channelId).select('members').lean();
  if (!channel) return false;
  return channel.members.some(memberId => memberId.toString() === userId);
};

const broadcastCallState = (io, channelId, session) => {
  const roomId = getCallRoomId(channelId);
  const participants = getParticipants(session);
  const activePayload = {
    channelId,
    participants,
    startedBy: session.startedBy
  };

  io.to(roomId).emit('call:participants', {
    channelId,
    participants,
    chatHistory: session.chatMessages
  });
  io.to(roomId).emit('call:active', activePayload);
  io.to(`channel:${channelId}`).emit('call:active', activePayload);
};

function initVideoCallSocket(io) {
  // Use the same io instance but a namespaced approach via event prefixes
  io.on('connection', (socket) => {
    if (!socket.user) return; // Auth already handled by main socketHandler middleware

    const userId = socket.user._id.toString();
    const userName = socket.user.name || 'Unknown';

    console.log(`[WS-CONNECT] socketId=${socket.id} userId=${userId} userName=${userName}`);
    console.log(`[WS-CONNECT] Current rooms:`, Array.from(socket.rooms));

    console.log(`[WS-CONNECT] socketId=${socket.id} userId=${userId} userName=${userName}`);
    console.log(`[WS-CONNECT] Current rooms at connect:`, Array.from(socket.rooms));

    // ── call:start ─────────────────────────────────────────────
    socket.on('call:start', async ({ channelId }) => {
      if (!channelId) return;

      const roomId = getCallRoomId(channelId);
      const isMember = await isChannelMember(channelId, userId).catch(() => false);
      if (!isMember) {
        io.to(socket.id).emit('call:error', { channelId, message: 'You are not a member of this channel' });
        return;
      }

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

      // The participant map is the single source of truth for every caller.
      if (!session.participants.has(socket.id)) {
        session.participants.set(socket.id, { userId, userName });
      }
      socket.join(roomId);
      console.log(`[Socket] User ${userName} joined room: ${roomId}`);

      console.log(`[Socket] Broadcasting call state to room: ${roomId}`);
      broadcastCallState(io, channelId, session);
    });

    // ── call:join ──────────────────────────────────────────────
    socket.on('call:join', async ({ channelId }) => {
      if (!channelId) return;

      console.log(`[Socket] Received call:join from ${userName} for channel ${channelId}`);
      const roomId = getCallRoomId(channelId);
      const isMember = await isChannelMember(channelId, userId).catch(() => false);
      if (!isMember) {
        io.to(socket.id).emit('call:error', { channelId, message: 'You are not a member of this channel' });
        return;
      }

      const session = activeCalls.get(channelId);
      if (!session) {
        io.to(socket.id).emit('call:error', { channelId, message: 'No active call in this channel' });
        return;
      }

      // The participant map is the single source of truth for every caller.
      if (!session.participants.has(socket.id)) {
        session.participants.set(socket.id, { userId, userName });
      }
      socket.join(roomId);
      console.log(`[Socket] User ${userName} joined room: ${roomId}`);

      console.log(`[Socket] Broadcasting call state to room: ${roomId}`);
      broadcastCallState(io, channelId, session);
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
        io.to(socket.id).emit('call:active', {
          channelId,
          participants: getParticipants(session),
          startedBy: session.startedBy
        });
      } else {
        io.to(socket.id).emit('call:ended', { channelId });
      }
    });

    // ── WebRTC Signaling ───────────────────────────────────────
    socket.on('webrtc:offer', ({ channelId, targetSocketId, offer }) => {
      const targetExists = io.sockets.sockets.has(targetSocketId);
      console.log(`[WebRTC] OFFER  | from=${userName}(${socket.id.slice(-6)}) → to=${targetSocketId.slice(-6)} | ch=${channelId} | type=${offer?.type} | targetOnline=${targetExists}`);
      io.to(targetSocketId).emit('webrtc:offer', {
        channelId,
        fromSocketId: socket.id,
        fromUserId: userId,
        fromUserName: userName,
        offer
      });
    });

    socket.on('webrtc:answer', ({ channelId, targetSocketId, answer }) => {
      const targetExists = io.sockets.sockets.has(targetSocketId);
      console.log(`[WebRTC] ANSWER | from=${userName}(${socket.id.slice(-6)}) → to=${targetSocketId.slice(-6)} | ch=${channelId} | type=${answer?.type} | targetOnline=${targetExists}`);
      io.to(targetSocketId).emit('webrtc:answer', {
        channelId,
        fromSocketId: socket.id,
        answer
      });
    });

    socket.on('webrtc:ice-candidate', ({ channelId, targetSocketId, candidate }) => {
      console.log(`[WebRTC] ICE    | from=${userName}(${socket.id.slice(-6)}) → to=${targetSocketId.slice(-6)} | protocol=${candidate?.protocol} type=${candidate?.type}`);
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
    socket.on('call:media-state', ({ channelId, isCameraOn, isMicOn, isScreenSharing }) => {
      if (!channelId) return;
      // Relay to all call participants (including sender for confirmation)
      io.to(`call:${channelId}`).emit('call:media-state', {
        userId,
        isCameraOn,
        isMicOn,
        isScreenSharing
      });
    });

    // ── Handle disconnect (clean up all calls) ─────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[WS-DISCONNECT] socketId=${socket.id} userId=${userId} userName=${userName} reason=${reason}`);
      // Find all calls this socket is part of and leave them
      for (const [channelId, session] of activeCalls.entries()) {
        if (session.participants.has(socket.id)) {
          console.log(`[WS-DISCONNECT] Cleaning up call in channel=${channelId} for ${userName}`);
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

  const roomId = getCallRoomId(channelId);
  session.participants.delete(socket.id);

  // Broadcast to the full call room before removing this socket from the room.
  io.to(roomId).emit('call:user-left', {
    channelId,
    socketId: socket.id,
    userId: participant.userId,
    userName: participant.userName
  });

  io.to(roomId).emit('call:participants', {
    channelId,
    participants: getParticipants(session),
    chatHistory: session.chatMessages
  });

  // If no participants left, end the call
  if (session.participants.size === 0) {
    activeCalls.delete(channelId);
    io.to(roomId).emit('call:ended', { channelId });
    io.to(`channel:${channelId}`).emit('call:ended', { channelId });
  } else {
    broadcastCallState(io, channelId, session);
  }

  socket.leave(roomId);
}

module.exports = { initVideoCallSocket };
