/**
 * VideoCallContainer — Main video call UI, mounted conditionally when a user is in a call.
 * Orchestrates WebRTC, controls, video grid, and in-call chat.
 * Default state: camera OFF, mic OFF — no media acquired until user toggles.
 */
import React, { useEffect, useState, useCallback } from 'react';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import ChatBox from './ChatBox';
import useWebRTC from '../hooks/useWebRTC';
import useStore from '../../store/useStore';

export default function VideoCallContainer({ channelId, onClose, mode, callSocketData }) {
  const user = useStore(s => s.user);
  const [chatOpen, setChatOpen] = useState(true);

  const {
    chatMessages,
    leaveCall,
    sendChatMessage,
    peerMediaStates,
    startCall,
    joinCall
  } = callSocketData;

  const {
    localStream,
    remoteStreams,
    remoteStreamVersion,
    isCameraOn,
    isMicOn,
    toggleCamera,
    toggleMic,
    cleanup,
  } = useWebRTC(channelId, true);

  // Cleanup on unmount only
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  // Initiate the call AFTER useWebRTC has attached its socket listeners.
  // This guarantees we don't miss the immediate server response (e.g. call:participants).
  useEffect(() => {
    if (mode === 'start') {
      startCall();
    } else if (mode === 'join') {
      joinCall();
    }
  }, [mode, startCall, joinCall]);

  const handleLeave = useCallback(() => {
    leaveCall();
    cleanup();
    if (onClose) onClose();
  }, [leaveCall, cleanup, onClose]);

  const participantCount = 1 + Object.keys(remoteStreams).length;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Header bar */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.liveIndicator} />
            <span style={styles.headerTitle}>Video Call</span>
            <span style={styles.channelBadge}>#{useStore.getState().activeChannel?.name}</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.participantCount}>👥 {participantCount}</span>
            <button
              onClick={() => setChatOpen(p => !p)}
              style={{ ...styles.chatToggle, ...(chatOpen ? styles.chatToggleActive : {}) }}
              title="Toggle chat"
            >
              💬
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={styles.body}>
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            remoteStreamVersion={remoteStreamVersion}
            userName={user?.name || 'You'}
            isCameraOn={isCameraOn}
            peerMediaStates={peerMediaStates}
          />

          {chatOpen && (
            <ChatBox
              messages={chatMessages}
              onSend={sendChatMessage}
              currentUserId={user?._id}
            />
          )}
        </div>

        {/* Controls */}
        <Controls
          isCameraOn={isCameraOn}
          isMicOn={isMicOn}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    animation: 'fadeIn 0.3s ease',
  },
  container: {
    width: '95vw', height: '92vh', maxWidth: 1400,
    display: 'flex', flexDirection: 'column',
    background: '#0d0d14', borderRadius: 16, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(14,165,233,0.08)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', background: 'rgba(0,0,0,0.4)',
    borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  liveIndicator: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#ef4444', boxShadow: '0 0 8px #ef4444',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  headerTitle: { color: '#e8edf5', fontSize: 15, fontWeight: 700, fontFamily: "'Syne', sans-serif" },
  channelBadge: {
    fontSize: 11, padding: '2px 8px', borderRadius: 4,
    background: 'rgba(14,165,233,0.15)', color: '#0ea5e9',
    fontWeight: 600, border: '1px solid rgba(14,165,233,0.25)',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  participantCount: { color: '#7d99b8', fontSize: 13, fontWeight: 500 },
  chatToggle: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 16,
    transition: 'all 0.2s', color: '#fff',
  },
  chatToggleActive: { background: 'rgba(14,165,233,0.2)', borderColor: 'rgba(14,165,233,0.4)' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
};
