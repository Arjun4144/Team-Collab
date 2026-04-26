/**
 * CallButton — Shows "Call" or "Join" depending on active call state.
 * Isolated component, imported into ChannelHeader.
 */
import React, { useState, useEffect } from 'react';
import useCallSocket from '../hooks/useCallSocket';
import VideoCallContainer from './VideoCallContainer';

export default function CallButton({ channelId }) {
  const callSocketData = useCallSocket(channelId);
  const { activeCall } = callSocketData;
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState(null);

  // Reset on channel switch
  useEffect(() => {
    setInCall(false);
    setCallMode(null);
  }, [channelId]);

  const handleStart = () => {
    setCallMode('start');
    setInCall(true);
  };

  const handleJoin = () => {
    setCallMode('join');
    setInCall(true);
  };

  const handleClose = () => {
    setInCall(false);
    setCallMode(null);
  };

  const hasActiveCall = activeCall && activeCall.participants && activeCall.participants.length > 0;

  return (
    <>
      {hasActiveCall && !inCall ? (
        <button onClick={handleJoin} style={{ ...styles.btn, ...styles.btnJoin }}>
          <span style={styles.liveRing} />
          📞 Join Call
          <span style={styles.badge}>{activeCall.participants.length}</span>
        </button>
      ) : !inCall ? (
        <button onClick={handleStart} style={styles.btn}>
          📹 Call
        </button>
      ) : null}

      {inCall && (
        <div style={styles.inCallIndicator}>
          <span style={styles.inCallDot} />
          <span style={styles.inCallText}>In Call</span>
        </div>
      )}

      {/* Mount VideoCallContainer when in call */}
      {inCall && (
        <VideoCallContainer 
          channelId={channelId} 
          onClose={handleClose} 
          mode={callMode}
          callSocketData={callSocketData}
        />
      )}
    </>
  );
}

const styles = {
  btn: {
    padding: '5px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: 'none',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'inherit',
  },
  btnJoin: {
    background: 'rgba(16,185,129,0.12)',
    color: '#34d399',
    borderColor: 'rgba(16,185,129,0.3)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  liveRing: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 6px #10b981',
    flexShrink: 0,
  },
  badge: {
    fontSize: 10,
    background: 'rgba(16,185,129,0.2)',
    color: '#34d399',
    padding: '1px 6px',
    borderRadius: 10,
    fontWeight: 700,
  },
  inCallIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 6,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
  },
  inCallDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#ef4444',
    boxShadow: '0 0 6px #ef4444',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  inCallText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fca5a5',
  },
};
