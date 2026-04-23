import { create } from 'zustand';
import api from '../utils/api';

const useStore = create((set, get) => ({
  // Auth
  user: null,
  token: localStorage.getItem('nexus_token'),
  setUser: (user) => set({ user }),
  setToken: (token) => {
    localStorage.setItem('nexus_token', token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem('nexus_token');
    set({ user: null, token: null, channels: [], messages: {}, activeChannel: null });
  },

  // Channels
  channels: [],
  activeChannel: null,
  setChannels: (channels) => set({ channels }),
  setActiveChannel: (channel) => set({ activeChannel: channel }),
  addChannel: (channel) => set(s => ({ channels: [channel, ...s.channels] })),

  // Messages
  messages: {},
  setMessages: (channelId, msgs) => set(s => ({
    messages: { ...s.messages, [channelId]: msgs }
  })),
  addMessage: (msg) => {
    const channelId = msg.channel?._id || msg.channel;
    set(s => ({
      messages: {
        ...s.messages,
        [channelId]: [...(s.messages[channelId] || []), msg]
      }
    }));
  },
  updateMessage: (updated) => {
    const channelId = updated.channel?._id || updated.channel;
    set(s => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map(m =>
          m._id === updated._id ? updated : m
        )
      }
    }));
  },

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set(s => ({ tasks: [task, ...s.tasks] })),
  updateTask: (updated) => set(s => ({
    tasks: s.tasks.map(t => t._id === updated._id ? updated : t)
  })),
  removeTask: (id) => set(s => ({ tasks: s.tasks.filter(t => t._id !== id) })),

  // Decisions
  decisions: [],
  setDecisions: (d) => set({ decisions: d }),
  addDecision: (d) => set(s => ({ decisions: [d, ...s.decisions] })),

  // Users
  users: [],
  setUsers: (users) => set({ users }),
  updateUserStatus: (userId, status) => set(s => ({
    users: s.users.map(u => u._id === userId ? { ...u, status } : u)
  })),

  // UI
  toast: null,
  setToast: (toast) => set({ toast }),
  rightPanel: null, // 'tasks' | 'decisions' | 'members'
  setRightPanel: (panel) => set(s => ({ rightPanel: s.rightPanel === panel ? null : panel })),
  activeThread: null,
  setActiveThread: (msg) => set({ activeThread: msg }),

  // Typing
  typing: {},
  setTyping: (channelId, userId, userName, isTyping) => set(s => {
    const t = { ...s.typing };
    if (!t[channelId]) t[channelId] = {};
    if (isTyping) t[channelId][userId] = userName;
    else delete t[channelId][userId];
    return { typing: t };
  }),

  // Async loaders
  fetchChannels: async () => {
    try {
      const { data } = await api.get('/channels');
      set({ channels: data });
    } catch {}
  },
  fetchMessages: async (channelId) => {
    try {
      const { data } = await api.get(`/messages/channel/${channelId}`);
      get().setMessages(channelId, data);
    } catch {}
  },
  fetchTasks: async () => {
    try {
      const { data } = await api.get('/tasks');
      set({ tasks: data });
    } catch {}
  },
  fetchDecisions: async () => {
    try {
      const { data } = await api.get('/decisions');
      set({ decisions: data });
    } catch {}
  },
  fetchUsers: async () => {
    try {
      const { data } = await api.get('/users');
      set({ users: data });
    } catch {}
  }
}));

export default useStore;
