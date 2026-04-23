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
      useStore.getState().setToast(data.message);
      // auto hide toast after 5s
      setTimeout(() => useStore.getState().setToast(null), 5000);
    };

    const onConnect = () => {
      const activeCh = useStore.getState().activeChannel;
      if (activeCh) {
        socket.emit('channel:join', activeCh._id);
      }
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
    };
  }, [socket]);
};
