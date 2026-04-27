require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspaces');
const channelsRouter = require('./routes/channels');
const messagesRouter = require('./routes/messages');
const tasksRouter = require('./routes/tasks');
const notificationsRouter = require('./routes/notifications');
const decisionRoutes = require('./routes/decisions');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const { initSocket, onlineUsers } = require('./socket/socketHandler');
const { initVideoCallSocket } = require('./socket/videoCallHandler');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGIN = process.env.CLIENT_URL || 'http://localhost:3000';

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.set('io', io);
app.set('onlineUsers', onlineUsers);
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/decisions', decisionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

initSocket(io);
initVideoCallSocket(io);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nexus';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Nexus server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB error:', err));

module.exports = { app, io };
