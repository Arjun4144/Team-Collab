import React from 'react';
import useStore from '../../store/useStore';

export default function ChannelHeader() {
  const { activeChannel, setRightPanel, rightPanel, users } = useStore();
  if (!activeChannel) return null;

  const channelUsers = activeChannel.type === 'public' 
    ? users 
    : (activeChannel.members || []);
    
  const totalMembers = channelUsers.length;
  const onlineMembers = channelUsers.filter(u => u.status === 'online').length;

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <span style={styles.hash}>{activeChannel.type === 'private' ? '🔒' : '#'}</span>
        <span style={styles.name}>{activeChannel.name}</span>
        {activeChannel.description && (
          <>
            <span style={styles.divider}>|</span>
            <span style={styles.desc}>{activeChannel.description}</span>
          </>
        )}
      </div>
      <div style={styles.actions}>
        <span style={styles.memberCount}>
          👥 {totalMembers} members · <span style={{ color: '#10b981' }}>●</span> {onlineMembers} online
        </span>
        {[
          { id: 'tasks',     label: '⚡ Tasks' },
          { id: 'decisions', label: '✅ Decisions' },
          { id: 'members',   label: '👥 Members' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setRightPanel(id)}
            style={{ ...styles.btn, ...(rightPanel === id ? styles.btnActive : {}) }}>
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}

const styles = {
  header: {
    height: 'var(--header-height)', padding: '0 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0
  },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  hash: { fontSize: 16, color: 'var(--text-muted)' },
  name: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' },
  divider: { color: 'var(--border-strong)', margin: '0 4px' },
  desc: { fontSize: 13, color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  memberCount: { fontSize: 12, color: 'var(--text-muted)', marginRight: 8 },
  btn: {
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)',
    cursor: 'pointer', transition: 'all 0.15s'
  },
  btnActive: { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' }
};
