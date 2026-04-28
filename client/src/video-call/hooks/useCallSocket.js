/**
 * useCallSocket — Hook to manage video call socket events.
 * Handles: joining/leaving calls, signaling lifecycle, in-call chat, active call detection.
 * All events prefixed with "call:" or "webrtc:" — no conflicts with existing chat socket.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from '../../utils/socket';
import callService from '../services/callService';

export default function useCallSocket(channelId) {
  const [activeCall, setActiveCall] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [peerMediaStates, setPeerMediaStates] = useState({}); // { userId: { isCameraOn, isMicOn } }
  const currentChannelRef = useRef(channelId);
  currentChannelRef.current = channelId;

  const socket = getSocket();

  // Attach listeners when socket is available
  useEffect(() => {
    if (!socket) return;

    const onCallActive = (data) => {
      if (data.channelId === currentChannelRef.current) {
        setActiveCall(data);
        callService.setState({ activeCallInfo: data });
      }
    };

    const onCallEnded = (data) => {
      if (data.channelId === currentChannelRef.current) {
        setActiveCall(null);
        callService.setState({ activeCallInfo: null, inCall: false, channelId: null, participants: [] });
        setChatMessages([]);
      }
    };

    const onCallParticipants = (data) => {
      if (data.channelId === currentChannelRef.current) {
        callService.setState({ participants: data.participants });
        if (data.chatHistory) {
          setChatMessages(data.chatHistory);
        }
      }
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
    socket.on('call:chat-message', onChatMessage);
    socket.on('call:error', onCallError);
    socket.on('call:media-state', onMediaState);

    return () => {
      socket.off('call:active', onCallActive);
      socket.off('call:ended', onCallEnded);
      socket.off('call:participants', onCallParticipants);
      socket.off('call:chat-message', onChatMessage);
      socket.off('call:error', onCallError);
      socket.off('call:media-state', onMediaState);
    };
  }, [socket]);

  useEffect(() => {
    if (socket && channelId) {
      socket.emit('call:check', { channelId });
    }
    // Reset state on channel switch
    setActiveCall(null);
    setChatMessages([]);
    setPeerMediaStates({});
  }, [socket, channelId]);

  const startCall = useCallback(() => {
    if (!socket || !channelId) return;
    callService.setState({ inCall: true, channelId });
    socket.emit('call:start', { channelId });
  }, [socket, channelId]);

  const joinCall = useCallback(() => {
    if (!socket || !channelId) return;
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
