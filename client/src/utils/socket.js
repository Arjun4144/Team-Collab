import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => socket;

// Always connect to the deployed backend.
// Must match the Axios baseURL origin for consistency.
const SOCKET_URL = 'https://team-collab-back.onrender.com';

export const initSocket = (token) => {
  if (socket) socket.disconnect();
 
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });
 
  socket.on('connect', () => console.log('[socket] connected:', socket.id));
  socket.on('connect_error', (err) => console.error('[socket] connect error:', err.message));
  socket.on('disconnect', (reason) => console.warn('[socket] disconnected:', reason));
 
  // Debug: log ALL incoming events when VITE_SOCKET_DEBUG=true
  if (import.meta.env.VITE_SOCKET_DEBUG === 'true') {
    socket.onAny((event, ...args) => console.log('[socket event]', event, args));
  }
 
  return socket;
};
 
// ── Disconnect ───────────────────────────────────────────────────────────────
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
 
// ── Re-auth (e.g. after token refresh) ──────────────────────────────────────
// Reconnects with a fresh token without requiring a page reload.
export const reconnectSocket = (token) => {
  if (socket) {
    socket.auth = { token };
    socket.disconnect().connect();
  } else {
    initSocket(token);
  }
};
