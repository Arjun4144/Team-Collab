import { useEffect } from 'react';
import useStore from '../store/useStore';

export const useSocket = (socket) => {
  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg) => {
      const state = useStore.getState();
      const channelId = String(msg.channel?._id || msg.channel);
      const activeChId = state.activeChannel ? String(state.activeChannel._id) : null;
      
      if (activeChId === channelId) {
        import('../utils/api').then(({ default: api }) => {
          api.post(`/messages/channel/${channelId}/read`).catch(() => {});
        });
      } else {
        // Increment unread count for non-active channels
        state.incrementChannelUnread(channelId);
      }
      state.addMessage(msg);
    };
    const onResolved   = (msg) => useStore.getState().updateMessage(msg);
    const onMessageUpdated = (data) => {
      const state = useStore.getState();
      const channelId = data.channelId || data.channel;
      const msgs = state.messages[channelId] || [];
      const msg = msgs.find(m => m._id === data.messageId);
      if (msg) {
        state.updateMessage({ ...msg, ...data.updates });
      }
    };
    const onReplyAdded = (data) => {
      const state = useStore.getState();
      const reply = data.reply;
      const channelId = String(reply?.channel?._id || reply?.channel);
      
      if (reply) {
        const activeChId = state.activeChannel ? String(state.activeChannel._id) : null;
        if (activeChId === channelId) {
          import('../utils/api').then(({ default: api }) => {
            api.post(`/messages/channel/${channelId}/read`).catch(() => {});
          });
        } else {
          state.incrementChannelUnread(channelId);
        }
        state.addMessage(reply);
      }

      const msgs = state.messages[channelId] || [];
      const msg = msgs.find(m => String(m._id) === String(data.messageId));
      if (msg) {
        state.updateMessageReplyCount(channelId, data.messageId, data.replyCount);
      }
    };
    const onReplyDeleted = (data) => {
      const state = useStore.getState();
      const channelId = data.channelId || data.channel;
      const msgs = state.messages[channelId] || [];
      const parentMsg = msgs.find(m => String(m._id) === String(data.messageId));
      if (parentMsg) {
        state.updateMessageReplyCount(channelId, data.messageId, data.replyCount);
      }
      state.softDeleteMessage(channelId, data.replyId);
    };
    const onMessageDeleted = (data) => {
      const state = useStore.getState();
      const channelId = data.channelId || data.channel;
      state.softDeleteMessage(channelId, data._id);
    };
    const onTaskUp     = (task) => useStore.getState().updateTask(task);
    const onDecision   = (d)   => useStore.getState().addDecision(d);
    const onTypingStart = ({ userId, userName, channelId }) => {
      useStore.getState().setTyping(channelId, userId, userName, true);
    };
    const onTypingStop = ({ userId, channelId }) => {
      useStore.getState().setTyping(channelId, userId, null, false);
    };
    const onUserOnline = ({ userId, status }) => {
      useStore.getState().updateUserStatus(userId, status);
    };
    const onUserOffline = ({ userId, status }) => {
      useStore.getState().updateUserStatus(userId, status);
    };
    const onMention = (data) => {
      useStore.getState().setToast(data);
      // auto hide toast after 5s
      setTimeout(() => {
        const currentToast = useStore.getState().toast;
        if (currentToast && currentToast.messageId === data.messageId) {
          useStore.getState().setToast(null);
        }
      }, 5000);
    };

    const onChannelUpdated = () => {
      const s = useStore.getState();
      if (s.activeWorkspace) {
        s.fetchChannelsForWorkspace(s.activeWorkspace._id).then(() => {
          const state = useStore.getState();
          if (state.activeChannel && state.activeWorkspace) {
            const wsChannels = state.channels[state.activeWorkspace._id] || [];
            const updated = wsChannels.find(c => c._id === state.activeChannel._id);
            if (updated) useStore.getState().setActiveChannel(updated);
          }
        });
      }
    };

    const onChannelCreated = ({ channel, workspaceId }) => {
      const s = useStore.getState();
      if (workspaceId) {
        s.fetchChannelsForWorkspace(workspaceId);
      }
      // Auto-join the socket room for the new channel
      socket.emit('channel:join', channel._id);
    };

    const onChannelDeleted = (data) => {
      const channelId = typeof data === 'string' ? data : data.channelId;
      const s = useStore.getState();
      if (s.activeWorkspace) {
        s.fetchChannelsForWorkspace(s.activeWorkspace._id).then(() => {
          const state = useStore.getState();
          if (state.activeChannel?._id === channelId) {
            const wsChannels = state.channels[state.activeWorkspace?._id] || [];
            const general = wsChannels.find(c => c.name === 'general') || wsChannels[0] || null;
            if (general) useStore.getState().selectChannel(general);
            else useStore.getState().setActiveChannel(null);
          }
        });
      }
    };

    const onWorkspaceUpdated = (workspace) => {
      useStore.getState().fetchWorkspaces();
      const s = useStore.getState();
      if (s.activeWorkspace?._id === workspace._id) {
        useStore.setState({ activeWorkspace: workspace });
      }
    };

    const onWorkspaceDeleted = (workspaceId) => {
      const s = useStore.getState();
      useStore.setState(state => ({
        workspaces: state.workspaces.filter(ws => ws._id !== workspaceId)
      }));
      if (s.activeWorkspace?._id === workspaceId) {
        const remaining = useStore.getState().workspaces;
        if (remaining.length > 0) {
          useStore.getState().selectWorkspace(remaining[0]);
        } else {
          useStore.setState({ activeWorkspace: null, activeChannel: null });
        }
      }
    };

    const onWorkspaceUserRemoved = ({ workspaceId, userId, updatedMembers }) => {
      const state = useStore.getState();
      const currentUserId = state.user?._id;
      
      if (currentUserId === userId) {
        // I was removed
        useStore.setState(s => ({
          workspaces: s.workspaces.filter(ws => ws._id !== workspaceId)
        }));
        
        if (state.activeWorkspace?._id === workspaceId) {
          const remaining = useStore.getState().workspaces;
          if (remaining.length > 0) {
            useStore.getState().selectWorkspace(remaining[0]);
          } else {
            useStore.setState({ activeWorkspace: null, activeChannel: null });
          }
        }
      } else {
        // Someone else was removed. Replace members directly from server payload
        useStore.setState(s => {
          const updateWs = ws => ws._id === workspaceId ? { ...ws, members: updatedMembers } : ws;
          return {
            workspaces: s.workspaces.map(updateWs),
            activeWorkspace: s.activeWorkspace ? updateWs(s.activeWorkspace) : null
          };
        });
      }
    };

    const onWorkspaceUserJoined = ({ workspaceId, newUser, updatedMembers }) => {
      useStore.setState(s => {
        const updateWs = ws => ws._id === workspaceId ? { ...ws, members: updatedMembers } : ws;
        const updateCh = ch => ch.workspaceId === workspaceId ? { ...ch, members: updatedMembers } : ch;
        
        const newChannelsMap = { ...s.channels };
        if (newChannelsMap[workspaceId]) {
          newChannelsMap[workspaceId] = newChannelsMap[workspaceId].map(updateCh);
        }

        return {
          workspaces: s.workspaces.map(updateWs),
          activeWorkspace: s.activeWorkspace ? updateWs(s.activeWorkspace) : null,
          channels: newChannelsMap,
          activeChannel: s.activeChannel ? updateCh(s.activeChannel) : null
        };
      });
    };

    const onWorkspaceUserRoleUpdated = ({ workspaceId, userId, newRole, updatedMembers }) => {
      useStore.setState(s => {
        const updateWs = ws => {
          if (ws._id !== workspaceId) return ws;
          let newAdmins = ws.admins || [];
          const isAlreadyAdmin = newAdmins.some(a => (a._id || a) === userId);
          if (newRole === 'Admin' && !isAlreadyAdmin) {
            newAdmins = [...newAdmins, userId];
          } else if (newRole === 'Member') {
            newAdmins = newAdmins.filter(a => (a._id || a) !== userId);
          }
          return { ...ws, members: updatedMembers, admins: newAdmins };
        };

        const updateCh = ch => {
          if (ch.workspaceId !== workspaceId) return ch;
          let newAdmins = ch.admins || [];
          const isAlreadyAdmin = newAdmins.some(a => (a._id || a) === userId);
          if (newRole === 'Admin' && !isAlreadyAdmin) {
            newAdmins = [...newAdmins, userId];
          } else if (newRole === 'Member') {
            newAdmins = newAdmins.filter(a => (a._id || a) !== userId);
          }
          return { ...ch, admins: newAdmins };
        };

        const updatedWorkspaces = s.workspaces.map(updateWs);
        const newActiveWorkspace = s.activeWorkspace ? updateWs(s.activeWorkspace) : null;
        
        const newChannelsMap = { ...s.channels };
        if (newChannelsMap[workspaceId]) {
          newChannelsMap[workspaceId] = newChannelsMap[workspaceId].map(updateCh);
        }
        
        const newActiveChannel = s.activeChannel ? updateCh(s.activeChannel) : null;

        return { 
          workspaces: updatedWorkspaces, 
          activeWorkspace: newActiveWorkspace,
          channels: newChannelsMap,
          activeChannel: newActiveChannel
        };
      });
    };

    const onConnect = () => {
      const activeCh = useStore.getState().activeChannel;
      if (activeCh) {
        socket.emit('channel:join', activeCh._id);
      }
      // Re-fetch users on connect/reconnect to get fresh online status
      // (fixes race condition where user:online events fire before listeners are ready)
      useStore.getState().fetchUsers();
    };

    socket.on('connect', onConnect);
    socket.on('message:new',      onNewMessage);
    socket.on('message:resolved', onResolved);
    socket.on('messageUpdated',   onMessageUpdated);
    socket.on('replyAdded', onReplyAdded);
    socket.on('replyDeleted', onReplyDeleted);
    socket.on('message:deleted',  onMessageDeleted);
    socket.on('task:updated',     onTaskUp);
    socket.on('decision:new',     onDecision);
    socket.on('typing:start',     onTypingStart);
    socket.on('typing:stop',      onTypingStop);
    socket.on('user:online',      onUserOnline);
    socket.on('user:offline',     onUserOffline);
    socket.on('notification:mention', onMention);
    socket.on('channel:updated',  onChannelUpdated);
    socket.on('channel:created',  onChannelCreated);
    socket.on('channel:deleted',  onChannelDeleted);
    socket.on('workspace:updated', onWorkspaceUpdated);
    socket.on('workspace:deleted', onWorkspaceDeleted);
    socket.on('workspace:userRemoved', onWorkspaceUserRemoved);
    socket.on('workspace:userJoined', onWorkspaceUserJoined);
    socket.on('workspace:userRoleUpdated', onWorkspaceUserRoleUpdated);

    return () => {
      socket.off('connect',          onConnect);
      socket.off('message:new',      onNewMessage);
      socket.off('message:resolved', onResolved);
      socket.off('messageUpdated',   onMessageUpdated);
      socket.off('replyAdded', onReplyAdded);
      socket.off('replyDeleted', onReplyDeleted);
      socket.off('message:deleted',  onMessageDeleted);
      socket.off('task:updated',     onTaskUp);
      socket.off('decision:new',     onDecision);
      socket.off('typing:start',     onTypingStart);
      socket.off('typing:stop',      onTypingStop);
      socket.off('user:online',      onUserOnline);
      socket.off('user:offline',     onUserOffline);
      socket.off('notification:mention', onMention);
      socket.off('channel:updated',  onChannelUpdated);
      socket.off('channel:created',  onChannelCreated);
      socket.off('channel:deleted',  onChannelDeleted);
      socket.off('workspace:updated', onWorkspaceUpdated);
      socket.off('workspace:deleted', onWorkspaceDeleted);
      socket.off('workspace:userRemoved', onWorkspaceUserRemoved);
      socket.off('workspace:userJoined', onWorkspaceUserJoined);
      socket.off('workspace:userRoleUpdated', onWorkspaceUserRoleUpdated);
    };
  }, [socket]);
};
