import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => socket;

// Always connect to the deployed backend.
// Must match the Axios baseURL origin for consistency.
const SOCKET_URL = 'https://team-collab-anuj-debug.onrender.com';
console.log('[DEBUG] socket URL is set to:', SOCKET_URL);

export const initSocket = (token) => {
  if (socket) {
    return socket;
  }
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  console.log("SOCKET URL:", socket.io.uri);

  socket.on('connect', () => console.log('SOCKET CONNECTED', socket.id));
  socket.on('connect_error', (err) => console.error('[socket] connect error:', err.message));

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};


