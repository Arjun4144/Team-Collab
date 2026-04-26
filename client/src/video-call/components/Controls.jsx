/**
 * Controls — Toggle camera/mic and leave call.
 * Default state: both OFF. Button labels reflect real media state.
 */
import React from 'react';

export default function Controls({ isCameraOn, isMicOn, isScreenSharing, viewMode, onToggleCamera, onToggleMic, onToggleScreenShare, onToggleView, onLeave }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.bar}>
      <button
        onClick={onToggleMic}
        style={{ ...styles.btn, ...(isMicOn ? styles.btnOn : styles.btnOff) }}
        title={isMicOn ? 'Mute' : 'Unmute'}
      >
        <span style={styles.icon}>{isMicOn ? '🎤' : '🔇'}</span>
        <span style={styles.label}>{isMicOn ? 'Mute' : 'Unmute'}</span>
      </button>

      <button
        onClick={onToggleCamera}
        style={{ ...styles.btn, ...(isCameraOn ? styles.btnOn : styles.btnOff) }}
        title={isCameraOn ? 'Camera Off' : 'Camera On'}
      >
        <span style={styles.icon}>{isCameraOn ? '📹' : '📷'}</span>
        <span style={styles.label}>{isCameraOn ? 'Cam Off' : 'Cam On'}</span>
      </button>

      <button
        onClick={onToggleScreenShare}
        style={{ ...styles.btn, ...(isScreenSharing ? styles.btnOn : styles.btnOff) }}
        title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      >
        <span style={styles.icon}>{isScreenSharing ? '⏹️' : '🖥️'}</span>
        <span style={styles.label}>{isScreenSharing ? 'Stop' : 'Share'}</span>
      </button>

      <button
        onClick={onToggleView}
        style={{ ...styles.btn, ...styles.btnOn }}
        title={viewMode === 'gallery' ? 'Switch to Speaker View' : 'Switch to Gallery View'}
      >
        <span style={styles.icon}>{viewMode === 'gallery' ? '👤' : '🔲'}</span>
        <span style={styles.label}>{viewMode === 'gallery' ? 'Speaker' : 'Gallery'}</span>
      </button>

      <button
        onClick={onLeave}
        style={{ ...styles.btn, ...styles.btnLeave }}
        title="Leave Call"
      >
        <span style={styles.icon}>📞</span>
        <span style={styles.label}>Leave</span>
      </button>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
    zIndex: 100, display: 'flex', justifyContent: 'center'
  },
  bar: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '12px 24px', background: 'rgba(15, 15, 25, 0.75)',
    backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 40, boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '12px 20px', borderRadius: 24, border: 'none',
    cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', minWidth: 80,
  },
  btnOn: { 
    background: 'rgba(255,255,255,0.05)', color: '#e8edf5',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)'
  },
  btnOff: { 
    background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5',
    border: '1px solid rgba(239, 68, 68, 0.2)'
  },
  btnLeave: { 
    background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff',
    boxShadow: '0 8px 20px rgba(239, 68, 68, 0.3)', padding: '12px 28px',
  },
  icon: { fontSize: 22, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.95 },
};
