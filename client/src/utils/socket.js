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
    reconnectionAttempts: 10
  });

  socket.on('connect', () => console.log('[socket] connected:', socket.id));
  socket.on('connect_error', (err) => console.error('[socket] connect error:', err.message));
  // Debug: log ALL incoming events (dev only)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    socket.onAny((event, ...args) => console.log('[socket event]', event, args));
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
