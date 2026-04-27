import React, { useRef, useEffect } from 'react';

function VideoTile({ stream, label, isLocal, isCameraOn, isMicOn, isScreenSharing, isActiveSpeaker }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream ? stream : null;
  }, [stream]);

  // For remote peers: also detect video from live tracks (fallback when media state hasn't arrived)
  const hasLiveVideoTrack = !isLocal && stream && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);
  const displayVideo = isCameraOn || isScreenSharing || hasLiveVideoTrack;

  return (
    <div style={{ ...styles.tile, ...(isActiveSpeaker ? styles.tileActive : {}) }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          ...styles.video,
          ...(isLocal && !isScreenSharing ? styles.videoMirrored : {}),
          opacity: displayVideo ? 1 : 0,
          objectFit: isScreenSharing ? 'contain' : 'cover'
        }}
      />
      {!displayVideo && (
        <div style={styles.avatarFallback}>
          <div style={styles.avatarCircle}>
            {label ? label.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
      )}
      <div style={styles.statusOverlay}>
        <div style={styles.nameTag}>
          <span style={styles.nameText}>{label || 'Unknown'}{isLocal ? ' (You)' : ''}</span>
        </div>
        {!isMicOn && (
          <div style={styles.micOffBadge}>
            🔇
          </div>
        )}
      </div>
    </div>
  );
}

export default function VideoGrid({ 
  localStream, remoteStreams, userName, 
  isCameraOn, isMicOn, isScreenSharing, 
  peerMediaStates, viewMode 
}) {
  const participants = [
    {
      id: 'local',
      stream: localStream,
      label: userName,
      isLocal: true,
      isCameraOn,
      isMicOn,
      isScreenSharing
    },
    ...Object.entries(remoteStreams).map(([socketId, { stream, userName: name, userId }]) => {
      const peerState = peerMediaStates?.[userId] || {};
      return {
        id: socketId,
        stream,
        label: name,
        isLocal: false,
        isCameraOn: !!peerState.isCameraOn,
        isMicOn: !!peerState.isMicOn,
        isScreenSharing: !!peerState.isScreenSharing
      };
    })
  ];

  // Auto-switch to speaker if ANYONE is screen sharing
  const hasScreenShare = participants.some(p => p.isScreenSharing);
  const actualViewMode = hasScreenShare ? 'speaker' : viewMode;

  // Determine Main Speaker
  let mainSpeaker = null;
  if (actualViewMode === 'speaker') {
    // 1. Prioritize screen share
    mainSpeaker = participants.find(p => p.isScreenSharing);
    // 2. Prioritize remote unmuted
    if (!mainSpeaker) mainSpeaker = participants.find(p => !p.isLocal && p.isMicOn);
    // 3. Fallback to any remote
    if (!mainSpeaker) mainSpeaker = participants.find(p => !p.isLocal);
    // 4. Fallback to local
    if (!mainSpeaker) mainSpeaker = participants[0];
  }

  // Active speaker for glowing borders (simple heuristic: unmuted)
  const getIsActiveSpeaker = (p) => {
    return p.isMicOn && p.id === (mainSpeaker ? mainSpeaker.id : null);
  };

  if (actualViewMode === 'speaker' && mainSpeaker) {
    const others = participants.filter(p => p.id !== mainSpeaker.id);
    return (
      <div style={styles.speakerLayout}>
        <div style={styles.mainVideoArea}>
          <VideoTile {...mainSpeaker} isActiveSpeaker={getIsActiveSpeaker(mainSpeaker)} />
        </div>
        {others.length > 0 && (
          <div style={styles.sideStrip}>
            {others.map(p => (
              <div key={p.id} style={styles.sideTileWrapper}>
                <VideoTile {...p} isActiveSpeaker={getIsActiveSpeaker(p)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Gallery View
  const totalParticipants = participants.length;
  let columns = 1;
  if (totalParticipants === 2) columns = 2;
  else if (totalParticipants <= 4) columns = 2;
  else if (totalParticipants <= 9) columns = 3;
  else columns = 4;

  return (
    <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {participants.map(p => (
        <VideoTile key={p.id} {...p} isActiveSpeaker={getIsActiveSpeaker(p)} />
      ))}
    </div>
  );
}

const styles = {
  grid: {
    flex: 1, display: 'grid', gap: 16, padding: 24,
    overflow: 'auto', alignContent: 'center', background: 'transparent',
  },
  speakerLayout: {
    flex: 1, display: 'flex', gap: 16, padding: 16,
    overflow: 'hidden', background: 'transparent',
    flexDirection: 'row', // Main video left, others right
  },
  mainVideoArea: {
    flex: 1, display: 'flex', borderRadius: 16, overflow: 'hidden',
    minWidth: 0, // Prevent flex item from overflowing
  },
  sideStrip: {
    width: 240, display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto', paddingRight: 8,
  },
  sideTileWrapper: {
    width: '100%', aspectRatio: '16/9', flexShrink: 0,
  },
  tile: {
    position: 'relative', borderRadius: 16, overflow: 'hidden',
    background: '#13131f', aspectRatio: '16/9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid rgba(255,255,255,0.04)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    transition: 'all 0.3s ease',
    width: '100%', height: '100%',
  },
  tileActive: {
    borderColor: '#0ea5e9',
    boxShadow: '0 0 24px rgba(14, 165, 233, 0.4), 0 8px 32px rgba(0,0,0,0.4)',
  },
  video: { 
    width: '100%', height: '100%',
    transition: 'opacity 0.3s ease', position: 'absolute', top: 0, left: 0
  },
  videoMirrored: { transform: 'scaleX(-1)' },
  avatarFallback: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
    width: '100%', height: '100%',
    background: 'linear-gradient(135deg, #13131f, #1a1a2e)',
    position: 'absolute', top: 0, left: 0,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 32, fontWeight: 700, color: '#fff',
    boxShadow: '0 0 30px rgba(139, 92, 246, 0.4)',
  },
  statusOverlay: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    pointerEvents: 'none',
  },
  nameTag: {
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
    borderRadius: 8, padding: '4px 10px',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  nameText: { color: '#f8fafc', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' },
  micOffBadge: {
    background: 'rgba(239, 68, 68, 0.9)', backdropFilter: 'blur(12px)',
    borderRadius: '50%', width: 24, height: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
  }
};
