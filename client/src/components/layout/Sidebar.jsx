import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import { getInitials, statusConfig } from '../../utils/helpers';
import api from '../../utils/api';

const ChannelRow = ({ ch, onRename, onDelete }) => {
  const { user, activeChannel, selectChannel, messages, generateInviteLink, showToast, clearChannelMessages } = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const isActive = activeChannel?._id === ch._id;
  const isAdmin = ch.admins?.includes(user?._id);

  const chMessages = messages[ch._id] || [];
  const currentUserId = user?._id ? String(user._id) : null;
  const unreadCount = currentUserId ? chMessages.filter(m => {
    const readByArray = Array.isArray(m.readBy) ? m.readBy : [];
    return !readByArray.some(rb => {
      const idStr = (typeof rb === 'object' && rb !== null && rb._id) ? String(rb._id) : String(rb);
      return idStr === currentUserId;
    });
  }).length : 0;
  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  const handleInvite = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      const { inviteLink } = await generateInviteLink(ch._id);
      const fullUrl = `${window.location.origin}${inviteLink}`;
      await navigator.clipboard.writeText(fullUrl);
      showToast('Invite link copied to clipboard!');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate invite link.');
    }
  };

  const handleClearChat = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await clearChannelMessages(ch._id);
      showToast('Chat cleared for you');
    } catch (err) {
      showToast('Failed to clear chat.');
    }
  };

  const toggleMenu = (e) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  // Smart positioning based on viewport
  const dropdownStyle = {
    ...styles.dropdown,
    top: menuOpen && menuRef.current && menuRef.current.getBoundingClientRect().top > window.innerHeight - 200 ? 'auto' : '100%',
    bottom: menuOpen && menuRef.current && menuRef.current.getBoundingClientRect().top > window.innerHeight - 200 ? '100%' : 'auto',
    marginTop: menuOpen && menuRef.current && menuRef.current.getBoundingClientRect().top > window.innerHeight - 200 ? 0 : 6,
    marginBottom: menuOpen && menuRef.current && menuRef.current.getBoundingClientRect().top > window.innerHeight - 200 ? 6 : 0,
  };

  return (
    <div 
      style={{ position: 'relative' }} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); if(!menuOpen) setMenuOpen(false); }}
    >
      <button 
        onClick={() => selectChannel(ch)}
        style={{ ...styles.channelItem, ...(isActive ? styles.channelActive : {}) }}
      >
        <span style={styles.chPrefix}>🔒</span>
        <span style={styles.chName}>{ch.name}</span>
        
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', width: 24, justifyContent: 'flex-end', flexShrink: 0 }}>
          {(!isActive && unreadCount > 0 && (!isHovered && !menuOpen)) && (
            <span style={styles.unreadBadge}>{displayCount}</span>
          )}
          {(isActive || isHovered || menuOpen) && (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <div 
                onClick={toggleMenu} 
                style={styles.actionIconBtn}
              >
                ⋮
              </div>
              {menuOpen && (
                <div style={dropdownStyle} onClick={e => e.stopPropagation()}>
                  <button onClick={handleClearChat} style={styles.dropdownBtn}>🧹 Clear All Chat</button>
                  {isAdmin && (
                    <>
                      <button onClick={handleInvite} style={styles.dropdownBtn}>📋 Invite Link</button>
                      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(ch); }} style={styles.dropdownBtn}>✏️ Rename Channel</button>
                      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(ch); }} style={{ ...styles.dropdownBtn, color: '#ef4444' }}>🗑️ Delete Channel</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
};

export default function Sidebar() {
  const { user, channels, activeChannel, selectChannel, setActiveChannel, setRightPanel, rightPanel, logout, fetchChannels, joinChannelByInvite, renameChannel, deleteChannel, showToast } = useStore();
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showJoinChannel, setShowJoinChannel] = useState(false);
  const [newCh, setNewCh] = useState({ name: '', description: '' });
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  // Modals state
  const [renameData, setRenameData] = useState(null); // { id, name, description }
  const [renameInput, setRenameInput] = useState('');
  const [deleteChannelData, setDeleteChannelData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('theme-dark');
    if (isDark) {
      document.documentElement.classList.remove('theme-dark');
      localStorage.setItem('nexus_theme', 'light');
    } else {
      document.documentElement.classList.add('theme-dark');
      localStorage.setItem('nexus_theme', 'dark');
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

  const handleRenameSubmit = async () => {
    if (!renameData || !renameInput.trim() || renameInput === renameData.name) {
      setRenameData(null);
      return;
    }
    try {
      await renameChannel(renameData._id, renameInput.trim(), renameData.description);
      showToast('Channel renamed successfully');
      setRenameData(null);
    } catch (err) {
      showToast('Failed to rename channel.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteChannelData) return;
    setIsDeleting(true);
    try {
      await deleteChannel(deleteChannelData._id);
      showToast('Channel deleted successfully');
      setDeleteChannelData(null);
    } catch (err) {
      showToast('Failed to delete channel.');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusColor = statusConfig[user?.status || 'offline']?.color;

  return (
    <aside style={styles.sidebar}>
      <div style={styles.workspaceHeader}>
        <div style={styles.workspaceName}>
          <div style={styles.wsIcon}>N</div>
          <div>
            <div style={styles.wsLabel}>Nexus Workspace</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Professional</div>
          </div>
        </div>
      </div>

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
          <button 
            onClick={() => setActiveChannel(null)}
            style={{ ...styles.channelItem, ...(activeChannel === null ? styles.channelActive : {}), marginBottom: 8 }}
          >
            <span style={styles.chPrefix}>🏠</span>
            <span style={styles.chName}>Home</span>
          </button>
          
          {channels.map(ch => (
            <ChannelRow 
              key={ch._id} 
              ch={ch} 
              onRename={(c) => { setRenameData(c); setRenameInput(c.name); }}
              onDelete={(c) => setDeleteChannelData(c)}
            />
          ))}
        </div>
      </div>

      <div style={styles.userFooter}>
        <div style={styles.avatar}>
          {getInitials(user?.name)}
          <span style={{ ...styles.statusDot, background: statusColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.userName}>{user?.name}</div>
        </div>
        <button onClick={toggleTheme} title="Toggle Theme" style={styles.logoutBtn}>🌓</button>
        <button onClick={logout} title="Sign out" style={styles.logoutBtn}>⎋</button>
      </div>

      {/* Modals placed here to avoid duplication per row */}
      {renameData && (
        <div style={styles.modalOverlay} onClick={() => setRenameData(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Rename Channel</h3>
            <div style={{ marginBottom: 20 }}>
              <input 
                autoFocus
                style={styles.renameInput}
                value={renameInput}
                onChange={e => setRenameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setRenameData(null);
                }}
              />
            </div>
            <div style={styles.modalActions}>
              <button onClick={() => setRenameData(null)} style={styles.modalCancelBtn}>Cancel</button>
              <button 
                onClick={handleRenameSubmit} 
                style={{ ...styles.modalSaveBtn, opacity: (!renameInput.trim() || renameInput === renameData.name) ? 0.5 : 1 }}
                disabled={!renameInput.trim() || renameInput === renameData.name}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteChannelData && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setDeleteChannelData(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Delete Channel</h3>
            <p style={styles.modalDesc}>
              Are you sure you want to delete <strong>#{deleteChannelData.name}</strong>? This action is irreversible and all messages, tasks, and decisions will be permanently lost.
            </p>
            <div style={styles.modalActions}>
              <button 
                onClick={() => setDeleteChannelData(null)} 
                style={{ ...styles.modalCancelBtn, opacity: isDeleting ? 0.5 : 1 }}
                disabled={isDeleting}
              >Cancel</button>
              <button 
                onClick={confirmDelete} 
                style={{ ...styles.modalDeleteBtn, opacity: isDeleting ? 0.5 : 1 }}
                disabled={isDeleting}
              >{isDeleting ? 'Deleting...' : 'Delete Channel'}</button>
            </div>
          </div>
        </div>
      )}
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
    transition: 'all 0.1s', textAlign: 'left', position: 'relative'
  },
  channelActive: { background: 'var(--bg-active)', color: 'var(--text-primary)' },
  actionIconBtn: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, 
    width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 800, lineHeight: 1
  },
  dropdown: {
    position: 'absolute', right: 0, zIndex: 100, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 8, padding: 4, minWidth: 160,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  dropdownBtn: {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
    borderRadius: 4, transition: 'background 0.1s'
  },
  unreadBadge: {
    background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
    padding: '2px 6px', borderRadius: 10, flexShrink: 0,
    lineHeight: 1
  },
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
  logoutBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: 'var(--bg-surface)', padding: 24, borderRadius: 12, width: 400, maxWidth: '90%',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border-strong)'
  },
  modalTitle: { margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)' },
  modalDesc: { margin: '0 0 24px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 },
  renameInput: {
    background: 'var(--bg-base)', border: '1px solid var(--accent)',
    borderRadius: 6, padding: '8px 12px', fontSize: 15, color: 'var(--text-primary)',
    outline: 'none', width: '100%', fontFamily: 'var(--font-display)', fontWeight: 600
  },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: {
    padding: '8px 16px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s'
  },
  modalSaveBtn: {
    padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff',
    border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s'
  },
  modalDeleteBtn: {
    padding: '8px 16px', borderRadius: 6, background: '#ef4444', color: '#fff',
    border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s'
  }
};
