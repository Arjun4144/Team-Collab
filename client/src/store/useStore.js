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
    localStorage.removeItem('nexus_last_workspace');
    localStorage.removeItem('nexus_last_channel');
    set({ user: null, token: null, workspaces: [], channels: {}, messages: {}, summaries: {}, notifications: [], activeWorkspace: null, activeChannel: null });
  },

  // Notifications
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notif) => set(s => ({ notifications: [notif, ...s.notifications] })),
  removeNotification: (id) => set(s => ({ notifications: s.notifications.filter(n => n._id !== id) })),
  markAllNotificationsRead: () => set(s => ({ notifications: s.notifications.map(n => ({ ...n, isRead: true })) })),
  clearNotifications: () => set({ notifications: [] }),
  fetchNotifications: async () => {
    try {
      const { data } = await api.get('/notifications');
      set({ notifications: data });
    } catch {}
  },

  // Workspaces
  workspaces: [],
  activeWorkspace: null,
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspace: (workspace) => {
    if (workspace) localStorage.setItem('nexus_last_workspace', workspace._id);
    set({ activeWorkspace: workspace });
  },

  // Channels (keyed by workspaceId)
  channels: {},  // { workspaceId: [channels] }
  activeChannel: null,
  setChannels: (workspaceId, channels) => set(s => ({
    channels: { ...s.channels, [workspaceId]: channels }
  })),
  setActiveChannel: (channel) => {
    if (channel) localStorage.setItem('nexus_last_channel', channel._id);
    set({ activeChannel: channel });
  },
  selectChannel: async (ch) => {
    const s = get();
    if (!ch || !ch._id) {
      set({ activeChannel: null });
      localStorage.removeItem('nexus_last_channel');
      return;
    }
    if (s.activeChannel?._id !== ch._id) {
      import('../utils/socket').then(({ getSocket }) => {
        const socket = getSocket();
        socket?.emit('channel:join', ch._id);
      });
      set({ activeChannel: ch });
      if (ch) localStorage.setItem('nexus_last_channel', ch._id);
      s.fetchMessages(ch._id);
      try {
        s.markChannelRead(ch._id);
        // Reset unread count in channels state (server-backed)
        const wsId = ch.workspaceId;
        if (wsId) {
          set(s2 => ({
            channels: {
              ...s2.channels,
              [wsId]: (s2.channels[wsId] || []).map(c =>
                c._id === ch._id ? { ...c, unreadCount: 0 } : c
              )
            }
          }));
        }
        await api.post(`/messages/channel/${ch._id}/read`);
      } catch { }
    }
  },
  addChannel: (workspaceId, channel) => set(s => ({
    channels: {
      ...s.channels,
      [workspaceId]: [channel, ...(s.channels[workspaceId] || [])]
    }
  })),
  incrementChannelUnread: (channelId) => set(s => {
    const newChannels = { ...s.channels };
    for (const wsId of Object.keys(newChannels)) {
      const idx = newChannels[wsId].findIndex(c => c._id === channelId);
      if (idx !== -1) {
        newChannels[wsId] = newChannels[wsId].map(c =>
          c._id === channelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
        );
        break;
      }
    }
    return { channels: newChannels };
  }),
  selectWorkspace: async (workspace) => {
    const s = get();
    set({ activeWorkspace: workspace });
    if (workspace) {
      localStorage.setItem('nexus_last_workspace', workspace._id);
      await s.fetchChannelsForWorkspace(workspace._id);
      // Auto-select #general or last channel
      const wsChannels = get().channels[workspace._id] || [];
      const lastChId = localStorage.getItem('nexus_last_channel');
      let targetChannel = wsChannels.find(c => c._id === lastChId);
      if (!targetChannel) targetChannel = wsChannels.find(c => c.name === 'general');
      if (!targetChannel && wsChannels.length > 0) targetChannel = wsChannels[0];
      if (targetChannel) s.selectChannel(targetChannel);
      else set({ activeChannel: null });
    }
  },

  // Messages
  messages: {},
  setMessages: (channelId, msgs) => set(s => {
    const userId = s.user?._id ? String(s.user._id) : null;
    const activeChId = s.activeChannel?._id ? String(s.activeChannel._id) : null;
    const targetChId = String(channelId);
    const isActive = activeChId === targetChId;

    const processedMsgs = msgs.map(m => {
      let readByArray = Array.isArray(m.readBy) ? m.readBy : [];
      readByArray = readByArray.map(rb => (typeof rb === 'object' && rb !== null && rb._id) ? String(rb._id) : String(rb));

      if (isActive && userId && !readByArray.includes(userId)) {
        readByArray = [...readByArray, userId];
      }
      return { ...m, readBy: readByArray };
    });

    return {
      messages: { ...s.messages, [channelId]: processedMsgs }
    };
  }),
  markChannelRead: (channelId) => set(s => {
    const userId = s.user?._id ? String(s.user._id) : null;
    if (!userId || !s.messages[channelId]) return s;
    return {
      messages: {
        ...s.messages,
        [channelId]: s.messages[channelId].map(m => {
          let readByArray = Array.isArray(m.readBy) ? m.readBy : [];
          readByArray = readByArray.map(rb => (typeof rb === 'object' && rb !== null && rb._id) ? String(rb._id) : String(rb));

          if (!readByArray.includes(userId)) {
            return { ...m, readBy: [...readByArray, userId] };
          }
          return { ...m, readBy: readByArray };
        })
      }
    };
  }),
  addMessage: (msg) => {
    const rawChannelId = msg.channel?._id || msg.channel;
    const channelId = String(rawChannelId);

    set(s => {
      const userId = s.user?._id ? String(s.user._id) : null;
      const activeChId = s.activeChannel?._id ? String(s.activeChannel._id) : null;
      const isActive = activeChId === channelId;

      let readByArray = Array.isArray(msg.readBy) ? msg.readBy : [];
      readByArray = readByArray.map(rb => (typeof rb === 'object' && rb !== null && rb._id) ? String(rb._id) : String(rb));

      if (isActive && userId && !readByArray.includes(userId)) {
        readByArray = [...readByArray, userId];
      }

      const processedMsg = { ...msg, readBy: readByArray };
      const currentMsgs = s.messages[channelId] || [];
      const exists = currentMsgs.some(m => String(m._id) === String(msg._id));

      return {
        messages: {
          ...s.messages,
          [channelId]: exists
            ? currentMsgs.map(m => String(m._id) === String(msg._id) ? processedMsg : m)
            : [...currentMsgs, processedMsg]
        }
      };
    });
  },
  updateMessage: (updated) => {
    const rawChannelId = updated.channel?._id || updated.channel;
    const channelId = String(rawChannelId);

    set(s => {
      let readByArray = Array.isArray(updated.readBy) ? updated.readBy : [];
      readByArray = readByArray.map(rb => (typeof rb === 'object' && rb !== null && rb._id) ? String(rb._id) : String(rb));
      const processedUpdated = { ...updated, readBy: readByArray };

      return {
        messages: {
          ...s.messages,
          [channelId]: (s.messages[channelId] || []).map(m =>
            String(m._id) === String(updated._id) ? processedUpdated : m
          )
        }
      };
    });
  },
  hideMessage: async (channelId, messageId) => {
    try {
      await api.delete(`/messages/${messageId}/hide`);
      set(s => ({
        messages: {
          ...s.messages,
          [channelId]: (s.messages[channelId] || []).filter(m => String(m._id) !== String(messageId))
        }
      }));
    } catch { }
  },
  removeMessage: (channelId, messageId) => set(s => ({
    messages: {
      ...s.messages,
      [channelId]: (s.messages[channelId] || []).filter(m => String(m._id) !== String(messageId))
    }
  })),
  updateMessageReplyCount: (channelId, messageId, replyCount) => set(s => ({
    messages: {
      ...s.messages,
      [channelId]: (s.messages[channelId] || []).map(m =>
        String(m._id) === String(messageId) ? { ...m, replyCount } : m
      )
    },
    activeThread: (s.activeThread && String(s.activeThread._id) === String(messageId))
      ? { ...s.activeThread, replyCount }
      : s.activeThread
  })),
  softDeleteMessage: (channelId, messageId) => set(s => ({
    messages: {
      ...s.messages,
      [channelId]: (s.messages[channelId] || []).map(m =>
        String(m._id) === String(messageId) ? { ...m, content: 'Deleted by admin', attachments: [], isDeleted: true } : m
      )
    },
    activeThread: (s.activeThread && String(s.activeThread._id) === String(messageId))
      ? { ...s.activeThread, content: 'Deleted by admin', attachments: [], isDeleted: true }
      : s.activeThread
  })),
  deleteMessageForEveryone: async (channelId, messageId) => {
    // Optimistically soft-delete for the current user immediately
    get().softDeleteMessage(channelId, messageId);
    try {
      await api.delete(`/messages/${messageId}/everyone`);
    } catch { }
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
          }],
          messageType: tempMessage.messageType || 'text',
          audioDuration: tempMessage.audioDuration || 0
        });

        data = msgRes.data;
      } else {
        const res = await api.post('/messages', {
          channel: channelId,
          content: tempMessage.content,
          intentType: tempMessage.intentType,
          priority: tempMessage.priority,
          threadParent: tempMessage.threadParent?._id || tempMessage.threadParent || null,
          messageType: tempMessage.messageType || 'text',
          audioDuration: tempMessage.audioDuration || 0
        });
        data = res.data;
      }

      // Replace temp message with real message
      set(s => {
        const msgs = s.messages[channelId] || [];
        const alreadyExists = msgs.some(m => String(m._id) === String(data._id));
        return {
          messages: {
            ...s.messages,
            [channelId]: alreadyExists
              ? msgs.filter(m => String(m._id) !== String(tempMessage._id))
              : msgs.map(m => String(m._id) === String(tempMessage._id) ? data : m)
          }
        };
      });

      import('../utils/socket').then(({ getSocket }) => {
        const socket = getSocket();
        if (!data.threadParent) {
          socket?.emit('message:send', data);
        }
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
    } catch { }
  },

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set(s => {
    if (s.tasks.some(t => t._id === task._id)) return s;
    return { tasks: [task, ...s.tasks] };
  }),
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
  taskDraft: null,
  setTaskDraft: (draft) => set({ taskDraft: draft }),
  activeThread: null,
  setActiveThread: (msg) => set({ activeThread: msg }),
  replyingTo: null,
  setReplyingTo: (msg) => set({ replyingTo: msg }),

  // Summaries
  summaries: {}, // { [channelId]: { text: string, hidden: boolean, activeUser: boolean } }
  setChannelSummary: (channelId, summary, activeUser = false) => set(s => ({
    summaries: {
      ...s.summaries,
      [channelId]: { text: summary, hidden: false, activeUser }
    }
  })),
  hideChannelSummary: (channelId) => set(s => {
    const current = s.summaries[channelId];
    if (!current) return s;
    return {
      summaries: {
        ...s.summaries,
        [channelId]: { ...current, hidden: true }
      }
    };
  }),

  // Typing
  typing: {},
  setTyping: (channelId, userId, userName, isTyping) => set(s => {
    if (String(s.user?._id) === String(userId)) return s;

    const t = { ...s.typing };
    if (!t[channelId]) t[channelId] = {};

    const key = `${channelId}_${userId}`;
    if (window._typingTimeouts && window._typingTimeouts[key]) {
      clearTimeout(window._typingTimeouts[key]);
    }
    if (!window._typingTimeouts) window._typingTimeouts = {};

    if (isTyping) {
      t[channelId][userId] = userName;
      window._typingTimeouts[key] = setTimeout(() => {
        get().setTyping(channelId, userId, null, false);
      }, 3000);
    } else {
      delete t[channelId][userId];
    }
    return { typing: t };
  }),

  // Async loaders
  fetchWorkspaces: async () => {
    try {
      const { data } = await api.get('/workspaces');
      set({ workspaces: data });
      return data;
    } catch { return []; }
  },
  fetchChannelsForWorkspace: async (workspaceId) => {
    try {
      const { data } = await api.get(`/channels/workspace/${workspaceId}`);
      set(s => ({ channels: { ...s.channels, [workspaceId]: data } }));
      return data;
    } catch { return []; }
  },
  fetchChannels: async () => {
    // Fetch all channels user is in (backward compat used by socket handlers)
    try {
      const { data } = await api.get('/channels');
      // Group them by workspaceId
      const grouped = {};
      data.forEach(ch => {
        const wsId = ch.workspaceId;
        if (wsId) {
          if (!grouped[wsId]) grouped[wsId] = [];
          grouped[wsId].push(ch);
        }
      });
      set(s => ({ channels: { ...s.channels, ...grouped } }));
    } catch { }
  },
  fetchMessages: async (channelId) => {
    try {
      const { data } = await api.get(`/messages/channel/${channelId}`);
      get().setMessages(channelId, data);
    } catch { }
  },
  fetchTasks: async () => {
    try {
      const { data } = await api.get('/tasks');
      set({ tasks: data });
    } catch { }
  },
  fetchDecisions: async () => {
    try {
      const { data } = await api.get('/decisions');
      set({ decisions: data });
    } catch { }
  },
  fetchUsers: async () => {
    try {
      const { data } = await api.get('/users');
      set({ users: data });
    } catch { }
  },

  // Workspace actions
  createWorkspace: async (name) => {
    const { data } = await api.post('/workspaces', { name });
    set(s => ({ workspaces: [data, ...s.workspaces] }));
    return data;
  },
  renameWorkspace: async (workspaceId, name) => {
    const { data } = await api.put(`/workspaces/${workspaceId}`, { name });
    set(s => ({
      workspaces: s.workspaces.map(ws => ws._id === workspaceId ? data : ws),
      activeWorkspace: s.activeWorkspace?._id === workspaceId ? data : s.activeWorkspace
    }));
    return data;
  },
  deleteWorkspace: async (workspaceId) => {
    await api.delete(`/workspaces/${workspaceId}`);
    const s = get();
    set(s2 => ({
      workspaces: s2.workspaces.filter(ws => ws._id !== workspaceId),
      activeWorkspace: s2.activeWorkspace?._id === workspaceId ? null : s2.activeWorkspace,
      activeChannel: s2.activeWorkspace?._id === workspaceId ? null : s2.activeChannel
    }));
    // Select next workspace
    const remaining = get().workspaces;
    if (remaining.length > 0 && (!get().activeWorkspace)) {
      get().selectWorkspace(remaining[0]);
    }
  },
  generateInviteLink: async (workspaceId) => {
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/invite`);
      return data;
    } catch (err) {
      throw err;
    }
  },
  joinWorkspaceByInvite: async (inviteCode) => {
    try {
      const { data } = await api.post(`/workspaces/join/${inviteCode}`);
      if (!data.alreadyMember) {
        set(s => ({ workspaces: [data.workspace, ...s.workspaces] }));
      }
      return data.workspace;
    } catch (err) {
      throw err;
    }
  },

  // Channel actions (workspace-scoped)
  createChannel: async (workspaceId, name, description) => {
    const { data } = await api.post('/channels', { name, description, workspaceId });
    set(s => ({
      channels: {
        ...s.channels,
        [workspaceId]: [data, ...(s.channels[workspaceId] || [])]
      }
    }));
    return data;
  },
  deleteChannel: async (channelId) => {
    await api.delete(`/channels/${channelId}`);
    const s = get();
    // Refresh channels for active workspace
    if (s.activeWorkspace) {
      await s.fetchChannelsForWorkspace(s.activeWorkspace._id);
    }
    if (s.activeChannel?._id === channelId) {
      const wsChannels = get().channels[s.activeWorkspace?._id] || [];
      const general = wsChannels.find(c => c.name === 'general') || wsChannels[0] || null;
      if (general) s.selectChannel(general);
      else set({ activeChannel: null });
    }
  },
  renameChannel: async (channelId, name, description) => {
    await api.patch(`/channels/${channelId}`, { name, description });
    const s = get();
    if (s.activeWorkspace) {
      await s.fetchChannelsForWorkspace(s.activeWorkspace._id);
    }
    if (s.activeChannel?._id === channelId) {
      const wsChannels = get().channels[s.activeWorkspace?._id] || [];
      const updatedChannel = wsChannels.find(c => c._id === channelId);
      if (updatedChannel) set({ activeChannel: updatedChannel });
    }
  },
  removeMember: async (channelId, userId) => {
    const { data } = await api.delete(`/channels/${channelId}/members/${userId}`);
    // If it's a workspace channel, the 'workspace:userRemoved' socket event handles the state update instantly.
    // We only manually update here for legacy/non-workspace channels.
    if (!data.workspaceId) {
      const s = get();
      if (s.activeWorkspace) {
        const wsId = s.activeWorkspace._id;
        set(s2 => ({
          channels: {
            ...s2.channels,
            [wsId]: (s2.channels[wsId] || []).map(c => c._id === channelId ? data : c)
          },
          activeChannel: s2.activeChannel?._id === channelId ? data : s2.activeChannel
        }));
      }
    }
  },
  promoteMember: async (channelId, userId) => {
    const { data } = await api.post(`/channels/${channelId}/admins/${userId}`);
    if (!data.workspaceId) {
      const s = get();
      if (s.activeWorkspace) {
        const wsId = s.activeWorkspace._id;
        set(s2 => ({
          channels: {
            ...s2.channels,
            [wsId]: (s2.channels[wsId] || []).map(c => c._id === channelId ? data : c)
          },
          activeChannel: s2.activeChannel?._id === channelId ? data : s2.activeChannel
        }));
      }
    }
  },
  demoteMember: async (channelId, userId) => {
    const { data } = await api.delete(`/channels/${channelId}/admins/${userId}`);
    if (!data.workspaceId) {
      const s = get();
      if (s.activeWorkspace) {
        const wsId = s.activeWorkspace._id;
        set(s2 => ({
          channels: {
            ...s2.channels,
            [wsId]: (s2.channels[wsId] || []).map(c => c._id === channelId ? data : c)
          },
          activeChannel: s2.activeChannel?._id === channelId ? data : s2.activeChannel
        }));
      }
    }
  },
  leaveWorkspace: async (workspaceId) => {
    await api.delete(`/workspaces/${workspaceId}/leave`);
    const s = get();
    set(s2 => ({
      workspaces: s2.workspaces.filter(ws => ws._id !== workspaceId)
    }));
    
    if (s.activeWorkspace?._id === workspaceId) {
      const remaining = get().workspaces;
      if (remaining.length > 0) {
        get().selectWorkspace(remaining[0]);
      } else {
        set({ activeWorkspace: null, activeChannel: null });
      }
    }
  }
}));

export default useStore;
