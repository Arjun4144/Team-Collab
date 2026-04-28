import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import VideoGrid from '../video-call/components/VideoGrid';
import Controls from '../video-call/components/Controls';
import ChatBox from '../video-call/components/ChatBox';
import useWebRTC from '../video-call/hooks/useWebRTC';
import useCallSocket from '../video-call/hooks/useCallSocket';
import useStore from '../store/useStore';

export default function MeetingPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const user = useStore(s => s.user);
  
  const [chatOpen, setChatOpen] = useState(true);
  const [viewMode, setViewMode] = useState('gallery');

  // Hook into the signaling socket for this meeting
  const {
    chatMessages,
    joinCall,
    leaveCall,
    sendChatMessage,
    peerMediaStates
  } = useCallSocket(meetingId);

  // Hook into WebRTC mesh
  const {
    localStream,
    remoteStreams,
    remoteStreamVersion,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    cleanup,
  } = useWebRTC(meetingId, true);

  // Join the meeting on mount
  useEffect(() => {
    if (meetingId) {
      joinCall();
    }
    return () => {
      leaveCall();
      cleanup();
    };
  }, [meetingId, joinCall, leaveCall, cleanup]);

  const handleLeave = useCallback(() => {
    leaveCall();
    cleanup();
    navigate('/'); // Redirect to home or dashboard after leaving
  }, [leaveCall, cleanup, navigate]);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'gallery' ? 'speaker' : 'gallery');
  }, []);

  const participantCount = 1 + Object.keys(remoteStreams).length;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header bar */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.liveIndicator} />
            <span style={styles.headerTitle}>Nexus Meet</span>
            <span style={styles.meetingBadge}>{meetingId}</span>
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
            isMicOn={isMicOn}
            isScreenSharing={isScreenSharing}
            peerMediaStates={peerMediaStates}
            viewMode={viewMode}
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
          isScreenSharing={isScreenSharing}
          viewMode={viewMode}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onToggleScreenShare={toggleScreenShare}
          onToggleView={toggleViewMode}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
  },
  container: {
    width: '100%',
    height: '100%',
    display: 'flex', flexDirection: 'column',
    background: '#0a0a0f',
    position: 'relative',
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
  headerTitle: { color: '#e8edf5', fontSize: 16, fontWeight: 700, fontFamily: "'Syne', sans-serif" },
  meetingBadge: {
    fontSize: 12, padding: '4px 10px', borderRadius: 6,
    background: 'rgba(14,165,233,0.15)', color: '#0ea5e9',
    fontWeight: 600, border: '1px solid rgba(14,165,233,0.25)',
    userSelect: 'all', cursor: 'copy'
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
