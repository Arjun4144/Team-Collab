/**
 * Meeting Socket Handler — Isolated module for standalone Google Meet style meetings.
 */

// In-memory store: { meetingId: { participants: Map<socketId, { userId, userName }>, chatMessages: [] } }
const activeMeetings = new Map();

function initVideoCallSocket(io) {
  io.on('connection', (socket) => {
    if (!socket.user) return; // Auth already handled by main socketHandler middleware

    const userId = socket.user._id.toString();
    const userName = socket.user.name || 'Unknown';

    // ── call:join (also acts as start if first) ─────────────
    socket.on('call:join', ({ meetingId }) => {
      if (!meetingId) return;

      // Create session if none exists
      if (!activeMeetings.has(meetingId)) {
        activeMeetings.set(meetingId, {
          participants: new Map(),
          chatMessages: [],
          startedBy: userId,
          startedAt: Date.now()
        });
      }

      const session = activeMeetings.get(meetingId);

      // Prevent duplicate participant entries for the same user
      const alreadyIn = Array.from(session.participants.values()).some(p => p.userId === userId);
      if (alreadyIn) return;

      session.participants.set(socket.id, { userId, userName });
      socket.join(`meeting:${meetingId}`);

      // Notify other participants in the meeting that someone new joined
      socket.to(`meeting:${meetingId}`).emit('call:user-joined', {
        meetingId,
        socketId: socket.id,
        userId,
        userName
      });

      // Send existing participants and chat history to the new joiner
      socket.emit('call:participants', {
        meetingId,
        participants: Array.from(session.participants.entries()).map(([sid, p]) => ({
          socketId: sid,
          ...p
        })),
        chatHistory: session.chatMessages
      });
    });

    // ── call:leave ─────────────────────────────────────────────
    socket.on('call:leave', ({ meetingId }) => {
      handleLeaveMeeting(socket, meetingId);
    });

    // ── call:check ─────────────────────────────────────────────
    socket.on('call:check', ({ meetingId }) => {
      if (!meetingId) return;
      const session = activeMeetings.get(meetingId);
      if (session && session.participants.size > 0) {
        socket.emit('call:active', {
          meetingId,
          participants: Array.from(session.participants.values()),
          startedBy: session.startedBy
        });
      } else {
        socket.emit('call:ended', { meetingId });
      }
    });

    // ── WebRTC Signaling ───────────────────────────────────────
    socket.on('webrtc:offer', ({ meetingId, targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', {
        meetingId,
        fromSocketId: socket.id,
        fromUserId: userId,
        fromUserName: userName,
        offer
      });
    });

    socket.on('webrtc:answer', ({ meetingId, targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', {
        meetingId,
        fromSocketId: socket.id,
        answer
      });
    });

    socket.on('webrtc:ice-candidate', ({ meetingId, targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        meetingId,
        fromSocketId: socket.id,
        candidate
      });
    });

    // ── In-call chat ───────────────────────────────────────────
    socket.on('call:chat-message', ({ meetingId, text }) => {
      if (!meetingId || !text) return;
      const session = activeMeetings.get(meetingId);
      if (!session) return;

      // Verify sender is in the meeting
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

      io.to(`meeting:${meetingId}`).emit('call:chat-message', chatMsg);
    });

    // ── Media state broadcast ──────────────────────────────────
    socket.on('call:media-state', ({ meetingId, isCameraOn, isMicOn, isScreenSharing }) => {
      if (!meetingId) return;
      // Relay to all participants
      io.to(`meeting:${meetingId}`).emit('call:media-state', {
        userId,
        isCameraOn,
        isMicOn,
        isScreenSharing
      });
    });

    // ── Handle disconnect (clean up all meetings) ─────────────────
    socket.on('disconnect', () => {
      for (const [meetingId, session] of activeMeetings.entries()) {
        if (session.participants.has(socket.id)) {
          handleLeaveMeeting(socket, meetingId);
        }
      }
    });
  });
}

function handleLeaveMeeting(socket, meetingId) {
  if (!meetingId) return;

  const session = activeMeetings.get(meetingId);
  if (!session) return;

  const participant = session.participants.get(socket.id);
  if (!participant) return;

  session.participants.delete(socket.id);
  socket.leave(`meeting:${meetingId}`);

  // Notify remaining participants
  socket.to(`meeting:${meetingId}`).emit('call:user-left', {
    meetingId,
    socketId: socket.id,
    userId: participant.userId,
    userName: participant.userName
  });

  // If no participants left, end the meeting
  if (session.participants.size === 0) {
    activeMeetings.delete(meetingId);
  }
}

module.exports = { initVideoCallSocket };
