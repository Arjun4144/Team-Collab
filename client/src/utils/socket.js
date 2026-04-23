import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => socket;

// In dev mode CRA proxy doesn't reliably forward WebSocket upgrades,
// so connect directly to the server origin.
const SOCKET_URL =
  process.env.NODE_ENV === 'development' ? `http://${window.location.hostname}:5000` : '/';

export const initSocket = (token) => {
  if (socket) socket.disconnect();
  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  socket.on('connect', () => console.log('[socket] connected:', socket.id));
  socket.on('connect_error', (err) => console.error('[socket] connect error:', err.message));

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
