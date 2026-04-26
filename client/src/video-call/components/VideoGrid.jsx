/**
 * VideoGrid — Renders all participant video streams in a responsive grid.
 * Uses peerMediaStates for remote camera state + remoteStreamVersion for re-render triggers.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';

function VideoTile({ stream, label, isLocal, muted, showVideo, streamVersion }) {
  const videoRef = useRef(null);
  const [trackActive, setTrackActive] = useState(false);

  // Recheck video track state
  const recheckTrack = useCallback(() => {
    if (!stream) { setTrackActive(false); return; }
    const vt = stream.getVideoTracks()[0];
    setTrackActive(vt ? vt.enabled && vt.readyState === 'live' && !vt.muted : false);
  }, [stream]);

  // Re-attach stream and track listeners whenever stream OR version changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      // Always re-assign srcObject (handles new stream refs AND renegotiation)
      el.srcObject = stream;
      recheckTrack();

      const onTrackChange = () => recheckTrack();

      stream.addEventListener('addtrack', onTrackChange);
      stream.addEventListener('removetrack', onTrackChange);

      // Listen on ALL current video tracks
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((vt) => {
        vt.addEventListener('mute', onTrackChange);
        vt.addEventListener('unmute', onTrackChange);
        vt.addEventListener('ended', onTrackChange);
      });

      return () => {
        stream.removeEventListener('addtrack', onTrackChange);
        stream.removeEventListener('removetrack', onTrackChange);
        videoTracks.forEach((vt) => {
          vt.removeEventListener('mute', onTrackChange);
          vt.removeEventListener('unmute', onTrackChange);
          vt.removeEventListener('ended', onTrackChange);
        });
      };
    } else {
      el.srcObject = null;
      setTrackActive(false);
    }
  }, [stream, streamVersion, recheckTrack]);

  // Combine exact socket state (showVideo) with actual track status
  const displayVideo = isLocal ? showVideo : (showVideo && trackActive);

  return (
    <div style={styles.tile}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted || isLocal}
        style={{
          ...styles.video,
          ...(isLocal ? styles.videoMirrored : {}),
          display: displayVideo ? 'block' : 'none',
        }}
      />
      {!displayVideo && (
        <div style={styles.avatarFallback}>
          <div style={styles.avatarCircle}>
            {label ? label.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
      )}
      <div style={styles.nameTag}>
        <span style={styles.nameText}>{label || 'Unknown'}{isLocal ? ' (You)' : ''}</span>
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, remoteStreams, userName, isCameraOn, peerMediaStates, remoteStreamVersion }) {
  const totalParticipants = 1 + Object.keys(remoteStreams).length;

  let columns = 1;
  if (totalParticipants === 2) columns = 2;
  else if (totalParticipants <= 4) columns = 2;
  else if (totalParticipants <= 9) columns = 3;
  else columns = 4;

  return (
    <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      <VideoTile stream={localStream} label={userName} isLocal muted showVideo={isCameraOn} />

      {Object.entries(remoteStreams).map(([socketId, { stream, userName: name, userId }]) => {
        const peerState = peerMediaStates?.[userId];
        return (
          <VideoTile
            key={socketId}
            stream={stream}
            label={name}
            isLocal={false}
            showVideo={peerState?.isCameraOn}
            streamVersion={remoteStreamVersion}
          />
        );
      })}
    </div>
  );
}

const styles = {
  grid: {
    flex: 1, display: 'grid', gap: 8, padding: 8,
    overflow: 'auto', alignContent: 'center', background: '#0a0a0f',
  },
  tile: {
    position: 'relative', borderRadius: 12, overflow: 'hidden',
    background: '#1a1a2e', aspectRatio: '16/9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  videoMirrored: { transform: 'scaleX(-1)' },
  avatarFallback: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: '100%',
    background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, fontWeight: 700, color: '#fff',
    boxShadow: '0 0 24px rgba(14,165,233,0.3)',
  },
  nameTag: {
    position: 'absolute', bottom: 8, left: 8,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    borderRadius: 6, padding: '3px 10px',
  },
  nameText: { color: '#e8edf5', fontSize: 12, fontWeight: 600 },
};
