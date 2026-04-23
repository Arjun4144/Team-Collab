import React, { useState } from 'react';
import useStore from '../../store/useStore';
import { getSocket } from '../../utils/socket';
import { getInitials, statusConfig } from '../../utils/helpers';
import api from '../../utils/api';

export default function Sidebar() {
  const { user, channels, activeChannel, setActiveChannel, fetchMessages,
          setRightPanel, rightPanel, logout, fetchChannels, joinChannelByInvite } = useStore();
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showJoinChannel, setShowJoinChannel] = useState(false);
  const [newCh, setNewCh] = useState({ name: '', description: '' });
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const selectChannel = (ch) => {
    if (activeChannel?._id !== ch._id) {
      const socket = getSocket();
      if (activeChannel) socket?.emit('channel:leave', activeChannel._id);
      socket?.emit('channel:join', ch._id);
      setActiveChannel(ch);
      fetchMessages(ch._id);
    }
  };

  const createChannel = async (e) => {
    e.preventDefault();
    try {
      await api.post('/channels', newCh);
      await fetchChannels();
      setShowNewChannel(false);
      setNewCh({ name: '', description: '' });
    } catch {}
  };

  const joinChannel = async (e) => {
    e.preventDefault();
    try {
      // support full URL or just code
      const code = inviteCodeInput.split('/').pop();
      const channel = await joinChannelByInvite(code);
      await fetchChannels();
      setShowJoinChannel(false);
      setInviteCodeInput('');
      selectChannel(channel);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to join channel');
    }
  };

  const statusColor = statusConfig[user?.status || 'offline']?.color;

  return (
    <aside style={styles.sidebar}>
      {/* Workspace header */}
      <div style={styles.workspaceHeader}>
        <div style={styles.workspaceName}>
          <div style={styles.wsIcon}>N</div>
          <div>
            <div style={styles.wsLabel}>Nexus Workspace</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Professional</div>
          </div>
        </div>
      </div>

      {/* Nav icons */}
      <nav style={styles.navIcons}>
        {[
          { id: 'tasks',     icon: '⚡', label: 'Tasks' },
          { id: 'decisions', icon: '✅', label: 'Decisions' },
          { id: 'members',   icon: '👥', label: 'Members' },
        ].map(({ id, icon, label }) => (
          <button key={id} title={label}
            onClick={() => setRightPanel(id)}
            style={{ ...styles.navBtn, ...(rightPanel === id ? styles.navBtnActive : {}) }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
          </button>
        ))}
      </nav>

      {/* Channels */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>Channels</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => { setShowJoinChannel(v => !v); setShowNewChannel(false); }} style={styles.addBtn} title="Join via Invite">🔗</button>
            <button onClick={() => { setShowNewChannel(v => !v); setShowJoinChannel(false); }} style={styles.addBtn} title="Create Channel">+</button>
          </div>
        </div>

        {showNewChannel && (
          <form onSubmit={createChannel} style={styles.newChForm}>
            <input style={styles.miniInput} placeholder="channel-name" required
              value={newCh.name} onChange={e => setNewCh(f => ({ ...f, name: e.target.value }))} />
            <button type="submit" style={styles.miniBtn}>Create</button>
          </form>
        )}

        {showJoinChannel && (
          <form onSubmit={joinChannel} style={styles.newChForm}>
            <input style={styles.miniInput} placeholder="Paste invite code or URL" required
              value={inviteCodeInput} onChange={e => setInviteCodeInput(e.target.value)} />
            <button type="submit" style={styles.miniBtn}>Join</button>
          </form>
        )}

        <div style={styles.channelList}>
          {channels.map(ch => (
            <button key={ch._id} onClick={() => selectChannel(ch)}
              style={{ ...styles.channelItem, ...(activeChannel?._id === ch._id ? styles.channelActive : {}) }}>
              <span style={styles.chPrefix}>🔒</span>
              <span style={styles.chName}>{ch.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User footer */}
      <div style={styles.userFooter}>
        <div style={styles.avatar}>
          {getInitials(user?.name)}
          <span style={{ ...styles.statusDot, background: statusColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.userName}>{user?.name}</div>
          <div style={styles.userRole}>{user?.role}</div>
        </div>
        <button onClick={logout} title="Sign out" style={styles.logoutBtn}>⎋</button>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 'var(--sidebar-width)', background: 'var(--bg-base)',
    borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
    flexShrink: 0, height: '100vh', overflow: 'hidden'
  },
  workspaceHeader: {
    padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0
  },
  workspaceName: { display: 'flex', alignItems: 'center', gap: 10 },
  wsIcon: {
    width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16
  },
  wsLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  navIcons: {
    display: 'flex', gap: 4, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', flexShrink: 0
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s',
    background: 'none', border: 'none', cursor: 'pointer'
  },
  navBtnActive: { background: 'var(--accent-glow)', color: 'var(--accent)' },
  section: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '8px 0' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 16px 4px', marginBottom: 2
  },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  addBtn: {
    width: 20, height: 20, borderRadius: 4, background: 'none', border: 'none',
    color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  channelList: { flex: 1, overflowY: 'auto', padding: '0 8px' },
  channelItem: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '6px 10px', borderRadius: 6, background: 'none', border: 'none',
    color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
    transition: 'all 0.1s', textAlign: 'left'
  },
  channelActive: { background: 'var(--bg-active)', color: 'var(--text-primary)' },
  chPrefix: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },
  chName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  newChForm: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  miniInput: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
    width: '100%'
  },
  miniBtn: {
    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
    padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end'
  },
  userFooter: {
    padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 10
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--accent)', position: 'relative', flexShrink: 0
  },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0, width: 8, height: 8,
    borderRadius: '50%', border: '1.5px solid var(--bg-base)'
  },
  userName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userRole: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' },
  logoutBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 }
};
