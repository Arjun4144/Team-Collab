/**
 * useCallSocket — Hook to manage video call socket events.
 * Handles: joining/leaving calls, signaling lifecycle, in-call chat, active call detection.
 * All events prefixed with "call:" or "webrtc:" — no conflicts with existing chat socket.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from '../../utils/socket';
import callService from '../services/callService';

export default function useCallSocket(meetingId) {
  const [activeCall, setActiveCall] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [peerMediaStates, setPeerMediaStates] = useState({}); // { userId: { isCameraOn, isMicOn } }
  const listenersAttached = useRef(false);
  const currentMeetingRef = useRef(meetingId);

  currentMeetingRef.current = meetingId;

  // Attach listeners once
  useEffect(() => {
    const socket = getSocket();
    if (!socket || listenersAttached.current) return;
    listenersAttached.current = true;

    const onCallActive = (data) => {
      if (data.meetingId === currentMeetingRef.current) {
        setActiveCall(data);
        callService.setState({ activeCallInfo: data });
      }
    };

    const onCallEnded = (data) => {
      if (data.meetingId === currentMeetingRef.current) {
        setActiveCall(null);
        callService.setState({ activeCallInfo: null, inCall: false, meetingId: null, participants: [] });
        setChatMessages([]);
      }
    };

    const onCallParticipants = (data) => {
      if (data.meetingId === currentMeetingRef.current) {
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
      listenersAttached.current = false;
    };
  }, []);

  // Check for active call when meeting changes
  useEffect(() => {
    const socket = getSocket();
    if (socket && meetingId) {
      socket.emit('call:check', { meetingId });
    }
    // Reset state on switch
    setActiveCall(null);
    setChatMessages([]);
    setPeerMediaStates({});
  }, [meetingId]);

  const joinCall = useCallback(() => {
    const socket = getSocket();
    if (!socket || !meetingId) return;
    callService.setState({ inCall: true, meetingId });
    socket.emit('call:join', { meetingId });
  }, [meetingId]);

  const leaveCall = useCallback(() => {
    const socket = getSocket();
    if (!socket || !meetingId) return;
    socket.emit('call:leave', { meetingId });
    callService.setState({ inCall: false, meetingId: null, participants: [] });
  }, [meetingId]);

  const sendChatMessage = useCallback((text) => {
    const socket = getSocket();
    if (!socket || !meetingId || !text.trim()) return;
    socket.emit('call:chat-message', { meetingId, text: text.trim() });
  }, [meetingId]);

  return {
    activeCall,
    chatMessages,
    peerMediaStates,
    joinCall,
    leaveCall,
    sendChatMessage
  };
}
