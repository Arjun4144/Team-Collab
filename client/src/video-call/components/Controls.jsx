/**
 * Controls — Toggle camera/mic and leave call.
 * Default state: both OFF. Button labels reflect real media state.
 */
import React from 'react';

export default function Controls({ isCameraOn, isMicOn, onToggleCamera, onToggleMic, onLeave }) {
  return (
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
        onClick={onLeave}
        style={{ ...styles.btn, ...styles.btnLeave }}
        title="Leave Call"
      >
        <span style={styles.icon}>📞</span>
        <span style={styles.label}>Leave</span>
      </button>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: '12px 20px', background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '10px 18px', borderRadius: 12, border: 'none',
    cursor: 'pointer', transition: 'all 0.2s ease', minWidth: 72,
  },
  btnOn: { background: 'rgba(255,255,255,0.1)', color: '#e0e0e0' },
  btnOff: { background: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
  btnLeave: { background: 'rgba(239,68,68,0.8)', color: '#fff' },
  icon: { fontSize: 20, lineHeight: 1 },
  label: { fontSize: 10, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.9 },
};
