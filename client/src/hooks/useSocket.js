import { useEffect } from 'react';
import useStore from '../store/useStore';

export const useSocket = (socket) => {
  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg) => {
      console.log('[socket] new message received:', msg);
      useStore.getState().addMessage(msg);
    };
    const onResolved   = (msg) => useStore.getState().updateMessage(msg);
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
      useStore.getState().fetchChannels().then(() => {
        const s = useStore.getState();
        if (s.activeChannel) {
          const updated = s.channels.find(c => c._id === s.activeChannel._id);
          if (updated) useStore.getState().setActiveChannel(updated);
        }
      });
    };

    const onChannelDeleted = (channelId) => {
      useStore.getState().fetchChannels().then(() => {
        const s = useStore.getState();
        if (s.activeChannel?._id === channelId) {
          const nextActive = s.channels.length > 0 ? s.channels[0] : null;
          useStore.getState().setActiveChannel(nextActive);
          if (nextActive) useStore.getState().fetchMessages(nextActive._id);
        }
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
    socket.on('task:updated',     onTaskUp);
    socket.on('decision:new',     onDecision);
    socket.on('typing:start',     onTypingStart);
    socket.on('typing:stop',      onTypingStop);
    socket.on('user:online',      onUserOnline);
    socket.on('user:offline',     onUserOffline);
    socket.on('notification:mention', onMention);
    socket.on('channel:updated',  onChannelUpdated);
    socket.on('channel:deleted',  onChannelDeleted);

    return () => {
      socket.off('connect',          onConnect);
      socket.off('message:new',      onNewMessage);
      socket.off('message:resolved', onResolved);
      socket.off('task:updated',     onTaskUp);
      socket.off('decision:new',     onDecision);
      socket.off('typing:start',     onTypingStart);
      socket.off('typing:stop',      onTypingStop);
      socket.off('user:online',      onUserOnline);
      socket.off('user:offline',     onUserOffline);
      socket.off('notification:mention', onMention);
      socket.off('channel:updated',  onChannelUpdated);
      socket.off('channel:deleted',  onChannelDeleted);
    };
  }, [socket]);
};
