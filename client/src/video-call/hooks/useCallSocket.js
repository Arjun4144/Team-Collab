/**
 * useCallSocket — Hook to manage video call socket events.
 * Handles: joining/leaving calls, signaling lifecycle, in-call chat, active call detection.
 * All events prefixed with "call:" or "webrtc:" — no conflicts with existing chat socket.
 */
import { useEffect, useCallback, useState } from 'react';
import { getSocket } from '../../utils/socket';
import callService from '../services/callService';

const normalizeParticipants = (participants) => (
  Array.isArray(participants) ? participants : []
);

const isSameChannel = (a, b) => String(a || '') === String(b || '');

const buildActiveCallInfo = (channelId, participants, startedBy) => {
  const info = { channelId, participants };
  if (startedBy) info.startedBy = startedBy;
  return info;
};

export default function useCallSocket(channelId) {
  const [activeCall, setActiveCall] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [peerMediaStates, setPeerMediaStates] = useState({}); // { userId: { isCameraOn, isMicOn } }

  const socket = getSocket();

  const replaceActiveCall = useCallback((data) => {
    const participants = normalizeParticipants(data.participants);
    const nextActiveCall = participants.length > 0
      ? buildActiveCallInfo(data.channelId, participants, data.startedBy)
      : null;

    setActiveCall(nextActiveCall);
    callService.setState({
      activeCallInfo: nextActiveCall,
      participants
    });
  }, []);

  const replaceParticipants = useCallback((data) => {
    const participants = normalizeParticipants(data.participants);
    const currentInfo = callService.getState().activeCallInfo;
    const startedBy = data.startedBy || (
      isSameChannel(currentInfo?.channelId, data.channelId) ? currentInfo?.startedBy : undefined
    );
    const nextActiveCall = participants.length > 0
      ? buildActiveCallInfo(data.channelId, participants, startedBy)
      : null;

    setActiveCall(nextActiveCall);
    callService.setState({
      activeCallInfo: nextActiveCall,
      participants
    });

    if (Array.isArray(data.chatHistory)) {
      setChatMessages(data.chatHistory);
    }
  }, []);

  const updateParticipants = useCallback((data, updateFn) => {
    const currentInfo = callService.getState().activeCallInfo;
    const currentParticipants = isSameChannel(currentInfo?.channelId, data.channelId)
      ? normalizeParticipants(currentInfo.participants)
      : [];
    const participants = updateFn(currentParticipants);
    const startedBy = data.startedBy || (
      isSameChannel(currentInfo?.channelId, data.channelId) ? currentInfo?.startedBy : undefined
    );
    const nextActiveCall = participants.length > 0
      ? buildActiveCallInfo(data.channelId, participants, startedBy)
      : null;

    setActiveCall(nextActiveCall);
    callService.setState({
      activeCallInfo: nextActiveCall,
      participants
    });
  }, []);

  // Attach listeners when socket is available
  useEffect(() => {
    if (!socket || !channelId) return;

    console.log(`[CallSocket] Attaching listeners | socketId=${socket.id} | channelId=${channelId}`);

    const isCurrentChannel = (data) => isSameChannel(data?.channelId, channelId);

    const onCallActive = (data) => {
      console.log(`[CallSocket] call:active received | channelId=${data.channelId} | participants=${data.participants?.length}`);
      if (!isCurrentChannel(data)) return;
      replaceActiveCall(data);
    };

    const onCallEnded = (data) => {
      if (!isCurrentChannel(data)) return;
      setActiveCall(null);
      callService.setState({ activeCallInfo: null, inCall: false, channelId: null, participants: [] });
      setChatMessages([]);
    };

    const onCallParticipants = (data) => {
      console.log(`[CallSocket] call:participants received | channelId=${data.channelId} | count=${data.participants?.length} | ids=${data.participants?.map(p => p.socketId?.slice(-6)).join(',')}`);
      if (!isCurrentChannel(data)) return;
      replaceParticipants(data);
    };

    const onUserJoined = (data) => {
      if (!isCurrentChannel(data)) return;
      updateParticipants(data, (participants) => {
        const alreadyPresent = participants.some(p => p.socketId === data.socketId);
        if (alreadyPresent) return participants;
        return [
          ...participants,
          { socketId: data.socketId, userId: data.userId, userName: data.userName }
        ];
      });
    };

    const onUserLeft = (data) => {
      if (!isCurrentChannel(data)) return;
      updateParticipants(data, (participants) => (
        participants.filter(p => p.socketId !== data.socketId)
      ));
    };

    const onChatMessage = (msg) => {
      setChatMessages(prev => [...prev, msg]);
    };

    const onCallError = (data) => {
      console.warn('[VideoCall] Error:', data.message);
    };

    const onMediaState = ({ userId, isCameraOn, isMicOn, isScreenSharing }) => {
      setPeerMediaStates(prev => ({ ...prev, [userId]: { isCameraOn, isMicOn, isScreenSharing } }));
    };

    socket.on('call:active', onCallActive);
    socket.on('call:ended', onCallEnded);
    socket.on('call:participants', onCallParticipants);
    socket.on('call:user-joined', onUserJoined);
    socket.on('call:user-left', onUserLeft);
    socket.on('call:chat-message', onChatMessage);
    socket.on('call:error', onCallError);
    socket.on('call:media-state', onMediaState);

    return () => {
      socket.off('call:active', onCallActive);
      socket.off('call:ended', onCallEnded);
      socket.off('call:participants', onCallParticipants);
      socket.off('call:user-joined', onUserJoined);
      socket.off('call:user-left', onUserLeft);
      socket.off('call:chat-message', onChatMessage);
      socket.off('call:error', onCallError);
      socket.off('call:media-state', onMediaState);
    };
  }, [socket, channelId, replaceActiveCall, replaceParticipants, updateParticipants]);

  useEffect(() => {
    // Reset state on channel switch before asking the server for the current call.
    setActiveCall(null);
    setChatMessages([]);
    setPeerMediaStates({});
    callService.setState({ activeCallInfo: null, participants: [] });

    if (socket && channelId) {
      socket.emit('call:check', { channelId });
    }
  }, [socket, channelId]);

  const startCall = useCallback(() => {
    if (!socket || !channelId) return;
    console.log(`[CallSocket] Emitting call:start | socketId=${socket.id} | channelId=${channelId}`);
    callService.setState({ inCall: true, channelId });
    socket.emit('call:start', { channelId });
  }, [socket, channelId]);

  const joinCall = useCallback(() => {
    if (!socket || !channelId) return;
    console.log(`[CallSocket] Emitting call:join | socketId=${socket.id} | channelId=${channelId}`);
    callService.setState({ inCall: true, channelId });
    socket.emit('call:join', { channelId });
  }, [socket, channelId]);

  const leaveCall = useCallback(() => {
    if (!socket || !channelId) return;
    socket.emit('call:leave', { channelId });
    callService.setState({ inCall: false, channelId: null, participants: [] });
  }, [socket, channelId]);

  const sendChatMessage = useCallback((text) => {
    if (!socket || !channelId || !text.trim()) return;
    socket.emit('call:chat-message', { channelId, text: text.trim() });
  }, [socket, channelId]);

  return {
    activeCall,
    chatMessages,
    peerMediaStates,
    startCall,
    joinCall,
    leaveCall,
    sendChatMessage
  };
}
