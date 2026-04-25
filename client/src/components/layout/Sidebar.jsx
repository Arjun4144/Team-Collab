import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import { getInitials, statusConfig } from '../../utils/helpers';
import api from '../../utils/api';

const ChannelRow = ({ ch, onRename, onDelete, isWsAdmin }) => {
  const { user, activeChannel, selectChannel, clearChannelMessages, showToast } = useStore();
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  const isActive = activeChannel?._id === ch._id;
  const unreadCount = ch.unreadCount || 0;

  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); if (!menuOpen) setMenuOpen(false); }}>
      <button onClick={() => selectChannel(ch)} style={{ ...styles.channelItem, ...(isActive ? styles.channelActive : {}), ...(isHovered && !isActive ? styles.wsRowHover : {}) }}>
        <span style={styles.chPrefix}>#</span>
        <span style={styles.chName}>{ch.name}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', width: 24, justifyContent: 'flex-end', flexShrink: 0 }}>
          {(!isActive && unreadCount > 0 && !isHovered && !menuOpen) && <span style={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
          {(isActive || isHovered || menuOpen) && (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <div onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} style={styles.actionIconBtn}>⋮</div>
              {menuOpen && (
                <div style={styles.dropdown} onClick={e => e.stopPropagation()}>
                  <button onClick={async (e) => { e.stopPropagation(); setMenuOpen(false); try { await clearChannelMessages(ch._id); showToast('Chat cleared'); } catch {} }} style={styles.dropdownBtn}>🧹 Clear Chat</button>
                  {isWsAdmin && ch.name !== 'general' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(ch); }} style={styles.dropdownBtn}>✏️ Rename</button>
                      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(ch); }} style={{ ...styles.dropdownBtn, color: '#ef4444' }}>🗑️ Delete</button>
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

const WorkspaceSection = ({ ws, onRename, onDeleteChannel }) => {
  const { user, activeWorkspace, selectWorkspace, channels, showToast, generateInviteLink, createChannel, renameWorkspace, deleteWorkspace } = useStore();
  const [expanded, setExpanded] = useState(true);
  const [showNewCh, setShowNewCh] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isActive = activeWorkspace?._id === ws._id;
  const creatorId = typeof ws.createdBy === 'object' && ws.createdBy !== null ? ws.createdBy._id : ws.createdBy;
  const isAdmin = creatorId?.toString() === user?._id?.toString();
  const wsChannels = channels[ws._id] || [];

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  // Workspace-level unread dot (derived from server-backed channel unreadCount)
  const hasUnread = wsChannels.some(ch => (ch.unreadCount || 0) > 0);

  const handleClick = () => {
    if (!isActive) selectWorkspace(ws);
    setExpanded(true);
  };

  const handleCreateCh = async (e) => {
    e.preventDefault();
    if (!newChName.trim()) return;
    try { await createChannel(ws._id, newChName.trim()); setShowNewCh(false); setNewChName(''); } catch (err) { showToast(err.response?.data?.error || 'Failed'); }
  };

  const handleInvite = async () => {
    setMenuOpen(false);
    try { const { inviteLink } = await generateInviteLink(ws._id); await navigator.clipboard.writeText(`${window.location.origin}${inviteLink}`); showToast('Invite link copied!'); } catch (err) { showToast(err.response?.data?.error || 'Failed'); }
  };

  const [renameMode, setRenameMode] = useState(false);
  const [wsRename, setWsRename] = useState('');

  const [isWsHovered, setIsWsHovered] = useState(false);

  return (
    <div style={{ marginBottom: 4 }}>
      <div 
        style={{ ...styles.wsRow, ...(isActive ? styles.wsRowActive : {}), ...(isWsHovered && !isActive ? styles.wsRowHover : {}) }}
        onMouseEnter={() => setIsWsHovered(true)} onMouseLeave={() => setIsWsHovered(false)}
        onClick={() => { if (!isActive) selectWorkspace(ws); setExpanded(true); }}
      >
        <div style={styles.wsIcon2}>{ws.name.charAt(0).toUpperCase()}</div>
        <div style={styles.wsLabel2}>{ws.name}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasUnread && !isActive && <span style={styles.unreadDot} />}
          <div onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} style={styles.collapseBtn}>{expanded ? '▼' : '▶'}</div>
        {isAdmin && (
          <div style={{ position: 'relative' }} ref={menuRef}>
            <div onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} style={{ ...styles.actionIconBtn, opacity: isActive || menuOpen ? 1 : 0, fontSize: 12 }}>⋮</div>
            {menuOpen && (
              <div style={{ ...styles.dropdown, right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); setShowNewCh(true); }} style={styles.dropdownBtn}>➕ New Channel</button>
                <button onClick={handleInvite} style={styles.dropdownBtn}>📋 Invite Link</button>
                <button onClick={() => { setMenuOpen(false); setRenameMode(true); setWsRename(ws.name); }} style={styles.dropdownBtn}>✏️ Rename</button>
                <button onClick={async () => { setMenuOpen(false); if (window.confirm(`Delete workspace "${ws.name}"? All data will be lost.`)) { try { await deleteWorkspace(ws._id); showToast('Workspace deleted'); } catch { showToast('Failed'); } } }} style={{ ...styles.dropdownBtn, color: '#ef4444' }}>🗑️ Delete</button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {renameMode && (
        <div style={styles.modalOverlay} onClick={() => setRenameMode(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Rename Workspace</h3>
            <input autoFocus style={styles.renameInput} value={wsRename} onChange={e => setWsRename(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter' && wsRename.trim()) { try { await renameWorkspace(ws._id, wsRename.trim()); showToast('Renamed'); setRenameMode(false); } catch {} } if (e.key === 'Escape') setRenameMode(false); }} />
            <div style={styles.modalActions}>
              <button onClick={() => setRenameMode(false)} style={styles.modalCancelBtn}>Cancel</button>
              <button onClick={async () => { if (wsRename.trim()) { try { await renameWorkspace(ws._id, wsRename.trim()); showToast('Renamed'); setRenameMode(false); } catch {} } }} style={styles.modalSaveBtn}>Save</button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ paddingLeft: 0 }}>
          {showNewCh && (
            <form onSubmit={handleCreateCh} style={{ ...styles.newChForm, paddingLeft: 20 }}>
              <input style={styles.miniInput} placeholder="channel-name" required value={newChName} onChange={e => setNewChName(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="submit" style={styles.miniBtn}>Create</button>
                <button type="button" onClick={() => setShowNewCh(false)} style={{ ...styles.miniBtn, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Cancel</button>
              </div>
            </form>
          )}
          {wsChannels.map(ch => <ChannelRow key={ch._id} ch={ch} isWsAdmin={isAdmin} onRename={onRename} onDelete={onDeleteChannel} />)}
        </div>
      )}
    </div>
  );
};

export default function Sidebar() {
  const { user, workspaces, channels, activeWorkspace, activeChannel, selectWorkspace, selectChannel, setRightPanel, rightPanel, logout, showToast, renameChannel, deleteChannel, createWorkspace } = useStore();
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [renameData, setRenameData] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteChannelData, setDeleteChannelData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResizerHovered, setIsResizerHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Search logic
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchLower = debouncedSearch.toLowerCase();
  const filteredWorkspaces = workspaces.filter(ws => ws.name.toLowerCase().includes(searchLower));
  const filteredChannels = [];
  Object.keys(channels).forEach(wsId => {
    channels[wsId].forEach(ch => {
      if (ch.name.toLowerCase().includes(searchLower) || (ch.description || '').toLowerCase().includes(searchLower)) {
        filteredChannels.push({ ...ch, workspace: workspaces.find(w => w._id === wsId) });
      }
    });
  });

  // Resizer logic
  const startResize = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const root = document.documentElement;
    const startWidth = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-width')) || 260;

    const onMove = (moveEvent) => {
      const newWidth = Math.max(220, Math.min(400, startWidth + (moveEvent.clientX - startX)));
      root.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('nexus_sidebar_width', root.style.getPropertyValue('--sidebar-width').replace('px', ''));
      setIsResizing(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('theme-dark');
    if (isDark) { document.documentElement.classList.remove('theme-dark'); localStorage.setItem('nexus_theme', 'light'); }
    else { document.documentElement.classList.add('theme-dark'); localStorage.setItem('nexus_theme', 'dark'); }
  };

  const handleCreateWs = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    try {
      const ws = await createWorkspace(newWsName.trim());
      setShowCreateWs(false); setNewWsName('');
      useStore.getState().selectWorkspace(ws);
    } catch (err) { showToast(err.response?.data?.error || 'Failed'); }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    try {
      const code = inviteInput.split('/').pop();
      const ws = await useStore.getState().joinWorkspaceByInvite(code);
      await useStore.getState().fetchWorkspaces();
      setShowJoin(false); setInviteInput('');
      useStore.getState().selectWorkspace(ws);
    } catch (err) { showToast(err.response?.data?.error || 'Failed to join'); }
  };

  const handleRenameSubmit = async () => {
    if (!renameData || !renameInput.trim() || renameInput === renameData.name) { setRenameData(null); return; }
    try { await renameChannel(renameData._id, renameInput.trim(), renameData.description); showToast('Channel renamed'); setRenameData(null); } catch { showToast('Failed'); }
  };

  const confirmDelete = async () => {
    if (!deleteChannelData) return;
    setIsDeleting(true);
    try { await deleteChannel(deleteChannelData._id); showToast('Channel deleted'); setDeleteChannelData(null); } catch { showToast('Failed'); }
    finally { setIsDeleting(false); }
  };

  const statusColor = statusConfig[user?.status || 'offline']?.color;

  return (
    <aside style={styles.sidebar}>
      <div style={styles.workspaceHeader}>
        <div style={styles.workspaceName}>
          <div style={styles.wsIcon}>{activeWorkspace ? activeWorkspace.name.charAt(0).toUpperCase() : 'N'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={styles.wsLabel}>{activeWorkspace ? activeWorkspace.name : 'Nexus'}</div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>▼</span>
          </div>
        </div>
      </div>

      <div style={styles.searchContainer}>
        <input 
          type="text" 
          placeholder="Search..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          style={styles.searchInput} 
        />
      </div>

      <div style={styles.section}>
        <div style={{ padding: '0 12px 8px' }}>
          <button onClick={() => selectChannel(null)} style={{ ...styles.channelItem, ...(activeChannel === null ? styles.channelActive : {}), paddingLeft: 12 }}>
            <span style={styles.chPrefix}>🏠</span>
            <span style={styles.chName}>Home</span>
          </button>
        </div>

        <nav style={styles.navIcons}>
          {[{ id: 'tasks', icon: '⚡', label: 'Tasks' }, { id: 'decisions', icon: '✅', label: 'Decisions' }, { id: 'members', icon: '👥', label: 'Members' }].map(({ id, icon, label }) => (
            <button key={id} title={label} onClick={() => setRightPanel(id)} style={{ ...styles.navBtn, ...(rightPanel === id ? styles.navBtnActive : {}) }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
            </button>
          ))}
        </nav>

        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>Workspaces</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => { setShowJoin(v => !v); setShowCreateWs(false); }} style={styles.addBtn} title="Join via Invite">🔗</button>
            <button onClick={() => { setShowCreateWs(v => !v); setShowJoin(false); }} style={styles.addBtn} title="Create Workspace">+</button>
          </div>
        </div>

        {showCreateWs && (
          <form onSubmit={handleCreateWs} style={styles.newChForm}>
            <input style={styles.miniInput} placeholder="Workspace name" required value={newWsName} onChange={e => setNewWsName(e.target.value)} autoFocus />
            <button type="submit" style={styles.miniBtn}>Create</button>
          </form>
        )}

        {showJoin && (
          <form onSubmit={handleJoin} style={styles.newChForm}>
            <input style={styles.miniInput} placeholder="Paste invite link or code" required value={inviteInput} onChange={e => setInviteInput(e.target.value)} />
            <button type="submit" style={styles.miniBtn}>Join</button>
          </form>
        )}

        {searchQuery.trim() ? (
          <div style={styles.searchResults}>
            {filteredWorkspaces.length > 0 && (
              <>
                <div style={styles.searchGroup}>Workspaces</div>
                {filteredWorkspaces.map(ws => (
                  <button key={ws._id} onClick={() => { selectWorkspace(ws); setSearchQuery(''); }} style={styles.searchItem}>
                    <span style={styles.wsIcon2}>{ws.name.charAt(0).toUpperCase()}</span>
                    <span>{ws.name}</span>
                  </button>
                ))}
              </>
            )}
            {filteredChannels.length > 0 && (
              <>
                <div style={styles.searchGroup}>Channels</div>
                {filteredChannels.map(ch => (
                  <button key={ch._id} onClick={() => { selectWorkspace(ch.workspace); setTimeout(() => selectChannel(ch), 50); setSearchQuery(''); }} style={styles.searchItem}>
                    <span style={styles.chPrefix}>#</span>
                    <span>{ch.name} <span style={{fontSize: 10, color: 'var(--text-muted)'}}>→ {ch.workspace?.name}</span></span>
                  </button>
                ))}
              </>
            )}
            {filteredWorkspaces.length === 0 && filteredChannels.length === 0 && (
              <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No results found</div>
            )}
          </div>
        ) : (
          <div style={styles.channelList}>
            {workspaces.map(ws => (
              <WorkspaceSection key={ws._id} ws={ws} onRename={(c) => { setRenameData(c); setRenameInput(c.name); }} onDeleteChannel={(c) => setDeleteChannelData(c)} />
            ))}
          </div>
        )}
      </div>

      <div 
        onMouseDown={startResize} 
        onMouseEnter={() => setIsResizerHovered(true)}
        onMouseLeave={() => setIsResizerHovered(false)}
        style={{ ...styles.resizer, background: (isResizing || isResizerHovered) ? 'var(--accent)' : 'transparent', opacity: (isResizing || isResizerHovered) ? 1 : 0 }} 
      />

      <div style={styles.userFooter}>
        <div style={styles.avatar}>{getInitials(user?.name)}<span style={{ ...styles.statusDot, background: statusColor }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={styles.userName}>{user?.name}</div></div>
        <button onClick={toggleTheme} title="Toggle Theme" style={styles.logoutBtn}>🌓</button>
        <button onClick={logout} title="Sign out" style={styles.logoutBtn}>⎋</button>
      </div>

      {renameData && (
        <div style={styles.modalOverlay} onClick={() => setRenameData(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Rename Channel</h3>
            <div style={{ marginBottom: 20 }}>
              <input autoFocus style={styles.renameInput} value={renameInput} onChange={e => setRenameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenameData(null); }} />
            </div>
            <div style={styles.modalActions}>
              <button onClick={() => setRenameData(null)} style={styles.modalCancelBtn}>Cancel</button>
              <button onClick={handleRenameSubmit} style={{ ...styles.modalSaveBtn, opacity: (!renameInput.trim() || renameInput === renameData.name) ? 0.5 : 1 }} disabled={!renameInput.trim() || renameInput === renameData.name}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteChannelData && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setDeleteChannelData(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Delete Channel</h3>
            <p style={styles.modalDesc}>Are you sure you want to delete <strong>#{deleteChannelData.name}</strong>? This action is irreversible.</p>
            <div style={styles.modalActions}>
              <button onClick={() => setDeleteChannelData(null)} style={{ ...styles.modalCancelBtn, opacity: isDeleting ? 0.5 : 1 }} disabled={isDeleting}>Cancel</button>
              <button onClick={confirmDelete} style={{ ...styles.modalDeleteBtn, opacity: isDeleting ? 0.5 : 1 }} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

const styles = {
  sidebar: { position: 'relative', width: 'var(--sidebar-width)', background: 'var(--bg-base)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', overflow: 'hidden' },
  resizer: { position: 'absolute', top: 0, right: -2, width: 4, height: '100%', cursor: 'col-resize', zIndex: 50, transition: 'background 0.2s, opacity 0.2s' },
  workspaceHeader: { padding: '12px 16px', flexShrink: 0, cursor: 'pointer', transition: 'background 0.15s' },
  workspaceName: { display: 'flex', alignItems: 'center', gap: 10 },
  wsIcon: { width: 34, height: 34, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0 },
  wsLabel: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  searchContainer: { padding: '0 12px 12px', flexShrink: 0 },
  searchInput: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid transparent', borderRadius: 6, padding: '6px 12px', fontSize: 13, color: 'var(--text-primary)', transition: 'border-color 0.2s', outline: 'none' },
  searchResults: { flex: 1, overflowY: 'auto' },
  searchGroup: { padding: '12px 16px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  searchItem: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 16px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', textAlign: 'left' },
  navIcons: { display: 'flex', gap: 4, padding: '0 12px 12px', flexShrink: 0 },
  navBtn: { width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s', background: 'none', border: 'none', cursor: 'pointer' },
  navBtnActive: { background: 'var(--accent-glow)', color: 'var(--accent)' },
  section: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  addBtn: { width: 20, height: 20, borderRadius: 4, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' },
  channelList: { flex: 1, overflowY: 'auto', padding: '0 12px' },
  channelItem: { display: 'flex', alignItems: 'center', gap: 6, width: 'calc(100% - 24px)', marginLeft: 24, padding: '6px 12px', borderRadius: 4, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left', position: 'relative', fontWeight: 400, marginBottom: 2 },
  channelActive: { background: 'var(--accent-glow)', color: 'var(--text-primary)', fontWeight: 500, boxShadow: 'inset 3px 0 0 var(--accent)' },
  wsRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, transition: 'background 0.15s', minHeight: 36, cursor: 'pointer' },
  wsRowHover: { background: 'var(--bg-surface)' },
  wsRowActive: { background: 'var(--bg-surface)' },
  collapseBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  wsIcon2: { width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
  wsLabel2: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  unreadDot: { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginLeft: 4 },
  actionIconBtn: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 800, lineHeight: 1 },
  dropdown: { position: 'absolute', right: 0, zIndex: 100, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
  dropdownBtn: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4, transition: 'background 0.1s' },
  unreadBadge: { background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, flexShrink: 0, lineHeight: 1 },
  chPrefix: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },
  chName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  newChForm: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  miniInput: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', width: '100%' },
  miniBtn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' },
  userFooter: { padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)', position: 'relative', flexShrink: 0 },
  statusDot: { position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--bg-base)' },
  userName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' },
  modalContent: { background: 'var(--bg-surface)', padding: 24, borderRadius: 12, width: 400, maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border-strong)' },
  modalTitle: { margin: '0 0 16px 0', fontSize: 18, color: 'var(--text-primary)' },
  modalDesc: { margin: '0 0 24px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 },
  renameInput: { background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: 6, padding: '8px 12px', fontSize: 15, color: 'var(--text-primary)', outline: 'none', width: '100%', fontFamily: 'var(--font-display)', fontWeight: 600 },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { padding: '8px 16px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 },
  modalSaveBtn: { padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 },
  modalDeleteBtn: { padding: '8px 16px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }
};
