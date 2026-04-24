import { create } from 'zustand';
import api from '../utils/api';
import axios from 'axios';

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
  markChannelRead: (channelId) => set(s => {
    const userId = s.user?._id;
    if (!userId || !s.messages[channelId]) return s;
    return {
      messages: {
        ...s.messages,
        [channelId]: s.messages[channelId].map(m => 
          m.readBy?.includes(userId) ? m : { ...m, readBy: [...(m.readBy || []), userId] }
        )
      }
    };
  }),
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
  hideMessage: async (channelId, messageId) => {
    try {
      await api.delete(`/messages/${messageId}/hide`);
      set(s => ({
        messages: {
          ...s.messages,
          [channelId]: (s.messages[channelId] || []).filter(m => m._id !== messageId)
        }
      }));
    } catch {}
  },
  removeMessage: (channelId, messageId) => set(s => ({
    messages: {
      ...s.messages,
      [channelId]: (s.messages[channelId] || []).filter(m => m._id !== messageId)
    }
  })),
  deleteMessageForEveryone: async (channelId, messageId) => {
    try {
      await api.delete(`/messages/${messageId}/everyone`);
    } catch {}
  },
  performSend: async (tempMessage) => {
    const channelId = tempMessage.channel._id || tempMessage.channel;
    try {
      let data;
      if (tempMessage.localFile) {
        const formData = new FormData();
        formData.append('file', tempMessage.localFile);
        
        const uploadRes = await axios.post(`${api.defaults.baseURL}/messages/channel/${channelId}/upload`, formData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('nexus_token')}`
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            set(s => ({
              messages: {
                ...s.messages,
                [channelId]: (s.messages[channelId] || []).map(m => 
                  m._id === tempMessage._id ? { ...m, uploadProgress: percentCompleted } : m
                )
              }
            }));
          }
        });
        
        const fileData = uploadRes.data;

        const msgRes = await api.post('/messages', {
          channel: channelId,
          content: tempMessage.content || '',
          intentType: tempMessage.intentType,
          priority: tempMessage.priority,
          threadParent: tempMessage.threadParent?._id || tempMessage.threadParent || null,
          attachments: [{
            name: fileData.filename,
            url: fileData.fileUrl,
            type: tempMessage.localFile.type,
            size: fileData.size
          }]
        });
        
        data = msgRes.data;
      } else {
        const res = await api.post('/messages', {
          channel: channelId,
          content: tempMessage.content,
          intentType: tempMessage.intentType,
          priority: tempMessage.priority,
          threadParent: tempMessage.threadParent?._id || tempMessage.threadParent || null
        });
        data = res.data;
      }
      
      // Replace temp message with real message
      set(s => {
        const msgs = s.messages[channelId] || [];
        return {
          messages: {
            ...s.messages,
            [channelId]: msgs.map(m => m._id === tempMessage._id ? data : m)
          }
        };
      });
      
      import('../utils/socket').then(({ getSocket }) => {
        const socket = getSocket();
        socket?.emit('message:send', data);
      });
      
    } catch (err) {
      console.error('Send failed:', err);
      // Update status to failed
      set(s => {
        const msgs = s.messages[channelId] || [];
        return {
          messages: {
            ...s.messages,
            [channelId]: msgs.map(m => m._id === tempMessage._id ? { ...m, status: 'failed' } : m)
          }
        };
      });
    }
  },
  clearChannelMessages: async (channelId) => {
    try {
      await api.post(`/messages/channel/${channelId}/clear`);
      set(s => ({
        messages: { ...s.messages, [channelId]: [] }
      }));
    } catch {}
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
  showToast: (message) => {
    set({ toast: message });
    setTimeout(() => {
      // Clear if it's still the same message
      if (get().toast === message) set({ toast: null });
    }, 3000);
  },
  rightPanel: null, // 'tasks' | 'decisions' | 'members'
  setRightPanel: (panel) => set(s => ({ rightPanel: s.rightPanel === panel ? null : panel })),
  activeThread: null,
  setActiveThread: (msg) => set({ activeThread: msg }),
  replyingTo: null,
  setReplyingTo: (msg) => set({ replyingTo: msg }),

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
  },
  generateInviteLink: async (channelId) => {
    try {
      const { data } = await api.post(`/channels/${channelId}/invite`);
      return data;
    } catch (err) {
      throw err;
    }
  },
  joinChannelByInvite: async (inviteCode) => {
    try {
      const { data } = await api.post(`/channels/join/${inviteCode}`);
      if (!data.alreadyMember) {
        set(s => ({ channels: [data.channel, ...s.channels] }));
      }
      return data.channel;
    } catch (err) {
      throw err;
    }
  },
  deleteChannel: async (channelId) => {
    await api.delete(`/channels/${channelId}`);
    await get().fetchChannels();
    const s = get();
    let nextActive = s.activeChannel;
    if (s.activeChannel?._id === channelId) {
      nextActive = s.channels.length > 0 ? s.channels[0] : null;
      if (nextActive) {
        s.fetchMessages(nextActive._id);
      }
    }
    set({ activeChannel: nextActive });
  },
  renameChannel: async (channelId, name, description) => {
    await api.patch(`/channels/${channelId}`, { name, description });
    await get().fetchChannels();
    const s = get();
    if (s.activeChannel?._id === channelId) {
      const updatedChannel = s.channels.find(c => c._id === channelId);
      if (updatedChannel) {
        set({ activeChannel: updatedChannel });
      }
    }
  },
  removeMember: async (channelId, userId) => {
    const { data } = await api.delete(`/channels/${channelId}/members/${userId}`);
    set(s => ({
      channels: s.channels.map(c => c._id === channelId ? data : c),
      activeChannel: s.activeChannel?._id === channelId ? data : s.activeChannel
    }));
  },
  promoteMember: async (channelId, userId) => {
    const { data } = await api.post(`/channels/${channelId}/admins/${userId}`);
    set(s => ({
      channels: s.channels.map(c => c._id === channelId ? data : c),
      activeChannel: s.activeChannel?._id === channelId ? data : s.activeChannel
    }));
  },
  demoteMember: async (channelId, userId) => {
    const { data } = await api.delete(`/channels/${channelId}/admins/${userId}`);
    set(s => ({
      channels: s.channels.map(c => c._id === channelId ? data : c),
      activeChannel: s.activeChannel?._id === channelId ? data : s.activeChannel
    }));
  }
}));

export default useStore;
