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
const { initSocket, onlineUsers } = require('./socket/socketHandler');
const { initVideoCallSocket } = require('./socket/videoCallHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('io', io);
app.set('onlineUsers', onlineUsers);
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/decisions', decisionRoutes);
app.use('/api/users', userRoutes);

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
