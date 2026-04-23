# Nexus — Professional Communication Platform

> Structured messages. Permanent decisions. Zero noise.

A full-stack professional chat application built with the **MERN stack** (MongoDB · Express · React · Node.js) featuring intent-based messaging, a permanent decision log, auto-extracted task tracking, and real-time communication via Socket.io.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6, Zustand (state), Socket.io client |
| Backend | Node.js, Express.js, Socket.io server |
| Database | MongoDB with Mongoose ODM |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Real-time | Socket.io with room-based channels |
| Styling | Custom CSS variables — no UI framework |
| Fonts | Syne (display) + DM Sans (body) + JetBrains Mono |

---

## Project Structure

```
nexus/
├── server/                  # Express + Socket.io backend
│   ├── index.js             # Entry point
│   ├── seed.js              # Demo data seeder
│   ├── .env.example         # Environment template
│   ├── models/
│   │   ├── User.js
│   │   ├── Channel.js
│   │   ├── Message.js       ← intentType field is the core innovation
│   │   ├── Task.js
│   │   └── Decision.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── channels.js
│   │   ├── messages.js      ← auto-creates tasks/decisions by intent
│   │   ├── tasks.js
│   │   ├── decisions.js
│   │   └── users.js
│   ├── middleware/
│   │   └── auth.js          # JWT verify + role guard
│   └── socket/
│       └── socketHandler.js # Real-time events
│
└── client/                  # React frontend
    └── src/
        ├── App.jsx
        ├── index.css        # Full design system (dark theme)
        ├── pages/
        │   ├── AuthPage.jsx
        │   └── WorkspacePage.jsx
        ├── components/
        │   ├── auth/ProtectedRoute.jsx
        │   ├── layout/
        │   │   ├── Sidebar.jsx
        │   │   ├── ChannelHeader.jsx
        │   │   └── MembersPanel.jsx
        │   ├── chat/
        │   │   ├── ChatArea.jsx
        │   │   ├── MessageBubble.jsx
        │   │   ├── MessageComposer.jsx
        │   │   └── ThreadPanel.jsx
        │   ├── tasks/TasksPanel.jsx
        │   └── decisions/DecisionsPanel.jsx
        ├── store/useStore.js # Zustand global state
        ├── hooks/useSocket.js
        └── utils/
            ├── api.js        # Axios + auth interceptor
            ├── socket.js     # Socket.io singleton
            └── helpers.js    # formatTime, getInitials, intentConfig
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running locally (`mongod`) **or** a MongoDB Atlas URI

### 1 — Clone & install

```bash
git clone <your-repo-url> nexus
cd nexus

# Install root + server + client dependencies
npm run install:all
```

### 2 — Configure environment

```bash
cp server/.env.example server/.env
# Edit server/.env — set MONGO_URI and JWT_SECRET
```

### 3 — Seed demo data (optional but recommended)

```bash
cd server
node seed.js
```

This creates 4 users, 4 channels, 9 messages, 5 tasks, and 4 decisions.

**Demo credentials:**
| Email | Password | Role |
|---|---|---|
| alice@nexus.dev | password123 | admin |
| bob@nexus.dev | password123 | member |
| carol@nexus.dev | password123 | member |
| dave@nexus.dev | password123 | guest |

### 4 — Run in development

```bash
# From project root — starts both server (port 5000) and client (port 3000)
npm install          # installs concurrently
npm run dev
```

Or separately:
```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:client
```

Open **http://localhost:3000**

---

## Core Features

### 1. Intent-Based Messaging
Every message has a declared intent — the single design decision that differentiates Nexus:

| Intent | Badge | Behaviour |
|---|---|---|
| `discussion` | 💬 Discussion | Open-ended thread, can be resolved with a verdict |
| `announcement` | 📢 Announcement | High-visibility, read receipts tracked |
| `decision` | ✅ Decision | Auto-logged to the Decision Log |
| `action` | ⚡ Action | Auto-creates a Task with the message content |
| `fyi` | 📌 FYI | Informational only, no response required |

### 2. Decision Log
- Every `decision` message is automatically persisted to `/api/decisions`
- Filterable by status: active / superseded
- Each decision has: title, body, rationale, owner, timestamp, tags
- Members can acknowledge decisions — tracked per-user
- Manually log decisions directly from the panel

### 3. Task Tracker
- Every `action` message auto-creates a task
- Kanban-style columns: To Do → In Progress → Done
- Assignee, priority, due date on each task
- Real-time status updates via Socket.io

### 4. Real-Time Communication
- WebSocket rooms per channel (join/leave on channel switch)
- Typing indicators with debounce
- Live message delivery
- Online/offline presence tracking

### 5. Thread Replies
- Any message can be replied to in a side thread
- Thread panel slides in from the right
- Reply count displayed on parent message

### 6. Role-Based Access
- **Admin**: full access, can manage channels and users
- **Member**: standard access
- **Guest**: read + limited write access

---

## API Reference

### Auth
```
POST /api/auth/register   { name, email, password, role }
POST /api/auth/login      { email, password }
GET  /api/auth/me         → current user
PATCH /api/auth/status    { status }
```

### Channels
```
GET  /api/channels
POST /api/channels        { name, description, type, members[] }
GET  /api/channels/:id
POST /api/channels/:id/join
```

### Messages
```
GET  /api/messages/channel/:channelId?page=1&limit=50&intent=decision
POST /api/messages                      { channel, content, intentType, priority, threadParent }
GET  /api/messages/:id/thread
PATCH /api/messages/:id/resolve         { verdict }
PATCH /api/messages/:id/read
```

### Tasks
```
GET    /api/tasks?channel=&status=&assignee=
POST   /api/tasks         { title, description, assignee, channel, priority, dueDate }
PATCH  /api/tasks/:id     { status, assignee, priority, ... }
DELETE /api/tasks/:id
```

### Decisions
```
GET   /api/decisions?channel=
POST  /api/decisions       { title, body, rationale, channel }
PATCH /api/decisions/:id/acknowledge
```

---

## Socket.io Events

### Client → Server
| Event | Payload |
|---|---|
| `channel:join` | channelId |
| `channel:leave` | channelId |
| `message:send` | message object |
| `message:resolve` | message object |
| `task:update` | task object |
| `typing:start` | { channelId } |
| `typing:stop` | { channelId } |

### Server → Client
| Event | Payload |
|---|---|
| `message:new` | message object |
| `message:resolved` | updated message |
| `task:updated` | updated task |
| `typing:start` | { userId, userName } |
| `typing:stop` | { userId } |
| `user:online` | { userId } |
| `user:offline` | { userId } |

---

## Security (Implemented)
- Passwords hashed with **bcryptjs** (12 salt rounds)
- **JWT** tokens with 7-day expiry
- Auth middleware on all protected routes
- Role-based guards (`adminOnly` middleware)
- CORS configured
- HTTP-only token storage in localStorage (upgrade to httpOnly cookie for production)

## Scalability (Conceptual)
- Stateless Express API — horizontally scalable behind a load balancer
- MongoDB indexes on `channel + createdAt` and `intentType` for fast queries
- Redis adapter for Socket.io (multi-node real-time — add `socket.io-redis` adapter)
- Message pagination to avoid fetching entire history

---

## Roadmap

### ✅ MVP (Built)
- Auth (register/login/JWT)
- Channels (public/private)
- Intent-based messaging (5 types)
- Real-time via Socket.io
- Thread replies
- Task panel (auto-created from `action` messages)
- Decision log (auto-created from `decision` messages)
- Members panel with presence
- Role-based access

### 🔵 V2 (Next)
- Message search (keyword + intent filter)
- Direct messages (1:1 channels)
- Priority inbox (AI-ranked)
- File attachments
- Email notifications via SendGrid
- Message edit/delete

### 🟡 V3 (Advanced)
- AI daily brief (OpenAI API summary of decisions + open tasks)
- Semantic search (pgvector / Pinecone embeddings)
- Analytics dashboard (response times, decision velocity)
- SSO / OAuth2
- Message retention policies
- Webhook integrations

---

## License
MIT — free to use, modify, and submit for academic evaluation.
